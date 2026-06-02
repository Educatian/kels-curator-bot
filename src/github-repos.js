export const DEFAULT_GITHUB_REPO_QUERIES = [
  'llm education',
  'rag education',
  'ai agent education',
  'learning analytics',
  'multimodal learning',
  'ai tutor',
];

const REPO_KEYWORDS = [
  'llm',
  'rag',
  'agent',
  'education',
  'learning',
  'analytics',
  'tutor',
  'feedback',
  'evaluation',
  'multimodal',
  'benchmark',
  'open-source',
  'dataset',
];

export async function fetchCandidateGithubRepos({
  queries = DEFAULT_GITHUB_REPO_QUERIES,
  days = 14,
  minStars = 100,
  perPage = 8,
  now = new Date(),
  fetchImpl = fetch,
} = {}) {
  const since = isoDaysAgo(days, now);
  const candidates = [];
  const queryList = Array.isArray(queries) ? queries : [queries];

  for (const query of queryList.filter(Boolean).slice(0, 8)) {
    const params = new URLSearchParams({
      q: `${query} stars:>=${minStars} pushed:>=${since}`,
      sort: 'stars',
      order: 'desc',
      per_page: String(perPage),
    });
    const response = await fetchImpl(`https://api.github.com/search/repositories?${params.toString()}`, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'kels-curator-bot/0.1.0',
      },
    });
    if (!response.ok) {
      throw new Error(`GitHub repository search failed: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    candidates.push(...(data.items ?? []).map(normalizeGithubRepo).filter(Boolean));
  }

  return dedupeRepos(candidates);
}

export function normalizeGithubRepo(item) {
  if (!item?.html_url || !item?.full_name) return null;
  return {
    id: String(item.full_name).toLowerCase(),
    kind: 'github',
    title: item.full_name,
    nameWithOwner: item.full_name,
    description: clean(item.description),
    summary: clean(item.description),
    url: item.html_url,
    stars: Number(item.stargazers_count ?? 0),
    forks: Number(item.forks_count ?? 0),
    language: item.language ?? '',
    topics: Array.isArray(item.topics) ? item.topics.slice(0, 10) : [],
    pushedAt: item.pushed_at ?? '',
    createdAt: item.created_at ?? '',
    sourceLabel: 'GitHub',
  };
}

export function selectWeeklyGithubRepo(candidates, previouslyRecommended = [], now = new Date()) {
  const seen = new Set(previouslyRecommended.map((id) => String(id).toLowerCase()));
  const fresh = candidates.filter((candidate) => !seen.has(candidate.id));
  const pool = fresh.length ? fresh : candidates;
  return pool
    .map((candidate) => ({ candidate, score: scoreGithubRepo(candidate, now) }))
    .sort((a, b) => b.score - a.score)[0]?.candidate ?? null;
}

export function scoreGithubRepo(repo, now = new Date()) {
  const text = `${repo.title} ${repo.description ?? ''} ${(repo.topics ?? []).join(' ')}`.toLowerCase();
  const keywordScore = REPO_KEYWORDS.reduce((score, keyword) => (
    text.includes(keyword) ? score + keywordWeight(keyword) : score
  ), 0);
  const stars = Math.min(45, Math.log10(Math.max(1, repo.stars)) * 12);
  const forks = Math.min(15, Math.log10(Math.max(1, repo.forks + 1)) * 5);
  const ageDays = repo.pushedAt ? daysBetween(new Date(repo.pushedAt), now) : 30;
  const recency = Math.max(0, 30 - ageDays);
  return keywordScore + stars + forks + recency;
}

export function buildGithubRepoReason(repo) {
  const reasons = [];
  if (repo.stars) reasons.push(`${repo.stars.toLocaleString('en-US')} stars`);
  if (repo.language) reasons.push(repo.language);
  const matched = REPO_KEYWORDS
    .filter((keyword) => `${repo.title} ${repo.description} ${(repo.topics ?? []).join(' ')}`.toLowerCase().includes(keyword))
    .slice(0, 4);
  if (matched.length) reasons.push(`signal: ${matched.join(', ')}`);
  if (repo.pushedAt) reasons.push(`updated ${repo.pushedAt.slice(0, 10)}`);
  return reasons.join(' · ') || 'recent open-source AI repository with KELS relevance';
}

function dedupeRepos(repos) {
  const seen = new Set();
  return repos.filter((repo) => {
    if (seen.has(repo.id)) return false;
    seen.add(repo.id);
    return true;
  });
}

function isoDaysAgo(days, now) {
  const date = new Date(now);
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function keywordWeight(keyword) {
  if (['education', 'learning', 'analytics', 'tutor', 'feedback'].includes(keyword)) return 18;
  if (['rag', 'agent', 'multimodal', 'evaluation', 'benchmark'].includes(keyword)) return 14;
  return 10;
}

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function daysBetween(date, now) {
  return Math.floor((new Date(now) - date) / (1000 * 60 * 60 * 24));
}
