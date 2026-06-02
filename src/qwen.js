const DEFAULT_OPTIONS = {
  temperature: 0.2,
  top_p: 0.9,
  num_ctx: 4096,
};

export function createQwenClient(config, fetchImpl = fetch) {
  const enabled = Boolean(config.qwenEnabled);
  const baseUrl = (config.qwenBaseUrl ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
  const model = config.qwenModel ?? 'qwen2.5-coder:7b';
  const timeoutMs = config.qwenTimeoutMs ?? 20000;

  return {
    enabled,
    model,
    async generateJson(prompt, fallback, { schemaHint = '', options = {} } = {}) {
      if (!enabled) return fallback;
      try {
        const text = await generateOllama({
          baseUrl,
          model,
          prompt: withJsonInstructions(prompt, schemaHint),
          timeoutMs,
          options,
          fetchImpl,
        });
        return parseJsonObject(text) ?? fallback;
      } catch (error) {
        console.warn(`Qwen JSON generation failed: ${error.message}`);
        return fallback;
      }
    },
    async generateText(prompt, fallback, { options = {} } = {}) {
      if (!enabled) return fallback;
      try {
        return await generateOllama({
          baseUrl,
          model,
          prompt,
          timeoutMs,
          options,
          fetchImpl,
        });
      } catch (error) {
        console.warn(`Qwen text generation failed: ${error.message}`);
        return fallback;
      }
    },
  };
}

export async function summarizeArticleWithQwen(qwen, article) {
  const fallback = null;
  const result = await qwen.generateJson(articlePrompt(article), fallback, {
    schemaHint: '{"problem":"이 논문이 다루는 학습/설계 문제는 ...","contribution":"핵심 주장 또는 기여는 ...","method":"방법론 포인트는 ...","kelsApplication":"KELS 연구자가 가져갈 수 있는 연구 아이디어는 ...","readingLens":"읽을 때 주의해서 볼 쟁점은 ...","issueTopic":"KELS에서 토론할 만한 이슈테이킹 토픽은 ...","questions":["토론 질문 1","토론 질문 2"]}',
    options: { num_predict: 760 },
  });
  if (!result) return null;
  return {
    problem: cleanText(result.problem, 300),
    contribution: cleanText(result.contribution ?? result.claim, 320),
    method: cleanText(result.method, 300),
    kelsApplication: cleanText(result.kelsApplication ?? result.whyKels, 360),
    readingLens: cleanText(result.readingLens, 300),
    issueTopic: cleanText(result.issueTopic, 260),
    questions: Array.isArray(result.questions)
      ? result.questions.map((item) => cleanText(item, 180)).filter(Boolean).slice(0, 2)
      : [],
  };
}

export async function suggestForumWithQwen(qwen, post, currentTitle) {
  const fallback = null;
  const result = await qwen.generateJson(forumPrompt(post, currentTitle), fallback, {
    schemaHint: '{"title":"[CFP] Short useful title","tags":["AIED","deadline"],"rationale":"..."}',
    options: { num_predict: 220 },
  });
  if (!result) return null;
  return {
    title: cleanText(result.title, 95),
    tags: Array.isArray(result.tags)
      ? result.tags.map((tag) => cleanTag(tag)).filter(Boolean).slice(0, 6)
      : [],
    rationale: cleanText(result.rationale, 240),
  };
}

export async function explainProfileMatchWithQwen(qwen, post, topics) {
  const fallback = '';
  const result = await qwen.generateJson(profilePrompt(post, topics), null, {
    schemaHint: '{"reason":"..."}',
    options: { num_predict: 160 },
  });
  return cleanText(result?.reason, 360) || fallback;
}

export async function answerArchiveQuestionWithQwen(qwen, query, posts) {
  const fallback = archiveFallback(query, posts);
  return qwen.generateText(archivePrompt(query, posts), fallback, {
    options: { num_predict: 650 },
  });
}

export async function summarizeTechPaperWithQwen(qwen, paper) {
  const fallback = techPaperFallback(paper);
  const result = await qwen.generateJson(techPaperPrompt(paper), null, {
    schemaHint: '{"whyNow":"...","edTechApplication":"...","learningSciencesApplication":"...","issueTopic":"...","discussionQuestion":"..."}',
    options: { num_predict: 520 },
  });
  if (!result) return fallback;
  return {
    whyNow: cleanText(result.whyNow, 300),
    edTechApplication: cleanText(result.edTechApplication, 320),
    learningSciencesApplication: cleanText(result.learningSciencesApplication, 320),
    issueTopic: cleanText(result.issueTopic, 240),
    discussionQuestion: cleanText(result.discussionQuestion, 220),
  };
}

export async function analyzeCfpWithQwen(qwen, text) {
  const fallback = cfpFallback(text);
  return qwen.generateText(cfpPrompt(text), fallback, {
    options: { num_predict: 700 },
  });
}

export async function buildTopicDigestWithQwen(qwen, topic, posts) {
  const fallback = topicDigestFallback(topic, posts);
  return qwen.generateText(topicDigestPrompt(topic, posts), fallback, {
    options: { num_predict: 700 },
  });
}

export async function buildOnboardingReplyWithQwen(qwen, { displayName, introText }) {
  const fallback = onboardingFallback(displayName);
  return qwen.generateText(onboardingPrompt({ displayName, introText }), fallback, {
    options: { num_predict: 360 },
  });
}

export async function extractIntroFullNameWithQwen(qwen, introText) {
  const fallback = { fullName: extractNameFallback(introText) };
  const result = await qwen.generateJson(nameExtractionPrompt(introText), fallback, {
    schemaHint: '{"fullName":"First Last 또는 한국어 본명","confidence":0.9}',
    options: { num_predict: 120 },
  });
  return {
    fullName: cleanFullName(result?.fullName),
    confidence: Number.parseFloat(result?.confidence ?? '0'),
  };
}

export async function inferMemberRolesWithQwen(qwen, { messageText, existingRoles, currentRoles }) {
  const result = await qwen.generateJson(rolePrompt({ messageText, existingRoles, currentRoles }), null, {
    schemaHint: '{"matches":[{"role":"LearningAnalytics/EDM","confidence":0.86,"reason":"...","create":false}]}',
    options: { num_predict: 420 },
  });
  const matches = Array.isArray(result?.matches) ? result.matches : [];
  return matches.map((match) => ({
    role: cleanRoleName(match.role),
    confidence: Number.parseFloat(match.confidence ?? '0'),
    reason: cleanText(match.reason, 220),
    create: Boolean(match.create),
  })).filter((match) => match.role && Number.isFinite(match.confidence));
}

async function generateOllama({ baseUrl, model, prompt, timeoutMs, options, fetchImpl }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        keep_alive: '10m',
        options: { ...DEFAULT_OPTIONS, ...options },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return String(data.response ?? '').trim();
  } finally {
    clearTimeout(timeout);
  }
}

