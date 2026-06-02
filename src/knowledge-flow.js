const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'about', 'into', 'are', 'was', 'were',
  'have', 'has', 'will', 'can', 'could', 'should', 'would', 'you', 'your', 'our', 'their',
  'https', 'http', 'www', 'com', 'org', 'edu', 'discord', 'kels',
  'details', 'search', 'jobcode', 'title', 'utm', 'ref', 'html', 'cfm',
  '안녕하세요', '합니다', '있는', '관련', '공유', '드립니다', '입니다',
]);

const TOPIC_ALIASES = [
  ['AIED', /\baied\b|ai education|인공지능교육/i],
  ['learning-analytics', /learning analytics|\bLA\b|학습분석/i],
  ['CSCL', /\bcscl\b|computer-supported collaborative learning|협력학습/i],
  ['instructional-design', /instructional design|learning design|교육공학|수업설계/i],
  ['GenAI', /\bgenai\b|generative ai|llm|large language model|생성형/i],
  ['RAG', /\brag\b|retrieval augmented generation|검색증강/i],
  ['AI-ethics', /ai ethics|responsible ai|윤리/i],
  ['XR', /\bxr\b|\bvr\b|\bar\b|virtual reality|augmented reality/i],
  ['assessment', /assessment|evaluation|평가/i],
  ['feedback', /feedback|피드백/i],
  ['faculty-jobs', /faculty|professor|assistant professor|교수|채용/i],
  ['CFP', /\bcfp\b|call for|special issue|마감|논문모집/i],
];

export function buildKnowledgeFlow(posts, { limit = 8 } = {}) {
  const topicMap = new Map();
  const channelCounts = new Map();
  const categoryCounts = new Map();
  const recentPosts = [...posts].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  for (const post of recentPosts) {
    increment(channelCounts, post.channelName || 'unknown');
    increment(categoryCounts, normalizeCategory(post.category));
    for (const topic of topicsForPost(post)) {
      const entry = topicMap.get(topic) ?? {
        topic,
        count: 0,
        categories: new Set(),
        channels: new Set(),
        posts: [],
      };
      entry.count += 1;
      entry.categories.add(normalizeCategory(post.category));
      entry.channels.add(post.channelName || 'unknown');
      if (entry.posts.length < 3) entry.posts.push(post);
      topicMap.set(topic, entry);
    }
  }

  const topics = Array.from(topicMap.values())
    .map((entry) => ({
      topic: entry.topic,
      count: entry.count,
      categoryCount: entry.categories.size,
      channelCount: entry.channels.size,
      categories: Array.from(entry.categories).sort(),
      channels: Array.from(entry.channels).sort(),
      posts: entry.posts,
      score: entry.count + entry.categories.size * 2 + entry.channels.size,
    }))
    .sort((a, b) => b.score - a.score || b.count - a.count)
    .slice(0, limit);

  const bridgeOpportunities = topics
    .filter((topic) => topic.categoryCount >= 2 || topic.channelCount >= 2)
    .slice(0, 4)
    .map((topic) => ({
      topic: topic.topic,
      categories: topic.categories.slice(0, 3),
      channels: topic.channels.slice(0, 3),
      prompt: bridgePrompt(topic),
    }));

  return {
    totalPosts: posts.length,
    categoryCounts: sortedCounts(categoryCounts),
    channelCounts: sortedCounts(channelCounts).slice(0, 6),
    topics,
    bridgeOpportunities,
    participationPrompts: participationPrompts(topics, recentPosts).slice(0, 3),
    evidencePosts: evidencePosts(topics).slice(0, 5),
  };
}

export function buildParticipationNudge({ title = '', issueTopic = '', kind = 'item' } = {}) {
  const base = issueTopic || title || kind;
  return [
    `내 연구/수업 맥락에서 ${shorten(base, 72)}을 어떻게 바꿔 쓸 수 있을까요?`,
    '댓글로 “적용 가능 장면 1개” 또는 “걱정되는 한계 1개”만 남겨도 토론이 시작됩니다.',
  ].join('\n');
}

function topicsForPost(post) {
  const text = [post.content, post.channelName, post.category, ...(post.tags ?? [])].join(' ');
  const topics = new Set();
  for (const [label, pattern] of TOPIC_ALIASES) {
    if (pattern.test(text)) topics.add(label);
  }
  for (const tag of post.tags ?? []) topics.add(cleanTopic(tag));
  for (const token of tokenize(text).slice(0, 20)) {
    if (isUsefulTopicToken(token)) topics.add(cleanTopic(token));
  }
  return Array.from(topics).filter(Boolean);
}

function participationPrompts(topics, posts) {
  const prompts = [];
  for (const topic of topics.slice(0, 3)) {
    prompts.push(`#${topic.topic}: 이 주제를 실제 연구 설계, 수업 적용, 또는 협업 아이디어로 연결하면 무엇이 먼저 필요할까요?`);
  }
  const deadlinePost = posts.find((post) => /deadline|마감|cfp|call/i.test(post.content ?? ''));
  if (deadlinePost) prompts.push('최근 마감/공고 중 KELS 회원이 함께 준비하면 좋은 항목이 있는지 thread에서 표시해 주세요.');
  return prompts;
}

function bridgePrompt(topic) {
  return `#${topic.topic} 흐름이 ${topic.categories.join(', ')}와 연결됩니다. 자료 공유를 넘어 공동 읽기/공동 지원 thread로 묶을 수 있습니다.`;
}

function evidencePosts(topics) {
  const seen = new Set();
  const posts = [];
  for (const topic of topics) {
    for (const post of topic.posts) {
      if (seen.has(post.id)) continue;
      seen.add(post.id);
      posts.push({ topic: topic.topic, post });
    }
  }
  return posts;
}

function tokenize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKC')
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function isUsefulTopicToken(token) {
  return [
    'ai', 'aied', 'cscl', 'analytics', 'learning', 'education', 'design', 'feedback',
    'assessment', 'ethics', 'rag', 'llm', 'xr', 'faculty', 'cfp', 'grant', 'doctoral', 'postdoc',
  ].some((keyword) => token === keyword || token.includes(keyword));
}

function cleanTopic(value) {
  return String(value ?? '')
    .replace(/^#/, '')
    .replace(/[^\p{L}\p{N}_/-]/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 36);
}

function normalizeCategory(category) {
  if (category === 'job') return 'jobs';
  if (category === 'seminar') return 'seminars';
  if (category === 'resource') return 'resources';
  if (category === 'event') return 'events';
  return category || 'general';
}

function increment(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortedCounts(map) {
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function shorten(value, max) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length <= max ? text : `${text.slice(0, max - 3).trim()}...`;
}
