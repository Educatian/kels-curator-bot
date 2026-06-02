import { XMLParser } from 'fast-xml-parser';

export const DEFAULT_TECH_SIGNAL_QUERY = [
  '(cat:cs.AI OR cat:cs.CL OR cat:cs.LG OR cat:cs.HC OR cat:stat.ML)',
  '(all:LLM OR all:RAG OR all:agent OR all:multimodal OR all:evaluation OR all:alignment OR all:tutor OR all:education)',
].join(' AND ');

const TECH_KEYWORDS = [
  'llm',
  'large language model',
  'rag',
  'retrieval',
  'agent',
  'multimodal',
  'evaluation',
  'alignment',
  'benchmark',
  'tutor',
  'education',
  'human-ai',
  'feedback',
  'reasoning',
  'personalization',
];

export async function fetchCandidateTechPapers({
  query = DEFAULT_TECH_SIGNAL_QUERY,
  days = 14,
  maxResults = 30,
  now = new Date(),
  fetchImpl = fetch,
} = {}) {
  const params = new URLSearchParams({
    search_query: query,
    start: '0',
    max_results: String(maxResults),
    sortBy: 'submittedDate',
    sortOrder: 'descending',
  });
  const response = await fetchImpl(`https://export.arxiv.org/api/query?${params.toString()}`, {
    headers: { 'user-agent': 'kels-curator-bot/0.1.0 (mailto optional)' },
  });
  if (!response.ok) {
    throw new Error(`arXiv request failed: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    textNodeName: 'text',
  });
  const parsed = parser.parse(xml);
  const entries = asArray(parsed.feed?.entry);
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);

  return entries
    .map(normalizeArxivEntry)
    .filter(Boolean)
    .filter((paper) => !paper.publishedAt || new Date(paper.publishedAt) >= cutoff);
}

export function selectWeeklyTechPaper(candidates, previouslyRecommended = [], now = new Date()) {
  const seen = new Set(previouslyRecommended);
  const fresh = candidates.filter((candidate) => !seen.has(candidate.id));
  const pool = fresh.length ? fresh : candidates;
  return pool
    .map((candidate) => ({
      candidate,
      score: scoreTechPaper(candidate, now),
    }))
    .sort((a, b) => b.score - a.score)[0]?.candidate ?? null;
}

export function normalizeArxivEntry(entry) {
  if (!entry?.id || !entry?.title) return null;
  const links = asArray(entry.link);
  const abstractUrl = String(entry.id).trim();
  const pdfUrl = links.find((link) => link.title === 'pdf' || link.type === 'application/pdf')?.href
    ?? abstractUrl.replace('/abs/', '/pdf/');
  const categories = asArray(entry.category)
    .map((category) => category.term)
    .filter(Boolean);
  const authors = asArray(entry.author)
    .map((author) => author.name)
    .filter(Boolean)
    .slice(0, 4);

  return {
    id: abstractUrl,
    title: clean(entry.title),
    summary: clean(entry.summary),
    publishedAt: entry.published ?? '',
    updatedAt: entry.updated ?? '',
    categories,
    authors,
    url: abstractUrl,
    pdfUrl,
    primaryCategory: categories[0] ?? '',
  };
}

export function buildTechPaperReason(paper) {
  const reasons = [];
  const text = `${paper.title} ${paper.summary}`.toLowerCase();
  const matched = TECH_KEYWORDS.filter((keyword) => text.includes(keyword)).slice(0, 4);
  if (matched.length) reasons.push(`tech signal: ${matched.join(', ')}`);
  if (paper.primaryCategory) reasons.push(`arXiv ${paper.primaryCategory}`);
  if (paper.publishedAt) reasons.push(`submitted ${paper.publishedAt.slice(0, 10)}`);
  return reasons.join(' · ') || 'recent arXiv tech paper with KELS relevance';
}

function scoreTechPaper(paper, now) {
  const text = `${paper.title} ${paper.summary}`.toLowerCase();
  const keywordScore = TECH_KEYWORDS.reduce((score, keyword) => (
    text.includes(keyword) ? score + keywordWeight(keyword) : score
  ), 0);
  const categoryScore = categoryWeight(paper.categories);
  const ageDays = paper.publishedAt ? daysBetween(new Date(paper.publishedAt), now) : 30;
  const recencyScore = Math.max(0, 30 - ageDays);
  const titleBoost = TECH_KEYWORDS.some((keyword) => paper.title.toLowerCase().includes(keyword)) ? 20 : 0;
  return keywordScore + categoryScore + recencyScore + titleBoost;
}

function categoryWeight(categories = []) {
  const joined = categories.join(' ');
  let score = 0;
  if (joined.includes('cs.AI')) score += 18;
  if (joined.includes('cs.CL')) score += 18;
  if (joined.includes('cs.LG')) score += 14;
  if (joined.includes('cs.HC')) score += 20;
  if (joined.includes('stat.ML')) score += 10;
  return score;
}

function keywordWeight(keyword) {
  if (['tutor', 'education', 'feedback', 'human-ai', 'personalization'].includes(keyword)) return 18;
  if (['rag', 'agent', 'multimodal', 'evaluation', 'alignment'].includes(keyword)) return 14;
  return 10;
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function daysBetween(date, now) {
  return Math.floor((new Date(now) - date) / (1000 * 60 * 60 * 24));
}
