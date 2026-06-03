const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'about', 'into', 'are', 'was', 'were',
  'kels', 'https', 'http', 'com', 'www', 'discord',
]);

export function inferArchiveFilters(query, category = 'all') {
  const text = String(query ?? '').toLowerCase();
  let inferredCategory = category || 'all';
  if (inferredCategory === 'all') {
    if (/\b(cfp|call|proposal|special issue|deadline|rfp)\b|공모|논문모집|마감/.test(text)) inferredCategory = 'cfp';
    if (/\b(job|faculty|professor|postdoc|hiring|position)\b|채용|교수|임용/.test(text)) inferredCategory = 'jobs';
    if (/\b(seminar|webinar|workshop|zoom|talk)\b|세미나|웨비나|강연/.test(text)) inferredCategory = 'seminars';
  }

  let days = 365;
  if (/최근|latest|recent|new|이번/.test(text)) days = 120;
  if (/이번\s*주|this week/.test(text)) days = 14;
  if (/이번\s*달|this month/.test(text)) days = 45;

  return { category: inferredCategory, days };
}

export function rankPostsForQuery(query, posts, { limit = 8 } = {}) {
  const queryTokens = tokenize(query);
  return posts
    .map((post) => ({ ...post, relevance: scorePost(queryTokens, post) }))
    .sort((a, b) => b.relevance - a.relevance || String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit);
}

export function relatedOriginals(posts, { limit = 3, minRelevance = 1 } = {}) {
  return posts
    .filter((post) => (post.relevance ?? 0) >= minRelevance)
    .slice(0, limit)
    .map((post) => ({
      title: postTitle(post),
      channelName: post.channelName,
      createdAt: post.createdAt,
      relevance: post.relevance ?? 0,
      url: postUrl(post),
    }));
}

export function archiveEvidenceStatus(posts, { weakEvidence = false, minStrongRelevance = 4 } = {}) {
  const usablePosts = posts.filter((post) => (post.relevance ?? 0) > 0);
  const topRelevance = usablePosts[0]?.relevance ?? 0;
  if (weakEvidence || !usablePosts.length) {
    return {
      label: '근거 부족',
      confidence: '낮음',
      topRelevance,
      usableCount: usablePosts.length,
      reason: 'archive에서 질문과 직접 맞는 원문이 충분히 잡히지 않았습니다.',
    };
  }
  if (topRelevance >= minStrongRelevance && usablePosts.length >= 2) {
    return {
      label: '근거 충분',
      confidence: '높음',
      topRelevance,
      usableCount: usablePosts.length,
      reason: '여러 원문이 질문 핵심어와 겹치며 답변 근거로 사용할 수 있습니다.',
    };
  }
  return {
    label: '근거 제한적',
    confidence: '중간',
    topRelevance,
    usableCount: usablePosts.length,
    reason: '관련 원문은 있으나 범위가 좁아 답변을 조심스럽게 읽어야 합니다.',
  };
}

export function scoreCandidateAgainstArchive(candidate, posts) {
  const tokens = tokenize([
    candidate.title,
    candidate.summary,
    candidate.description,
    candidate.sourceLabel,
    ...(candidate.topics ?? []),
    ...(candidate.categories ?? []),
  ].filter(Boolean).join(' '));
  if (!tokens.length || !posts.length) return 0;
  const ranked = posts.map((post) => scorePost(tokens, post)).sort((a, b) => b - a);
  return ranked.slice(0, 5).reduce((sum, value) => sum + Math.min(10, value), 0);
}

export function formatRelatedOriginals(originals) {
  if (!originals.length) return '';
  return [
    '',
    '관련 원문 3개:',
    ...originals.map((item, index) => (
      `${index + 1}. #${item.channelName} (${String(item.createdAt ?? '').slice(0, 10)}, 관련도 ${item.relevance}) ${item.url}`
    )),
  ].join('\n');
}

export function formatArchiveEvidencePanel(originals, evidenceStatus = null) {
  if (!originals.length && !evidenceStatus) return '';
  const statusLines = evidenceStatus
    ? [
      `근거 상태: ${evidenceStatus.label} · 신뢰도 ${evidenceStatus.confidence} · 사용 가능 원문 ${evidenceStatus.usableCount}개 · 최고 관련도 ${evidenceStatus.topRelevance}`,
      `판단: ${evidenceStatus.reason}`,
    ]
    : [];
  const originalLines = originals.length
    ? [
      '관련 원문:',
      ...originals.map((item, index) => (
        `${index + 1}. #${item.channelName} · ${String(item.createdAt ?? '').slice(0, 10)} · 관련도 ${item.relevance}\n   ${item.url}`
      )),
    ]
    : ['관련 원문: 표시할 만큼 직접적인 원문이 없습니다.'];
  return [
    '',
    '---',
    'Archive Q&A 신뢰도',
    ...statusLines,
    ...originalLines,
  ].join('\n');
}

function scorePost(tokens, post) {
  const haystack = tokenize([
    post.content,
    post.channelName,
    post.category,
    ...(post.tags ?? []),
    ...(post.urls ?? []),
  ].join(' '));
  const counts = new Map();
  for (const token of haystack) counts.set(token, (counts.get(token) ?? 0) + 1);
  let score = 0;
  for (const token of tokens) {
    if (counts.has(token)) score += Math.min(3, counts.get(token));
  }
  return score;
}

function tokenize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKC')
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token))
    .slice(0, 120);
}

function postTitle(post) {
  return String(post.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 90);
}

function postUrl(post) {
  return `https://discord.com/channels/${post.guildId}/${post.channelId}/${post.id}`;
}
