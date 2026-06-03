import { rankFieldTopics, tokenize } from './field-explorer.js';
import { rankPostsForQuery } from './relevance.js';

const STAGE_PATHWAYS = {
  prospective: {
    label: 'Prospective / field explorer',
    theme: 'Find the field, people, and vocabulary before committing too early.',
    tasks: [
      'Pick two FieldExplorer categories and compare what counts as evidence in each.',
      'Save one CFP or seminar that helps you understand the community language.',
      'Write a 3-sentence research curiosity, not a full proposal yet.',
    ],
  },
  master: {
    label: 'Master / early researcher',
    theme: 'Turn broad interest into searchable questions and reading routines.',
    tasks: [
      'Choose one anchor paper and identify its theory, method, and data source.',
      'Use `/ask-better` to turn a broad question into two sharper versions.',
      'React to or reply to one KELS post connected to your topic.',
    ],
  },
  phd: {
    label: 'PhD / dissertation builder',
    theme: 'Convert opportunities and papers into a coherent research program.',
    tasks: [
      'Map your current project to one strong venue lane and one adjacent lane.',
      'Draft one contribution claim and one possible limitation.',
      'Find one peer or thread where your question could become a small collaboration.',
    ],
  },
  postdoc: {
    label: 'Postdoc / agenda shaper',
    theme: 'Build a visible research agenda and community-facing collaborations.',
    tasks: [
      'Identify one topic bridge between your work and another KELS subcommunity.',
      'Turn one CFP into a concrete 4-week submission plan.',
      'Start or support one discussion thread that others can join.',
    ],
  },
  faculty: {
    label: 'Faculty / mentor and agenda lead',
    theme: 'Use the community to mentor, recruit collaborators, and seed high-quality discussion.',
    tasks: [
      'Post one opportunity with a note on who it is especially good for.',
      'Invite one junior member into a low-stakes discussion or reading thread.',
      'Use feedback signals to decide which resource deserves a follow-up post.',
    ],
  },
  practitioner: {
    label: 'Practitioner / design translator',
    theme: 'Translate research signals into design, evaluation, and implementation moves.',
    tasks: [
      'Pick one research post and name a real learning setting where it could be tested.',
      'Ask one question about feasibility, implementation, or evidence.',
      'Connect a tool or practice example to a FieldExplorer category.',
    ],
  },
};

const CHALLENGES = {
  paper: {
    title: 'Paper Reading Micro-Challenge',
    mission: 'Pick one paper or article shared in KELS and write one sentence about its method, one about its claim, and one question you still have.',
    deliverable: '3 short bullets in a thread or personal note.',
  },
  cfp: {
    title: 'CFP-to-Action Micro-Challenge',
    mission: 'Pick one CFP and write why your current idea is a fit, not a fit, or needs reframing.',
    deliverable: 'One fit sentence, one risk sentence, one next action.',
  },
  field: {
    title: 'FieldExplorer Micro-Challenge',
    mission: 'Place your topic in one FieldExplorer category and one adjacent category. Notice what changes in audience and evidence.',
    deliverable: 'Two category names and one framing difference.',
  },
  question: {
    title: 'Better Question Micro-Challenge',
    mission: 'Take a broad question and make it answerable by naming learner, context, intervention, data, or mechanism.',
    deliverable: 'Original question plus one sharper version.',
  },
};

export function buildLearningPathway({ stage = 'phd', interests = '', posts = [], logs = [], fieldTopics = [] } = {}) {
  const pathway = STAGE_PATHWAYS[stage] ?? STAGE_PATHWAYS.phd;
  const interestText = interests || recentUserQueries(logs).join(' ');
  const fieldMatches = rankFieldTopics(interestText, fieldTopics, { limit: 3 });
  const relatedPosts = rankPostsForQuery(interestText || pathway.theme, posts, { limit: 4 })
    .filter((post) => (post.relevance ?? 0) > 0);

  return {
    stage,
    ...pathway,
    fieldMatches,
    relatedPosts,
    nextSteps: [
      'Run `/profile-suggest` to make the pathway more personalized.',
      'Use `/paper-coach` or `/ask-better` on one concrete item this week.',
      'Leave one low-stakes reaction or reply so the system can learn what is useful.',
    ],
  };
}

export function buildMicroChallenge({ focus = 'paper', posts = [], fieldTopics = [] } = {}) {
  const challenge = CHALLENGES[focus] ?? CHALLENGES.paper;
  const sourceText = posts.slice(0, 10).map((post) => post.content).join('\n');
  const fieldMatches = rankFieldTopics(sourceText, fieldTopics, { limit: 3 });
  const seedPost = posts.find((post) => post.content?.length > 60);
  return {
    focus,
    ...challenge,
    fieldMatches,
    seedPost,
    reflection: [
      'What is one thing I can borrow for my own research or teaching?',
      'What assumption would I want to test before trusting this idea?',
      'Who in KELS might have a useful perspective on this?',
    ],
  };
}

export function buildReflectionGuide({ item = '', context = '', kind = 'paper', fieldTopics = [] } = {}) {
  const text = [item, context].join('\n');
  const fieldMatches = rankFieldTopics(text, fieldTopics, { limit: 3 });
  return {
    kind,
    fieldMatches,
    prompts: [
      `What problem does this ${kind} make more visible?`,
      `What theory, method, or design assumption is doing the most work here?`,
      'What would count as convincing evidence in a KELS research context?',
      'What is one way this could fail in a real classroom, platform, or community?',
      'What is the smallest next step I could try this week?',
    ],
    threadDraft: threadDraftFromText(text, kind),
  };
}

