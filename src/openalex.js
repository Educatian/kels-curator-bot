export const KELS_JOURNAL_SOURCES = [
  { id: 'S42640028', name: 'Journal of the Learning Sciences' },
  { id: 'S64184962', name: 'International Journal of Computer-Supported Collaborative Learning' },
  { id: 'S114840262', name: 'Educational Technology Research and Development' },
  { id: 'S143778727', name: 'Instructional Science' },
  { id: 'S202575634', name: 'Cognition and Instruction' },
];

const SELECT_FIELDS = [
  'id',
  'display_name',
  'publication_date',
  'cited_by_count',
  'primary_location',
  'authorships',
  'open_access',
  'abstract_inverted_index',
].join(',');

export async function fetchCandidateArticles({
  days = 365,
  perPage = 50,
  mailto = '',
  now = new Date(),
  fetchImpl = fetch,
} = {}) {
  const fromDate = isoDaysAgo(days, now);
  const sourceFilter = KELS_JOURNAL_SOURCES.map((source) => source.id).join('|');
  const params = new URLSearchParams({
    filter: `primary_location.source.id:${sourceFilter},from_publication_date:${fromDate}`,
    sort: 'publication_date:desc',
    'per-page': String(perPage),
    select: SELECT_FIELDS,
  });
  if (mailto) params.set('mailto', mailto);

  const response = await fetchImpl(`https://api.openalex.org/works?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`OpenAlex request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return (data.results ?? []).map(normalizeOpenAlexWork).filter(Boolean);
}

export function selectWeeklyArticle(candidates, previouslyRecommended = [], now = new Date()) {
  const seen = new Set(previouslyRecommended);
  const fresh = candidates.filter((candidate) => !seen.has(candidate.id));
  const pool = fresh.length ? fresh : candidates;
  return pool
    .map((candidate) => ({
      candidate,
      score: scoreArticle(candidate, now),
    }))
    .sort((a, b) => b.score - a.score)[0]?.candidate ?? null;
}

export function normalizeOpenAlexWork(work) {
  if (!work?.id || !work?.display_name) return null;
  const source = work.primary_location?.source?.display_name ?? 'Unknown journal';
  const url = work.primary_location?.landing_page_url ?? work.id;
  const authors = (work.authorships ?? [])
    .slice(0, 3)
    .map((authorship) => authorship.author?.display_name)
    .filter(Boolean);
  const moreAuthors = (work.authorships ?? []).length > authors.length;

  return {
    id: work.id,
    title: work.display_name,
    publicationDate: work.publication_date ?? '',
    citedByCount: work.cited_by_count ?? 0,
    source,
    url,
    isOpenAccess: Boolean(work.open_access?.is_oa),
    authors: moreAuthors ? [...authors, 'et al.'] : authors,
    abstract: reconstructAbstract(work.abstract_inverted_index),
  };
}

export function buildRecommendationReason(article) {
  const reasons = [];
  if (article.isOpenAccess) reasons.push('open access');
  if (article.publicationDate) reasons.push(`recent publication (${article.publicationDate})`);
  if (article.source) reasons.push(article.source);
  return reasons.length ? reasons.join(' · ') : 'selected from the KELS journal watchlist';
}

function scoreArticle(article, now) {
  const ageDays = article.publicationDate ? daysBetween(new Date(article.publicationDate), now) : 365;
  const recency = Math.max(0, 365 - ageDays);
  const oaBoost = article.isOpenAccess ? 50 : 0;
  return recency + oaBoost + Math.min(article.citedByCount, 50);
}

function reconstructAbstract(index) {
  if (!index) return '';
  const words = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions) {
      words[position] = word;
    }
  }
  return words.filter(Boolean).join(' ');
}

function isoDaysAgo(days, now) {
  const date = new Date(now);
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(date, now) {
  return Math.floor((new Date(now) - date) / (1000 * 60 * 60 * 24));
}
