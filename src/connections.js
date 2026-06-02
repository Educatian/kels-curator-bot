import { rankPostsForQuery, relatedOriginals } from './relevance.js';

export function buildConnectionSuggestions({ topics = [], posts = [], limit = 3, minRelevance = 1 } = {}) {
  const cleanTopics = Array.from(new Set(
    topics.map((topic) => String(topic ?? '').trim()).filter(Boolean),
  ));
  if (!cleanTopics.length || !posts.length) {
    return {
      topics: cleanTopics,
      originals: [],
      prompt: '',
    };
  }

  const query = cleanTopics.join(' ');
  const ranked = rankPostsForQuery(query, posts, { limit: Math.max(limit * 3, 8) });
  const originals = relatedOriginals(ranked, { limit, minRelevance });
  return {
    topics: cleanTopics,
    originals,
    prompt: buildConnectionPrompt(cleanTopics, originals),
  };
}

export function formatConnectionSuggestions(suggestions, {
  emptyText = '아직 이 관심사와 강하게 연결되는 최근 KELS 원문을 찾지 못했습니다.',
} = {}) {
  if (!suggestions?.topics?.length) return '';
  const lines = [
    '',
    `관심사 연결: ${suggestions.topics.map((topic) => `\`${topic}\``).join(', ')}`,
  ];

  if (!suggestions.originals.length) {
    lines.push(emptyText);
    lines.push('관련 글이 올라오면 `/profile` 기반 DM 알림으로 이어집니다.');
    return lines.join('\n');
  }

  lines.push('최근 관련 원문:');
  lines.push(...suggestions.originals.map((item, index) => (
    `${index + 1}. #${item.channelName} (${String(item.createdAt ?? '').slice(0, 10)}, 관련도 ${item.relevance}) ${item.url}`
  )));
  if (suggestions.prompt) lines.push(`연결 질문: ${suggestions.prompt}`);
  return lines.join('\n');
}

function buildConnectionPrompt(topics, originals) {
  const topicText = topics.slice(0, 3).join(', ');
  if (!originals.length) {
    return `${topicText} 관련 글이 올라오면 어떤 자료, CFP, 또는 협업 기회를 먼저 보고 싶은지 남겨보세요.`;
  }
  const channels = Array.from(new Set(originals.map((item) => item.channelName))).slice(0, 3);
  return `${topicText} 관심사가 ${channels.map((name) => `#${name}`).join(', ')} 흐름과 연결됩니다. 이 중 하나를 내 연구/수업 맥락에 어떻게 옮길 수 있을까요?`;
}