export function buildPeerLearningMatch({ topic = '', posts = [], logs = [], fieldTopics = [], limit = 8 } = {}) {
  const topicText = topic || logs.map((log) => log.query).join(' ');
  const fieldMatches = rankFieldTopics(topicText, fieldTopics, { limit: 3 });
  const userMap = new Map();
  const relevantPosts = rankPostsForQuery(topicText, posts, { limit: 20 }).filter((post) => (post.relevance ?? 0) > 0);

  for (const post of relevantPosts) {
    const entry = userEntry(userMap, post.authorId, post.authorName);
    entry.score += 3 + (post.relevance ?? 0);
    entry.evidence.push({ source: 'post', channelName: post.channelName, text: post.content });
  }

  const relevantPostIds = new Set(relevantPosts.map((post) => post.id));
  for (const log of logs) {
    if (!log.userId) continue;
    const matchesQuery = topic && normalize(log.query).includes(normalize(topic));
    const reactsToRelevantPost = log.eventType === 'reaction-add' && relevantPostIds.has(log.metadata?.messageId);
    if (!matchesQuery && !reactsToRelevantPost) continue;
    const entry = userEntry(userMap, log.userId, log.userName);
    entry.score += matchesQuery ? 2 : 1;
    entry.evidence.push({ source: log.eventType, channelName: log.channelName, text: log.query || log.metadata?.emoji || '' });
  }

  const candidates = [...userMap.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => ({
      ...entry,
      evidence: entry.evidence.slice(0, 3),
    }));

  return {
    topic,
    fieldMatches,
    candidates,
    threadSeed: `Small peer-learning thread idea: "${topic || fieldMatches[0]?.name || 'shared KELS question'}"`,
  };
}

export function buildBetterQuestion({ question = '', fieldTopics = [] } = {}) {
  const tokens = tokenize(question);
  const fieldMatches = rankFieldTopics(question, fieldTopics, { limit: 3 });
  const focus = inferQuestionFocus(question, tokens);
  const base = question.replace(/\s+/g, ' ').trim();
  return {
    focus,
    fieldMatches,
    improvedQuestions: [
      `In what context, for which learners, does ${lowerFirst(base)} matter most?`,
      `What mechanism could explain ${lowerFirst(base)}, and what data would show it?`,
      `How would ${lowerFirst(base)} differ across ${fieldMatches[0]?.name || 'two related learning contexts'}?`,
    ],
    keywords: [...new Set([
      ...tokens.filter((token) => token.length >= 4).slice(0, 8),
      ...fieldMatches.map((topic) => topic.name),
    ])].slice(0, 10),
    threadDraft: [
      'I am trying to sharpen this question:',
      `> ${base}`,
      '',
      'A more answerable version might be:',
      `> ${`What mechanism could explain ${lowerFirst(base)}, and what data would show it?`}`,
      '',
      'I would appreciate suggestions on theory, method, or examples.',
    ].join('\n'),
  };
}

export function buildPaperCoach({ text = '', level = 'beginner', fieldTopics = [] } = {}) {
  const fieldMatches = rankFieldTopics(text, fieldTopics, { limit: 3 });
  const advanced = level === 'advanced';
  return {
    level,
    fieldMatches,
    readingOrder: advanced
      ? ['Research problem and contribution claim', 'Method/design details', 'Analysis choices and validity threats', 'Findings in relation to theory', 'Limitations and next study ideas']
      : ['Title and abstract', 'Introduction problem statement', 'Method overview', 'Main figure/table or findings section', 'Discussion and limitations'],
    checkpoints: advanced
      ? ['What is the strongest causal or theoretical claim?', 'What assumptions does the method depend on?', 'What would replication or extension require?']
      : ['Who are the learners or participants?', 'What was designed or measured?', 'What is one idea I can explain in my own words?'],
    miniTask: advanced
      ? 'Write a 4-sentence reviewer-style note: contribution, evidence, limitation, extension.'
      : 'Write 3 bullets: main idea, method clue, one question.',
    discussionQuestions: [
      'What would change if this study were done in my learning context?',
      'Which part is most reusable: theory, method, measure, design, or tool?',
    ],
  };
}

function recentUserQueries(logs) {
  return logs
    .filter((log) => log.eventType === 'slash-command' && log.query)
    .map((log) => log.query)
    .slice(-8);
}

function userEntry(map, userId, userName) {
  const key = userId || userName || 'unknown';
  const current = map.get(key) ?? {
    userId,
    userName: userName || userId || 'unknown',
    score: 0,
    evidence: [],
  };
  map.set(key, current);
  return current;
}

function inferQuestionFocus(question, tokens) {
  const text = normalize(question);
  if (/method|measure|data|analysis|방법|데이터|분석/.test(text)) return 'method/data';
  if (/theory|framework|mechanism|이론|메커니즘/.test(text)) return 'theory/mechanism';
  if (/design|tool|intervention|설계|도구|개입/.test(text)) return 'design/intervention';
  if (/cfp|venue|journal|conference|저널|학회/.test(text)) return 'venue/framing';
  return tokens.length > 8 ? 'broad research question' : 'early idea';
}

function threadDraftFromText(text, kind) {
  const summary = text.replace(/\s+/g, ' ').trim().slice(0, 240);
  return [
    `I am reflecting on this ${kind}:`,
    `> ${summary}`,
    '',
    'What seems most useful to borrow, and what should we be careful about?',
  ].join('\n');
}

function lowerFirst(value) {
  const text = String(value ?? '').trim();
  return text ? text[0].toLowerCase() + text.slice(1) : 'this question';
}

function normalize(value) {
  return String(value ?? '').toLowerCase().normalize('NFKC');
}
