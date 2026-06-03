import { scoreCandidateAgainstArchive } from './relevance.js';

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

export function selectWeeklyArticle(candidates, previouslyRecommended = [], now = new Date(), { archivePosts = [] } = {}) {
  const seen = new Set(previouslyRecommended);
  const fresh = candidates.filter((candidate) => !seen.has(candidate.id));
  const pool = fresh.length ? fresh : candidates;
  return pool
    .map((candidate) => {
      const scored = scoreArticle(candidate, now, archivePosts);
      return {
        candidate: { ...candidate, curationVotes: scored.votes },
        score: scored.total,
      };
    })
    .sort((a, b) => b.score - a.score)[0]?.candidate ?? null;
}

export function scoreArticle(candidate, now = new Date(), archivePosts = []) {
  const votes = articleVotingScorecard(candidate, now, archivePosts);
  return {
    total: votes.total,
    votes,
  };
}

export function articleVotingScorecard(article, now = new Date(), archivePosts = []) {
  const archiveInterestRaw = scoreCandidateAgainstArchive(articleForArchiveScoring(article), archivePosts);
  const archiveInterest = Math.min(35, archiveInterestRaw);
  const recency = recencyVote(article, now);
  const methodDiversity = methodologyVote(article);
  const discussionPotential = discussionVote(article);
  const total = archiveInterest + recency + methodDiversity + discussionPotential;
  return {
    total,
    archiveInterest,
    recency,
    methodDiversity,
    discussionPotential,
    archiveInterestRaw,
    methodSignals: detectMethodSignals(article).slice(0, 4),
    discussionSignals: detectDiscussionSignals(article).slice(0, 4),
  };
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

function recencyVote(article, now) {
  const ageDays = article.publicationDate ? daysBetween(new Date(article.publicationDate), now) : 365;
  if (ageDays <= 30) return 25;
  if (ageDays <= 90) return 20;
  if (ageDays <= 180) return 14;
  if (ageDays <= 365) return 8;
  return 3;
}

function methodologyVote(article) {
  const signals = detectMethodSignals(article);
  if (signals.length >= 4) return 20;
  if (signals.length >= 3) return 16;
  if (signals.length >= 2) return 12;
  if (signals.length === 1) return 7;
  return 3;
}

function discussionVote(article) {
  const signals = detectDiscussionSignals(article);
  const oaBoost = article.isOpenAccess ? 3 : 0;
  return Math.min(20, signals.length * 4 + oaBoost + Math.min(3, article.citedByCount ?? 0));
}

function articleForArchiveScoring(article) {
  return {
    title: article.title,
    summary: article.abstract,
    description: article.abstract,
    sourceLabel: article.source,
    topics: [
      article.source,
      ...(detectMethodSignals(article) ?? []),
      ...(detectDiscussionSignals(article) ?? []),
    ].filter(Boolean),
  };
}

function detectMethodSignals(article) {
  const text = articleText(article);
  const patterns = [
    ['design-based research', /\bdesign[- ]based|dbr\b/i],
    ['experiment/quasi-experiment', /\bexperiment|quasi[- ]experiment|randomized|control group|treatment\b/i],
    ['longitudinal', /\blongitudinal|over time|growth|trajectory\b/i],
    ['mixed methods', /\bmixed[- ]methods?|qualitative and quantitative\b/i],
    ['qualitative', /\binterview|ethnograph|case stud|thematic|qualitative\b/i],
    ['computational/LA', /\blearning analytics|log data|trace data|modeling|classifier|network analysis|sequence analysis\b/i],
    ['review/synthesis', /\bsystematic review|meta[- ]analysis|scoping review|literature review|synthesis\b/i],
  ];
  return matchingLabels(text, patterns);
}

function detectDiscussionSignals(article) {
  const text = articleText(article);
  const patterns = [
    ['AI/automation', /\bAI\b|artificial intelligence|generative|LLM|algorithm|automation/i],
    ['collaboration/CSCL', /\bcollaboration|collaborative|cscl|group work|peer\b/i],
    ['equity/ethics', /\bequity|ethic|bias|justice|access|inclusion|privacy\b/i],
    ['assessment/feedback', /\bassessment|feedback|rubric|evaluation|formative\b/i],
    ['teacher/practice', /\bteacher|instruction|classroom|pedagog|practice\b/i],
    ['theory/mechanism', /\bmechanism|theory|conceptual|epistemic|motivation|self[- ]regulated\b/i],
  ];
  return matchingLabels(text, patterns);
}

function matchingLabels(text, patterns) {
  return patterns
    .filter(([, pattern]) => pattern.test(text))
    .map(([label]) => label);
}

function articleText(article) {
  return [article.title, article.abstract, article.source].filter(Boolean).join(' ');
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