function withJsonInstructions(prompt, schemaHint) {
  return [
    'Return only valid JSON. Do not wrap it in markdown. Do not add commentary.',
    schemaHint ? `Expected shape: ${schemaHint}` : '',
    prompt,
  ].filter(Boolean).join('\n\n');
}

export function parseJsonObject(text) {
  if (!text) return null;
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function articlePrompt(article) {
  return [
    '당신은 한국어를 쓰는 learning sciences 연구자 커뮤니티를 돕는 학술 큐레이터입니다.',
    '반드시 한국어로 작성하세요. JSON key는 영어여도 value는 한국어여야 합니다. 꼭 필요한 학술 용어만 영어를 병기하세요.',
    '초록 문장을 단순 반복하지 말고, 초록 안의 개념 관계와 연구 설계를 재구성하세요.',
    '간결하지만 surface-level 요약은 피하세요. KELS 회원이 실제로 무엇을 읽고 토론해야 하는지 드러내세요.',
    '확인되지 않은 결과, 효과, 한계는 만들어내지 마세요. 초록에 근거가 약하면 "초록만으로는 제한적"이라고 쓰세요.',
    'problem은 이 논문이 겨냥하는 학습/설계/방법론 문제를 설명하세요.',
    'contribution은 핵심 주장, 이론적 기여, 또는 방법론적 기여를 설명하세요.',
    'method는 연구설계, 데이터, 분석, 모델, 평가 방식 중 초록에서 확인되는 방법론 포인트를 설명하세요.',
    'kelsApplication은 교육공학 또는 learning sciences 연구자가 새 연구 질문/설계로 가져갈 수 있는 아이디어를 쓰세요.',
    'readingLens는 읽을 때 검토해야 할 긴장관계, 한계, 또는 해석상 주의점을 쓰세요.',
    'issueTopic은 KELS에서 토론을 시작하기 좋은 쟁점형 한 문장으로 쓰세요.',
    '',
    `Title: ${article.title}`,
    `Journal: ${article.source}`,
    `Date: ${article.publicationDate}`,
    `Authors: ${(article.authors ?? []).join(', ')}`,
    `Abstract: ${article.abstract || 'No abstract available.'}`,
  ].join('\n');
}

function forumPrompt(post, currentTitle) {
  return [
    'Suggest a useful Discord forum title and searchable tags for a Korean learning sciences community.',
    'Use English title tags like [CFP], [Job], [Resource], [Seminar] when appropriate.',
    'Tags should be short, lowercase when natural, and omit #.',
    '',
    `Current title: ${currentTitle}`,
    `Channel: ${post.channelName}`,
    `Category: ${post.category}`,
    `Content: ${(post.content ?? '').slice(0, 1800)}`,
  ].join('\n');
}

function profilePrompt(post, topics) {
  return [
    'Explain in Korean why this Discord post matches a member profile.',
    'One or two sentences only. Be specific, not promotional.',
    '',
    `Profile topics: ${topics.join(', ')}`,
    `Channel: ${post.channelName}`,
    `Category: ${post.category}`,
    `Content: ${(post.content ?? '').slice(0, 1500)}`,
  ].join('\n');
}

function archivePrompt(query, posts) {
  const context = posts.map((post, index) => [
    `[${index + 1}] #${post.channelName} | ${post.category} | ${post.createdAt}`,
    `URL: https://discord.com/channels/${post.guildId}/${post.channelId}/${post.id}`,
    `Content: ${(post.content ?? '').replace(/\s+/g, ' ').slice(0, 700)}`,
  ].join('\n')).join('\n\n');

  return [
    'You answer questions about an indexed Discord archive for Korean edtech and learning sciences researchers.',
    'Answer in Korean. Use only the provided archive snippets. If evidence is thin, say so.',
    'Include short bullet points and source links using the provided URLs.',
    '',
    `Question: ${query}`,
    '',
    `Archive snippets:\n${context}`,
  ].join('\n');
}

function techPaperPrompt(paper) {
  return [
    '당신은 한국어를 쓰는 교육공학/learning sciences 연구자 커뮤니티를 돕는 기술 큐레이터입니다.',
    '아래 arXiv tech paper를 KELS 회원이 읽을 만한 연구 아이디어로 번역하세요.',
    '반드시 한국어로 답하고, 과장하지 마세요. 논문 초록에서 확인되는 내용만 바탕으로 하세요.',
    '교육공학 적용과 learning sciences 적용을 분리하세요.',
    'issueTopic은 KELS에서 토론을 시작하기 좋은 쟁점형 한 문장이어야 합니다.',
    '',
    `Title: ${paper.title}`,
    `Categories: ${(paper.categories ?? []).join(', ')}`,
    `Published: ${paper.publishedAt}`,
    `Authors: ${(paper.authors ?? []).join(', ')}`,
    `Abstract: ${paper.summary || 'No abstract available.'}`,
  ].join('\n');
}

function rolePrompt({ messageText, existingRoles, currentRoles }) {
  return [
    'You infer Discord role tags for a Korean edtech and learning sciences community.',
    'Use existing roles first. Suggest a new role only when none of the existing roles fit well.',
    'Never infer Admin, Admin & Facilitator, CommunicationOfficer, moderator, staff, or server-management roles.',
    'Do not infer identity or status roles unless the user explicitly states them.',
    'Prefer research areas, methods, domains, or professional interests.',
    'Return at most 3 matches with confidence from 0 to 1.',
    '',
    `Existing roles: ${existingRoles.join(', ')}`,
    `Member current roles: ${currentRoles.join(', ') || 'none'}`,
    `Recent member message: ${messageText.slice(0, 1800)}`,
  ].join('\n');
}

function cfpPrompt(text) {
  return [
    '당신은 KELS 회원을 돕는 CFP/RFP 큐레이터입니다.',
    '반드시 한국어로 답하세요. 아래 CFP/RFP 또는 링크/공고 텍스트에서 확인 가능한 내용만 사용하세요.',
    '다음 형식으로 간결하게 정리하세요: 1) 무엇인가 2) 누가 맞는가 3) 마감/제출물 4) KELS fit 5) 준비 체크리스트.',
    '',
    `CFP/RFP:\n${String(text ?? '').slice(0, 3500)}`,
  ].join('\n');
}

function topicDigestPrompt(topic, posts) {
  const context = posts.map((post, index) => [
    `[${index + 1}] #${post.channelName} | ${post.category} | ${post.createdAt}`,
    `URL: https://discord.com/channels/${post.guildId}/${post.channelId}/${post.id}`,
    `Content: ${(post.content ?? '').replace(/\s+/g, ' ').slice(0, 650)}`,
  ].join('\n')).join('\n\n');
  return [
    '당신은 KELS 연구 커뮤니티의 주제별 digest 작성자입니다.',
    '반드시 한국어로 답하세요. 제공된 archive snippet만 근거로 사용하세요.',
    `주제: ${topic}`,
    '형식: 핵심 흐름, 주목할 글, 마감/기회, 후속 액션.',
    '',
    `Archive snippets:\n${context}`,
  ].join('\n');
}

function onboardingPrompt({ displayName, introText }) {
  return [
    '당신은 KELS 디스코드에 새로 온 회원을 맞이하는 온보딩 도우미입니다.',
    '반드시 한국어로, 따뜻하지만 과하지 않게 답하세요.',
    '자기소개 내용을 바탕으로 3개의 짧은 follow-up 질문을 만들고, 도움이 될 만한 KELS 활용법을 2개 안내하세요.',
    '질문은 연구 관심사, 찾고 있는 기회, 참여하고 싶은 활동을 중심으로 하세요.',
    '',
    `이름: ${displayName}`,
    `자기소개:\n${String(introText ?? '').slice(0, 2200)}`,
  ].join('\n');
}

function nameExtractionPrompt(introText) {
  return [
    'Extract the person\'s real full name from this self-introduction message.',
    'Do not use Discord username, nickname, institution name, role, or email handle.',
    'If no real full name is present, return an empty string.',
    'Return only JSON.',
    '',
    `Self-introduction:\n${String(introText ?? '').slice(0, 1600)}`,
  ].join('\n');
}

function archiveFallback(query, posts) {
  if (!posts.length) return `No indexed KELS posts matched: ${query}`;
  return [
    `Qwen is unavailable, so here are the top indexed matches for: ${query}`,
    ...posts.slice(0, 5).map((post, index) =>
      `${index + 1}. #${post.channelName} ${post.content.slice(0, 180)}\nhttps://discord.com/channels/${post.guildId}/${post.channelId}/${post.id}`,
    ),
  ].join('\n\n');
}

function techPaperFallback(paper) {
  return {
    whyNow: '최근 arXiv에 올라온 AI/ML 기술 논문으로, KELS 회원들이 현재 기술 흐름을 연구 아이디어로 번역해 보기 좋습니다.',
    edTechApplication: 'AI tutor, 자동 피드백, 학습 지원 도구, 연구용 프로토타입 설계 관점에서 적용 가능성을 검토할 수 있습니다.',
    learningSciencesApplication: '학습자-도구-환경 상호작용, trace data 해석, 협력학습 또는 자기조절 지원의 분석 단위로 연결해 볼 수 있습니다.',
    issueTopic: '기술 성능 향상이 실제 학습자의 이해와 참여를 어떻게 바꾸는지 어디까지 연구 설계로 확인할 수 있을까요?',
    discussionQuestion: `이 논문(${paper.title})의 접근을 KELS 연구 맥락에 적용한다면 가장 먼저 검증해야 할 학습 성과는 무엇일까요?`,
  };
}

function cfpFallback(text) {
  return [
    'Qwen 응답을 사용할 수 없어 CFP/RFP 원문 기반 체크리스트만 제공합니다.',
    '',
    '- 마감일, 제출물, 대상자, 공식 URL을 먼저 확인하세요.',
    '- KELS 회원에게 맞는 키워드: learning sciences, educational technology, CSCL, AIED, learning analytics, instructional design.',
    `- 입력 내용: ${String(text ?? '').slice(0, 600)}`,
  ].join('\n');
}

function topicDigestFallback(topic, posts) {
  if (!posts.length) return `최근 archive에서 "${topic}" 관련 글을 찾지 못했습니다.`;
  return [
    `Qwen 응답을 사용할 수 없어 "${topic}" 관련 상위 결과만 보여드립니다.`,
    ...posts.slice(0, 5).map((post, index) =>
      `${index + 1}. #${post.channelName} ${post.content.slice(0, 180)}\nhttps://discord.com/channels/${post.guildId}/${post.channelId}/${post.id}`,
    ),
  ].join('\n\n');
}

function onboardingFallback(displayName) {
  return [
    `${displayName} 님, KELS에 오신 것을 환영합니다.`,
    '',
    '몇 가지를 더 알려주시면 더 잘 연결해드릴 수 있습니다.',
    '1. 요즘 가장 관심 있는 연구 주제나 방법론은 무엇인가요?',
    '2. KELS에서 찾고 싶은 것은 채용, CFP, 세미나, 협업, 자료 중 무엇에 가까운가요?',
    '3. 참여하고 싶은 활동이나 소개받고 싶은 연구 커뮤니티가 있나요?',
    '',
    '`/profile action:add topic:<관심주제>`로 관심 분야를 저장해두면 관련 글이 올라올 때 개인 DM 알림을 받을 수 있습니다.',
  ].join('\n');
}

function extractNameFallback(text) {
  const value = String(text ?? '');
  const patterns = [
    /(?:이름|성명|본명)\s*(?:은|는|:|：)?\s*([가-힣]{2,5})(?=입니다|이에요|예요|이고|라고|,|\.|\s|$)/,
    /(?:my name is|name is|i am|i'm)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/i,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1];
  }
  return '';
}

function cleanFullName(value) {
  return String(value ?? '')
    .replace(/[`"'<>@#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

function cleanText(value, max = 240) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max - 3).trim()}...`;
}

function cleanTag(value) {
  return String(value ?? '')
    .replace(/^#/, '')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .trim()
    .slice(0, 32);
}

function cleanRoleName(value) {
  return String(value ?? '')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[`"'<>@#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}
