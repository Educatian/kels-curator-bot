import { buildConnectionSuggestions, formatConnectionSuggestions } from './connections.js';
import { rankPostsForQuery, relatedOriginals } from './relevance.js';

export function buildOnboardingPathway({ profile = {}, posts = [], limit = 3 } = {}) {
  const interests = cleanList(profile.interests);
  const lookingFor = cleanList(profile.lookingFor);
  const queryParts = [...interests, ...lookingFor, profile.stage, profile.affiliation].filter(Boolean);
  const query = queryParts.join(' ');
  const ranked = query ? rankPostsForQuery(query, posts, { limit: 12 }) : [];
  const connectionSuggestions = buildConnectionSuggestions({
    topics: interests.length ? interests : lookingFor,
    posts,
    limit,
    minRelevance: 1,
  });
  const participationTargets = relatedOriginals(ranked, { limit: 2, minRelevance: 1 });

  return {
    interests,
    lookingFor,
    connectionSuggestions,
    participationTargets,
    firstCommentDrafts: buildFirstCommentDrafts({ profile, participationTargets }),
    followUpPrompt: buildFollowUpPrompt({ interests, lookingFor }),
  };
}

export function formatOnboardingPathway(pathway) {
  if (!pathway) return '';
  const lines = [];
  const connectionText = formatConnectionSuggestions(pathway.connectionSuggestions, {
    emptyText: '아직 자기소개 관심사와 강하게 연결되는 최근 원문은 적지만, 앞으로 관련 글이 올라오면 개인 알림과 추천으로 이어집니다.',
  });
  if (connectionText) lines.push(connectionText);

  if (pathway.participationTargets?.length) {
    lines.push('', '참여해볼 만한 thread/원문:');
    lines.push(...pathway.participationTargets.map((item, index) => (
      `${index + 1}. #${item.channelName} (${String(item.createdAt ?? '').slice(0, 10)}, 관련도 ${item.relevance}) ${item.url}`
    )));
  }

  if (pathway.firstCommentDrafts?.length) {
    lines.push('', '첫 댓글 draft:');
    lines.push(...pathway.firstCommentDrafts.map((draft, index) => `${index + 1}. ${draft}`));
  }

  if (pathway.followUpPrompt) {
    lines.push('', `1주 뒤 follow-up: ${pathway.followUpPrompt}`);
  }
  return lines.join('\n');
}

export function buildOnboardingFollowupMessage(item, pathway = null) {
  const name = item.fullName || '새 회원';
  const topics = cleanList(item.interests);
  const lines = [
    `${name} 님, KELS 온보딩 follow-up입니다.`,
    topics.length
      ? `지난 자기소개에서 ${topics.map((topic) => `\`${topic}\``).join(', ')} 관심사를 확인했어요.`
      : '지난 자기소개 이후 관심사를 조금 더 구체화해볼 수 있을 것 같아요.',
    '`/profile action:add topic:<관심주제>`로 관심사를 저장해두면 관련 글이 올라올 때 개인 알림을 받을 수 있습니다.',
  ];

  if (pathway?.participationTargets?.length) {
    lines.push('', '다시 연결해볼 만한 최근 원문:');
    lines.push(...pathway.participationTargets.map((target, index) => (
      `${index + 1}. #${target.channelName} (${String(target.createdAt ?? '').slice(0, 10)}) ${target.url}`
    )));
  }

  lines.push('', '이번 주에는 관심 주제와 연결되는 글 하나에 질문이나 적용 아이디어 한 줄만 남겨보셔도 좋습니다.');
  return lines.join('\n');
}

function buildFirstCommentDrafts({ profile, participationTargets }) {
  const interests = cleanList(profile.interests);
  const topicText = interests.slice(0, 2).join(', ') || '제 관심 주제';
  const baseDrafts = [
    `${topicText} 관점에서 이 자료를 읽어보니, 실제 연구/수업 설계에 적용하려면 어떤 맥락 조건을 먼저 확인해야 할지 궁금합니다.`,
    `이 글과 관련해서 KELS 회원분들은 어떤 데이터, 방법론, 또는 사례를 함께 보면 좋다고 생각하시나요?`,
  ];

  if (participationTargets?.[0]?.channelName) {
    baseDrafts.unshift(`#${participationTargets[0].channelName} 흐름과 연결해서, ${topicText} 쪽으로 더 읽어볼 만한 자료가 있다면 추천받고 싶습니다.`);
  }
  return baseDrafts.slice(0, 3);
}

function buildFollowUpPrompt({ interests, lookingFor }) {
  const focus = interests.length ? interests.slice(0, 2).join(', ') : lookingFor.slice(0, 2).join(', ');
  if (!focus) return '관심 주제나 찾는 정보를 하나 추가하면 KELS archive와 더 잘 연결해드릴 수 있습니다.';
  return `${focus} 관련해서 이번 주에 원문 하나를 읽거나 thread 하나에 질문을 남겨보는 것을 제안합니다.`;
}

function cleanList(value) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean))).slice(0, 8)
    : [];
}
