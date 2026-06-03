import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import { buildTechPaperReason } from './arxiv.js';
import { buildGithubRepoReason } from './github-repos.js';
import { buildKnowledgeFlow, buildParticipationNudge } from './knowledge-flow.js';
import { buildRecommendationReason } from './openalex.js';
import { mapCategory } from './storage.js';

const CATEGORY_LABELS = {
  all: 'All KELS items',
  jobs: 'Jobs',
  job: 'Jobs',
  cfp: 'CFP/RFP',
  seminars: 'Seminars and workshops',
  seminar: 'Seminars and workshops',
  resources: 'Academic resources',
  resource: 'Academic resources',
  events: 'Events',
  event: 'Events',
  general: 'General',
};

const ANON_CATEGORY_LABELS = {
  career: '진로/커리어',
  'paper-research': '논문/연구',
  'grad-school': '유학/대학원',
  teaching: '수업/티칭',
  community: '커뮤니티/관계',
  other: '기타',
};

function truncate(text, max = 240) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3).trim()}...`;
}

function postUrl(post) {
  return `https://discord.com/channels/${post.guildId}/${post.channelId}/${post.id}`;
}

function lineFor(post) {
  const dateText = post.dates?.length ? ` | dates: ${post.dates.slice(0, 2).join(', ')}` : '';
  const tagText = post.tags?.length ? ` | ${post.tags.slice(0, 3).map((tag) => `#${tag}`).join(' ')}` : '';
  const linkText = post.urls?.[0] ? ` | [link](${post.urls[0]})` : '';
  return `- [#${post.channelName}](${postUrl(post)}) ${truncate(post.content, 150)}${dateText}${tagText}${linkText}`;
}

export function buildDigestEmbed(posts, { category = 'all', days = 7 } = {}) {
  const grouped = groupPosts(posts);
  const embed = new EmbedBuilder()
    .setTitle(`KELS Digest: ${CATEGORY_LABELS[category] ?? category}`)
    .setDescription(posts.length ? `Recent items from the last ${days} day(s).` : `No indexed items found in the last ${days} day(s).`)
    .setColor(0x1d4ed8)
    .setTimestamp(new Date());

  for (const [group, items] of Object.entries(grouped).slice(0, 5)) {
    embed.addFields({
      name: CATEGORY_LABELS[group] ?? group,
      value: items.slice(0, 5).map(lineFor).join('\n').slice(0, 1000) || 'No items.',
    });
  }

  return embed;
}

export function buildSearchEmbed(posts, query, category = 'all') {
  const embed = new EmbedBuilder()
    .setTitle(`KELS Search: ${query}`)
    .setDescription(posts.length ? `Top ${Math.min(posts.length, 8)} result(s), category: ${category}.` : 'No matching indexed posts.')
    .setColor(0x047857)
    .setTimestamp(new Date());

  if (posts.length) {
    embed.addFields({
      name: 'Results',
      value: posts.slice(0, 8).map(lineFor).join('\n').slice(0, 1000),
    });
  }

  return embed;
}

export function buildFieldExplorerEmbed({
  query,
  topics = [],
  relatedPosts = [],
  label = 'Field Explorer',
  appUrl = '',
  enabled = true,
}) {
  const embed = new EmbedBuilder()
    .setTitle(`KELS Field Map: ${truncate(query, 80)}`)
    .setColor(0x0f766e)
    .setTimestamp(new Date());

  if (!enabled) {
    return embed.setDescription('Field Explorer is not enabled yet. Ask an organizer to configure `FIELD_EXPLORER_TOPICS_FILE`.');
  }

  embed.setDescription(
    topics.length
      ? `Closest field positions from ${label}. This is a lightweight navigation aid, not a formal classification.`
      : `No strong FieldExplorer match found in ${label}. Try a journal, conference, field category, method, or project keyword.`,
  );

  if (appUrl) {
    embed.addFields({
      name: 'FieldExplorer app',
      value: `[Open the latest FieldExplorer map](${appUrl})`,
    });
  }

  if (topics.length) {
    embed.addFields({
      name: 'FieldExplorer positions',
      value: topics.map((topic, index) => [
        `**${index + 1}. ${truncate(topic.name, 70)}**`,
        `score ${topic.score}, linked nodes ${topic.count}`,
        topic.journals?.length ? `journals: ${topic.journals.slice(0, 4).join(', ')}` : '',
        topic.conferences?.length ? `conferences: ${topic.conferences.slice(0, 4).join(', ')}` : '',
        !topic.journals?.length && !topic.conferences?.length && topic.keywords?.length ? `keywords: ${topic.keywords.slice(0, 6).join(', ')}` : '',
      ].filter(Boolean).join('\n')).join('\n\n').slice(0, 1000),
    });
  }

  if (relatedPosts.length) {
    embed.addFields({
      name: 'Related KELS originals',
      value: relatedPosts.slice(0, 5).map(lineFor).join('\n').slice(0, 1000),
    });
  }

  embed.addFields({
    name: 'How to use this',
    value: [
      'Use this to locate a topic, abstract, CFP, or project idea within the FieldExplorer journal/conference map.',
      'For stronger results, include field labels, venues, methods, technologies, or target communities.',
    ].join('\n'),
  });

  return embed;
}

export function buildVenueScoutEmbed({
  query,
  scout,
  relatedPosts = [],
  label = 'Field Explorer',
  appUrl = '',
  enabled = true,
}) {
  const embed = new EmbedBuilder()
    .setTitle(`KELS Venue Scout: ${truncate(query, 70)}`)
    .setColor(0x2563eb)
    .setTimestamp(new Date());

  if (!enabled) {
    return embed.setDescription('Field Explorer is not enabled yet. Ask an organizer to configure `FIELD_EXPLORER_TOPICS_FILE`.');
  }

  embed.setDescription(
    scout?.weakFit
      ? `No strong venue fit found in ${label}. Treat the options below as exploratory and add more abstract/method/venue detail.`
      : `Draft venue positioning from ${label}. This is a scouting aid, not a submission guarantee.`,
  );

  if (appUrl) {
    embed.addFields({
      name: 'FieldExplorer app',
      value: `[Open the latest FieldExplorer map](${appUrl})`,
    });
  }

  if (scout?.tiers?.length) {
    embed.addFields({
      name: 'Candidate venue lanes',
      value: scout.tiers.map((tier) => [
        `**${tier.tier}: ${truncate(tier.topicName, 64)}**`,
        `fit score ${tier.score}, linked nodes ${tier.count}`,
        tier.journals.length ? `journals: ${tier.journals.join(', ')}` : '',
        tier.conferences.length ? `conferences: ${tier.conferences.join(', ')}` : '',
        `angle: ${tier.guidance}`,
      ].filter(Boolean).join('\n')).join('\n\n').slice(0, 1600),
    });
  } else {
    embed.addFields({
      name: 'Candidate venue lanes',
      value: 'No candidate lanes found. Try adding venue names, methods, population, theory, or target field labels.',
    });
  }

  if (relatedPosts.length) {
    embed.addFields({
      name: 'Related KELS originals',
      value: relatedPosts.slice(0, 5).map(lineFor).join('\n').slice(0, 1000),
    });
  }

  embed.addFields({
    name: 'Submission framing checklist',
    value: [
      '1. Name the target audience before choosing a venue.',
      '2. Match contribution type: theory, design, empirical evidence, tool, or community resource.',
      '3. Check recent accepted papers and CFP language before committing.',
    ].join('\n'),
  });

  return embed;
}

export function buildAnonymousReviewPayload(submission) {
  const embed = new EmbedBuilder()
    .setTitle(`익명 고민 검토: #${submission.publicNumber}`)
    .setDescription(truncate(submission.text, 1800))
    .setColor(0x7c3aed)
    .addFields(
      {
        name: 'Category',
        value: ANON_CATEGORY_LABELS[submission.category] ?? submission.category,
        inline: true,
      },
      {
        name: 'Submitted by',
        value: `<@${submission.authorId}> (${submission.authorId})`,
        inline: true,
      },
      {
        name: 'Privacy note',
        value: '공개 게시에는 작성자 정보가 포함되지 않습니다. abuse 대응을 위해 운영자 검토 화면에만 제출자가 표시됩니다.',
      },
    )
    .setFooter({ text: `Submission ID: ${submission.id}` })
    .setTimestamp(new Date(submission.createdAt));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`anon:approve:${submission.id}`)
      .setLabel('익명 게시')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`anon:reject:${submission.id}`)
      .setLabel('반려')
      .setStyle(ButtonStyle.Danger),
  );

  return {
    content: '새 익명 고민 제출이 들어왔습니다. 운영자 검토 후 게시/반려를 선택해주세요.',
    embeds: [embed],
    components: [row],
    allowedMentions: { parse: [] },
  };
}

export function buildAnonymousReviewClosedPayload(submission, actionLabel, reviewerId) {
  const embed = new EmbedBuilder()
    .setTitle(`익명 고민 ${actionLabel}: #${submission.publicNumber}`)
    .setDescription(truncate(submission.text, 1800))
    .setColor(actionLabel === '게시됨' ? 0x047857 : 0xb91c1c)
    .addFields(
      {
        name: 'Category',
        value: ANON_CATEGORY_LABELS[submission.category] ?? submission.category,
        inline: true,
      },
      {
        name: 'Reviewed by',
        value: `<@${reviewerId}>`,
        inline: true,
      },
    )
    .setFooter({ text: `Submission ID: ${submission.id}` })
    .setTimestamp(new Date());

  return {
    content: `익명 고민 #${submission.publicNumber} ${actionLabel}.`,
    embeds: [embed],
    components: [],
    allowedMentions: { parse: [] },
  };
}

export function buildAnonymousAdvicePostPayload(submission) {
  const category = ANON_CATEGORY_LABELS[submission.category] ?? submission.category;
  return {
    content: [
      `**익명 고민 #${submission.publicNumber} | ${category}**`,
      '',
      submission.text,
      '',
      '답변은 이 글의 thread에 남겨주세요. 조언은 따뜻하고 구체적으로 부탁드립니다.',
    ].join('\n'),
    allowedMentions: { parse: [] },
  };
}

export function buildFieldPulseEmbed({
  posts = [],
  fieldMatches = [],
  days = 14,
  label = 'Field Explorer',
  appUrl = '',
}) {
  const flow = buildKnowledgeFlow(posts);
  const embed = new EmbedBuilder()
    .setTitle(`KELS Field Pulse: last ${days} days`)
    .setDescription(
      posts.length
        ? `Recent KELS activity positioned against ${label}. Use this as a lightweight prompt for community discussion.`
        : `No indexed KELS activity found in the last ${days} days.`,
    )
    .setColor(0x0f766e)
    .setTimestamp(new Date());

  if (appUrl) {
    embed.addFields({
      name: 'FieldExplorer app',
      value: `[Open the latest FieldExplorer map](${appUrl})`,
    });
  }

  embed.addFields(
    {
      name: 'Community signals',
      value: flow.topics.length
        ? flow.topics.slice(0, 6).map((topic) => `- #${topic.topic} (${topic.count}) ${topic.channels.slice(0, 2).map((channel) => `#${channel}`).join(', ')}`).join('\n').slice(0, 1000)
        : 'No topic signals detected yet.',
    },
    {
      name: 'FieldExplorer positions',
      value: fieldMatches.length
        ? fieldMatches.slice(0, 5).map((topic, index) => `**${index + 1}. ${topic.name}** | score ${topic.score}, linked nodes ${topic.count}`).join('\n')
        : 'No strong FieldExplorer category match yet.',
    },
    {
      name: 'Bridge opportunities',
      value: flow.bridgeOpportunities.length
        ? flow.bridgeOpportunities.map((item) => `- ${item.prompt}`).join('\n').slice(0, 1000)
        : 'No cross-channel bridge opportunity detected yet.',
    },
    {
      name: 'Discussion seed',
      value: flow.participationPrompts[0] || 'Which recent KELS post could become a shared reading, proposal idea, or methods discussion?',
    },
  );

  if (flow.evidencePosts.length) {
    embed.addFields({
      name: 'Evidence trail',
      value: flow.evidencePosts.slice(0, 5).map((item) => `- #${item.topic} ${lineFor(item.post)}`).join('\n').slice(0, 1000),
    });
  }

  return embed;
}

export function buildCommunityGraphEmbed({ graph, days = 30 }) {
  const summary = graph.summary;
  return new EmbedBuilder()
    .setTitle(`KELS Community Graph: last ${days} days`)
    .setDescription('Activity graph summary across posts, users, slash commands, reactions, channels, and FieldExplorer topics.')
    .setColor(0x2563eb)
    .addFields(
      {
        name: 'Graph size',
        value: `nodes ${summary.nodeCount} | edges ${summary.edgeCount}`,
        inline: true,
      },
      {
        name: 'Node types',
        value: summary.nodeTypes.length ? summary.nodeTypes.map((item) => `${item.name}: ${item.count}`).join(' | ') : 'No nodes.',
      },
      {
        name: 'Edge types',
        value: summary.edgeTypes.length ? summary.edgeTypes.map((item) => `${item.name}: ${item.count}`).join(' | ') : 'No edges.',
      },
      {
        name: 'Most connected users',
        value: summary.topUsers.length
          ? summary.topUsers.map((node) => `- ${node.label} (${node.weight})`).join('\n').slice(0, 1000)
          : 'No user activity yet.',
      },
      {
        name: 'Most connected topics',
        value: summary.topTopics.length
          ? summary.topTopics.map((node) => `- ${node.label} (${node.weight})`).join('\n').slice(0, 1000)
          : 'No FieldExplorer topic matches yet.',
      },
    )
    .setTimestamp(new Date());
}

export function buildCurationFeedbackEmbed({ feedback, days = 30 }) {
  const embed = new EmbedBuilder()
    .setTitle(`KELS Curation Feedback: last ${days} days`)
    .setDescription('Signals from reactions, slash-command demand, and FieldExplorer topic matches. Use this to tune future curation.')
    .setColor(0x7c3aed)
    .addFields(
      {
        name: 'Command demand',
        value: feedback.commandUsage.length
          ? feedback.commandUsage.slice(0, 8).map((item) => `/${item.name}: ${item.count}`).join(' | ')
          : 'No slash command usage logged yet.',
      },
      {
        name: 'High-signal posts',
        value: feedback.topPosts.length
          ? feedback.topPosts.slice(0, 6).map((item) => [
            `- score ${item.score} | reactions ${item.reactions} | query matches ${item.queryMatches}`,
            lineFor(item.post).replace(/^- /, '  '),
          ].join('\n')).join('\n').slice(0, 1000)
          : 'No feedback-rich posts yet.',
      },
      {
        name: 'Topic signals',
        value: feedback.topicSignals.length
          ? feedback.topicSignals.slice(0, 8).map((item) => `- ${item.topic}: score ${item.score}, posts ${item.posts}, reactions ${item.reactions}`).join('\n').slice(0, 1000)
          : 'No topic signal yet.',
      },
    )
    .setTimestamp(new Date());

  if (feedback.recommendationFeedback.length) {
    embed.addFields({
      name: 'Recent curation posts',
      value: feedback.recommendationFeedback.map((item) => `- ${item.eventType}: ${truncate(item.query || '', 90)}`).join('\n').slice(0, 1000),
    });
  }

  return embed;
}

export function buildProfileSuggestionsEmbed({ suggestions, days = 90 }) {
  const embed = new EmbedBuilder()
    .setTitle(`KELS Profile Suggestions: last ${days} days`)
    .setDescription(
      suggestions.evidenceCount
        ? 'These are inferred from your own posts, slash-command use, and reactions to KELS posts. Nothing is added until you choose to add it.'
        : 'No recent personal activity signal found yet. Try reacting to posts or using `/profile action:add topic:<topic>` directly.',
    )
    .setColor(0x0f766e)
    .setTimestamp(new Date());

  if (suggestions.suggestions.length) {
    embed.addFields({
      name: 'Suggested topics',
      value: suggestions.suggestions.map((item, index) => [
        `**${index + 1}. ${item.topic}** | score ${item.score}`,
        item.evidence?.length
          ? `evidence: ${item.evidence.slice(0, 2).map((entry) => `${entry.source} in #${entry.channelName || 'unknown'}`).join(', ')}`
          : '',
        `add with: \`/profile action:add topic:"${truncate(item.topic, 60)}"\``,
      ].filter(Boolean).join('\n')).join('\n\n').slice(0, 1500),
    });
  }

  embed.addFields({
    name: 'Privacy',
    value: 'This is shown only to you. It is a suggestion layer, not automatic profile tagging.',
  });

  return embed;
}

export function buildLearningPathEmbed({ pathway }) {
  return new EmbedBuilder()
    .setTitle(`KELS Learning Path: ${pathway.label}`)
    .setDescription(pathway.theme)
    .setColor(0x2563eb)
    .addFields(
      {
        name: 'This week',
        value: pathway.tasks.map((task) => `- ${task}`).join('\n'),
      },
      {
        name: 'Field positions',
        value: pathway.fieldMatches.length
          ? pathway.fieldMatches.map((topic) => `- ${topic.name} (score ${topic.score})`).join('\n')
          : 'No FieldExplorer match yet. Add interests for a more specific path.',
      },
      {
        name: 'Next moves',
        value: pathway.nextSteps.map((step) => `- ${step}`).join('\n'),
      },
    )
    .setTimestamp(new Date());
}

export function buildWeeklyChallengeEmbed({ challenge }) {
  const embed = new EmbedBuilder()
    .setTitle(`KELS Micro-Learning: ${challenge.title}`)
    .setDescription(challenge.mission)
    .setColor(0x0f766e)
    .addFields(
      {
        name: 'Deliverable',
        value: challenge.deliverable,
      },
      {
        name: 'Reflection prompts',
        value: challenge.reflection.map((prompt) => `- ${prompt}`).join('\n'),
      },
      {
        name: 'FieldExplorer hints',
        value: challenge.fieldMatches.length
          ? challenge.fieldMatches.map((topic) => `- ${topic.name}`).join('\n')
          : 'No current field hint. Pick any KELS post that caught your attention.',
      },
    )
    .setTimestamp(new Date());

  if (challenge.seedPost) {
    embed.addFields({
      name: 'Possible seed post',
      value: lineFor(challenge.seedPost),
    });
  }

  return embed;
}

export function buildReflectionEmbed({ guide }) {
  return new EmbedBuilder()
    .setTitle(`KELS Reflection Coach: ${guide.kind}`)
    .setDescription('Use these prompts to turn information into a research or teaching move.')
    .setColor(0x7c3aed)
    .addFields(
      {
        name: 'Reflection prompts',
        value: guide.prompts.map((prompt) => `- ${prompt}`).join('\n'),
      },
      {
        name: 'Field positions',
        value: guide.fieldMatches.length
          ? guide.fieldMatches.map((topic) => `- ${topic.name} (score ${topic.score})`).join('\n')
          : 'No FieldExplorer match yet.',
      },
      {
        name: 'Thread draft',
        value: truncate(guide.threadDraft, 900),
      },
    )
    .setTimestamp(new Date());
}

export function buildBetterQuestionEmbed({ result }) {
  return new EmbedBuilder()
    .setTitle(`KELS Ask Better: ${result.focus}`)
    .setDescription('A scaffold for turning a broad question into a more answerable research/community question.')
    .setColor(0x0f766e)
    .addFields(
      {
        name: 'Sharper versions',
        value: result.improvedQuestions.map((question, index) => `${index + 1}. ${question}`).join('\n'),
      },
      {
        name: 'Keywords',
        value: result.keywords.length ? result.keywords.join(', ') : 'No keywords detected.',
      },
      {
        name: 'Thread draft',
        value: truncate(result.threadDraft, 900),
      },
    )
    .setTimestamp(new Date());
}

export function buildPaperCoachEmbed({ coach }) {
  return new EmbedBuilder()
    .setTitle(`KELS Paper Coach: ${coach.level}`)
    .setDescription('A scaffolded reading path. Use it to read for contribution, method, and transfer to your own context.')
    .setColor(0x2563eb)
    .addFields(
      {
        name: 'Reading order',
        value: coach.readingOrder.map((item, index) => `${index + 1}. ${item}`).join('\n'),
      },
      {
        name: 'Checkpoints',
        value: coach.checkpoints.map((item) => `- ${item}`).join('\n'),
      },
      {
        name: 'Mini task',
        value: coach.miniTask,
      },
      {
        name: 'Discussion questions',
        value: coach.discussionQuestions.map((item) => `- ${item}`).join('\n'),
      },
      {
        name: 'Field positions',
        value: coach.fieldMatches.length
          ? coach.fieldMatches.map((topic) => `- ${topic.name} (score ${topic.score})`).join('\n')
          : 'No FieldExplorer match yet.',
      },
    )
    .setTimestamp(new Date());
}

export function buildPeerLearningEmbed({ match, days = 30 }) {
  return new EmbedBuilder()
    .setTitle(`KELS Peer Learning Candidates: last ${days} days`)
    .setDescription(match.threadSeed)
    .setColor(0x7c3aed)
    .addFields(
      {
        name: 'Field positions',
        value: match.fieldMatches.length
          ? match.fieldMatches.map((topic) => `- ${topic.name} (score ${topic.score})`).join('\n')
          : 'No FieldExplorer match yet.',
      },
      {
        name: 'Candidate participants',
        value: match.candidates.length
          ? match.candidates.map((candidate) => [
            `- ${candidate.userName} (score ${candidate.score})`,
            candidate.evidence.length ? `  evidence: ${candidate.evidence.map((item) => `${item.source} in #${item.channelName || 'unknown'}`).join(', ')}` : '',
          ].filter(Boolean).join('\n')).join('\n').slice(0, 1000)
          : 'No candidate participants found yet.',
      },
      {
        name: 'Suggested next step',
        value: 'Use this as an organizer-only cue. Invite people manually or create a low-stakes thread without exposing private activity details.',
      },
    )
    .setTimestamp(new Date());
}

export function buildDeadlinesEmbed(deadlines, { days = 60, category = 'all' } = {}) {
  const embed = new EmbedBuilder()
    .setTitle(`KELS Deadlines: ${CATEGORY_LABELS[category] ?? category}`)
    .setDescription(
      deadlines.length
        ? `Upcoming extracted deadline(s) in the next ${days} day(s).`
        : `No indexed deadlines found in the next ${days} day(s).`,
    )
    .setColor(0xdc2626)
    .setTimestamp(new Date());

  if (deadlines.length) {
    embed.addFields({
      name: 'Upcoming',
      value: deadlines.slice(0, 12).map(deadlineLine).join('\n').slice(0, 1000),
    });
  }

  return embed;
}

export function buildArticleRecommendationEmbed(article, qwenSummary = null) {
  const authors = article.authors?.length ? article.authors.join(', ') : 'Authors unavailable';
  const abstract = article.abstract ? truncate(article.abstract, 420) : 'Abstract unavailable from OpenAlex.';

  return new EmbedBuilder()
    .setTitle('KELS 이 주의 추천 아티클')
    .setDescription(`**${article.title}**`)
    .setColor(0x7c3aed)
    .addFields(
      {
        name: 'Journal',
        value: article.source || 'Unknown journal',
        inline: true,
      },
      {
        name: 'Date',
        value: article.publicationDate || 'Unknown date',
        inline: true,
      },
      {
        name: 'Authors',
        value: truncate(authors, 220),
      },
      {
        name: '선정 이유',
        value: buildRecommendationReason(article),
      },
      ...articleVotingFields(article),
      ...articleSummaryFields(qwenSummary),
      {
        name: '초록 미리보기',
        value: abstract,
      },
      {
        name: 'Link',
        value: article.url,
      },
      {
        name: '참여 프롬프트',
        value: buildParticipationNudge({
          title: article.title,
          issueTopic: qwenSummary?.issueTopic,
          kind: 'recommended article',
        }),
      },
    )
    .setFooter({ text: 'Source: OpenAlex. Journal pool: JLS, IJCSCL, ETR&D, Instructional Science, Cognition and Instruction.' })
    .setTimestamp(new Date());
}

export function buildTechSignalEmbed(paper, qwenDigest = null) {
  if (paper.kind === 'github') return buildGithubTechSignalEmbed(paper, qwenDigest);
  const authors = paper.authors?.length ? paper.authors.join(', ') : 'Authors unavailable';
  const digest = qwenDigest ?? {};

  return new EmbedBuilder()
    .setTitle('KELS Tech Signal')
    .setDescription(`**${paper.title}**`)
    .setColor(0x0f766e)
    .addFields(
      {
        name: 'arXiv',
        value: paper.primaryCategory || paper.categories?.[0] || 'Unknown category',
        inline: true,
      },
      {
        name: 'Date',
        value: paper.publishedAt ? paper.publishedAt.slice(0, 10) : 'Unknown date',
        inline: true,
      },
      {
        name: 'Authors',
        value: truncate(authors, 220),
      },
      {
        name: '왜 지금 볼 만한가',
        value: digest.whyNow || buildTechPaperReason(paper),
      },
      {
        name: '교육공학 적용',
        value: digest.edTechApplication || 'AI tutor, 자동 피드백, 학습 지원 도구 설계 관점에서 검토할 수 있습니다.',
      },
      {
        name: 'Learning Sciences 적용',
        value: digest.learningSciencesApplication || '학습자-도구-환경 상호작용과 trace data 해석 관점에서 연결해 볼 수 있습니다.',
      },
      {
        name: '이번 주 이슈테이킹 토픽',
        value: digest.issueTopic || '이 기술은 학습자의 판단과 자기조절을 돕는가, 아니면 학습 과정을 과도하게 대리하는가?',
      },
      {
        name: '토론 질문',
        value: digest.discussionQuestion || 'KELS 연구 맥락에 적용한다면 가장 먼저 검증해야 할 학습 성과는 무엇일까요?',
      },
      {
        name: 'Links',
        value: `[Abstract](${paper.url})${paper.pdfUrl ? ` | [PDF](${paper.pdfUrl})` : ''}`,
      },
      {
        name: '참여 프롬프트',
        value: buildParticipationNudge({
          title: paper.title,
          issueTopic: digest.issueTopic,
          kind: 'tech signal',
        }),
      },
    )
    .setFooter({ text: 'Source: arXiv. Selected from recent AI/ML/HCI tech papers for KELS research translation.' })
    .setTimestamp(new Date());
}

function buildGithubTechSignalEmbed(repo, qwenDigest = null) {
  const digest = qwenDigest ?? {};
  const meta = [
    repo.language ? `Language: ${repo.language}` : '',
    Number.isFinite(repo.stars) ? `Stars: ${repo.stars.toLocaleString('en-US')}` : '',
    repo.pushedAt ? `Updated: ${repo.pushedAt.slice(0, 10)}` : '',
  ].filter(Boolean).join(' | ') || 'GitHub repository';

  return new EmbedBuilder()
    .setTitle('KELS Tech Signal')
    .setDescription(`**${repo.title}**\n${truncate(repo.description || 'No repository description available.', 420)}`)
    .setColor(0x0f766e)
    .addFields(
      {
        name: 'GitHub',
        value: meta,
      },
      {
        name: '왜 지금 볼 만한가',
        value: digest.whyNow || buildGithubRepoReason(repo),
      },
      {
        name: '교육공학 적용',
        value: digest.edTechApplication || '프로토타입, 수업 설계 도구, AI 피드백 워크플로우로 옮겨볼 수 있는지 검토할 만합니다.',
      },
      {
        name: 'Learning Sciences 적용',
        value: digest.learningSciencesApplication || '학습자-도구 상호작용, trace data, 협력학습 지원의 분석 단위로 연결해 볼 수 있습니다.',
      },
      {
        name: '이번 주 이슈테이킹 토픽',
        value: digest.issueTopic || '오픈소스 AI 도구가 연구 방법을 넓히는가, 아니면 검증되지 않은 자동화를 빠르게 확산시키는가?',
      },
      {
        name: '토론 질문',
        value: digest.discussionQuestion || 'KELS 연구 맥락에서 이 repo를 실험한다면 어떤 학습 장면과 평가 지표를 먼저 정해야 할까요?',
      },
      {
        name: 'Link',
        value: repo.url,
      },
      {
        name: '참여 프롬프트',
        value: buildParticipationNudge({
          title: repo.title,
          issueTopic: digest.issueTopic,
          kind: 'tech signal',
        }),
      },
    )
    .setFooter({ text: 'Source: GitHub. Selected against recent arXiv papers as this week’s stronger KELS tech signal.' })
    .setTimestamp(new Date());
}

export function buildMonthlyRadarEmbed({ posts, deadlines, monthLabel, knowledgeFlow = null }) {
  const grouped = groupPosts(posts);
  const topTags = countTopTags(posts).slice(0, 8);
  const flow = knowledgeFlow ?? buildKnowledgeFlow(posts);
  const embed = new EmbedBuilder()
    .setTitle(`KELS Monthly Knowledge Flow: ${monthLabel}`)
    .setDescription('지난 한 달 KELS 채널에서 형성된 주제 흐름, 연결 가능성, 참여 포인트입니다.')
    .setColor(0x0f766e)
    .setTimestamp(new Date());

  embed.addFields(
    {
      name: 'Community pulse',
      value: flow.categoryCounts.length
        ? flow.categoryCounts.slice(0, 6).map((item) => `${item.name} ${item.count}`).join(' | ')
        : 'No indexed activity this month.',
    },
    {
      name: 'Emerging topics',
      value: flow.topics.length ? flow.topics.slice(0, 8).map(topicFlowLine).join('\n').slice(0, 1000) : 'No topic signals yet.',
    },
    {
      name: 'Knowledge bridges',
      value: flow.bridgeOpportunities.length
        ? flow.bridgeOpportunities.map((item) => `- ${item.prompt}`).join('\n').slice(0, 1000)
        : 'No cross-channel bridges detected yet.',
    },
    {
      name: 'Participation nudges',
      value: flow.participationPrompts.length
        ? flow.participationPrompts.map((item) => `- ${item}`).join('\n').slice(0, 1000)
        : '이번 달에는 관심 주제 하나를 골라 thread에서 적용 가능성을 남겨보세요.',
    },
  );

  for (const key of ['jobs', 'cfp', 'seminars', 'resources', 'events']) {
    const items = grouped[key] ?? [];
    embed.addFields({
      name: `${CATEGORY_LABELS[key] ?? key} (${items.length})`,
      value: items.length ? items.slice(0, 4).map(lineFor).join('\n').slice(0, 1000) : 'No indexed items.',
    });
  }

  embed.addFields(
    {
      name: 'Upcoming deadlines',
      value: deadlines.length ? deadlines.slice(0, 6).map(deadlineLine).join('\n').slice(0, 1000) : 'No upcoming deadlines found.',
    },
    {
      name: 'Frequent tags',
      value: topTags.length ? topTags.map(([tag, count]) => `#${tag} (${count})`).join(', ') : 'No tags yet.',
    },
    {
      name: 'Evidence trail',
      value: flow.evidencePosts.length
        ? flow.evidencePosts.slice(0, 5).map((item) => `- #${item.topic} ${lineFor(item.post)}`).join('\n').slice(0, 1000)
        : 'No evidence posts yet.',
    },
  );

  return embed;
}

function topicFlowLine(topic) {
  const channels = topic.channels.slice(0, 2).map((channel) => `#${channel}`).join(', ');
  return `- #${topic.topic} (${topic.count}) ${channels}`;
}

export function buildDeadlineReminderEmbed(reminders, daysUntil) {
  return new EmbedBuilder()
    .setTitle(`KELS Deadline Reminder: D-${daysUntil}`)
    .setDescription(`${daysUntil} day(s) left for these indexed KELS opportunities.`)
    .setColor(daysUntil <= 2 ? 0xdc2626 : 0xb45309)
    .addFields({
      name: 'Upcoming',
      value: reminders.slice(0, 10).map(deadlineLine).join('\n').slice(0, 1000),
    })
    .setTimestamp(new Date());
}

export function buildEventReminderEmbed(events, {
  title = 'KELS Event Reminder: 1 hour left',
  description = 'Announcement channel event is starting soon.',
} = {}) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(0xb45309)
    .addFields({
      name: 'Upcoming',
      value: events.slice(0, 8).map(eventReminderLine).join('\n').slice(0, 1000),
    })
    .setTimestamp(new Date());
}

export function buildHelpEmbed() {
  return new EmbedBuilder()
    .setTitle('KELS Curator Bot')
    .setDescription('Find jobs, CFPs, seminars, resources, and personalized research-community alerts.')
    .setColor(0x1d4ed8)
    .addFields(
      {
        name: 'For members',
        value: [
          '`/digest category:jobs days:14`',
          '`/deadlines days:60 category:cfp`',
          '`/search query:"learning analytics" category:all`',
          '`/watch action:add keyword:"assistant professor"`',
          '`/watch action:list`',
          '`/field-map query:"multimodal learning analytics"`',
          '`/venue-scout text:"paper abstract or project idea"`',
          '`/field-pulse days:14`',
          '`/anon-submit category:career text:"..."`',
          '`/learning-path stage:phd interests:"AIED feedback"`',
          '`/weekly-challenge focus:paper`',
          '`/ask-better question:"..."`',
          '`/paper-coach text:"paper abstract"`',
          '`/submit-cfp title:... deadline:... url:...`',
        ].join('\n'),
      },
      {
        name: 'For moderators',
        value: [
          '`/backfill channel:#job_academic limit:100`',
          '`/post-digest category:all days:7 channel:#newsletter`',
          '`/post-field-pulse days:14 channel:#academic-resources`',
          '`/peer-learning topic:"AIED teacher feedback"`',
          '`/stats`',
        ].join('\n'),
      },
    );
}

function deadlineLine(deadline) {
  const post = deadline.post;
  const tagText = post.tags?.length ? ` | ${post.tags.slice(0, 2).map((tag) => `#${tag}`).join(' ')}` : '';
  return `- **${deadline.iso}** [#${post.channelName}](${postUrl(post)}) ${truncate(post.content, 120)}${tagText}`;
}

function eventReminderLine(event) {
  const post = event.post;
  const localTime = formatEventTime(event.startsAt, event.timeZone);
  const links = eventLinksLine(post.eventLinks);
  return `- **${localTime}** [#${post.channelName}](${postUrl(post)}) ${truncate(post.content, 120)}${links}`;
}

function eventLinksLine(eventLinks = {}) {
  const parts = [];
  if (eventLinks.zoomLinks?.[0]) parts.push(`[Zoom](${eventLinks.zoomLinks[0]})`);
  if (eventLinks.rsvpLinks?.[0]) parts.push(`[RSVP](${eventLinks.rsvpLinks[0]})`);
  if (eventLinks.formLinks?.[0]) parts.push(`[Form](${eventLinks.formLinks[0]})`);
  return parts.length ? ` | ${parts.join(' ')}` : '';
}

export function formatWatchList(keywords) {
  if (!keywords.length) return 'Your watchlist is empty. Add one with `/watch action:add keyword:<term>`.';
  return `Watching: ${keywords.map((keyword) => `\`${keyword}\``).join(', ')}`;
}

export function formatTopicList(topics) {
  if (!topics.length) return 'Your KELS profile is empty. Add one with `/profile action:add topic:<term>`.';
  return `Profile topics: ${topics.map((topic) => `\`${topic}\``).join(', ')}`;
}

export function buildCfpContent({ title, deadline, url, notes, userMention }) {
  const noteLine = notes ? `\nNotes: ${notes}` : '';
  return [
    `**${title}**`,
    `Deadline: ${deadline}`,
    `URL: ${url}${noteLine}`,
    `Submitted by ${userMention}`,
  ].join('\n');
}

export function formatStats(stats) {
  const categoryLines = Object.entries(stats.byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => `- ${category}: ${count}`)
    .join('\n') || '- none: 0';
  const channelLines = Object.entries(stats.byChannel)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([channel, count]) => `- #${channel}: ${count}`)
    .join('\n') || '- none: 0';

  return [
    `Indexed posts: ${stats.total}`,
    `Newest: ${stats.newest ?? 'n/a'}`,
    `Oldest: ${stats.oldest ?? 'n/a'}`,
    '',
    'Categories:',
    categoryLines,
    '',
    'Top channels:',
    channelLines,
  ].join('\n');
}

export function formatHealth(health) {
  const permissionLines = Object.entries(health.permissions)
    .map(([name, ok]) => `- ${name}: ${ok ? 'ok' : 'missing'}`)
    .join('\n');
  const channelLines = health.configuredChannels.length
    ? health.configuredChannels.map((channel) => `- ${channel}`).join('\n')
    : '- all visible public channels';

  return [
    `Bot: ${health.botTag}`,
    `Guild: ${health.guildName}`,
    `Current channel: #${health.channelName}`,
    `Archive posts: ${health.stats.total}`,
    `Newest indexed post: ${health.stats.newest ?? 'n/a'}`,
    `Auto-backfill: ${health.autoBackfillOnReady ? `on, limit ${health.autoBackfillLimit}` : 'off'}`,
    `Field Explorer: ${health.fieldExplorerEnabled ? `on, cached topics ${health.fieldExplorerTopicCount}` : 'off'}`,
    '',
    'Current-channel permissions:',
    permissionLines,
    '',
    'Configured index channels:',
    channelLines,
  ].join('\n');
}

function groupPosts(posts) {
  const groups = {};
  for (const post of posts) {
    const key = mapCategory(post.category);
    groups[key] ??= [];
    groups[key].push(post);
  }
  return groups;
}

function articleVotingFields(article) {
  const votes = article.curationVotes;
  if (!votes) return [];
  const methodSignals = votes.methodSignals?.length ? votes.methodSignals.join(', ') : '특정 방법론 신호 약함';
  const discussionSignals = votes.discussionSignals?.length ? votes.discussionSignals.join(', ') : '토론 신호 약함';
  return [
    {
      name: 'RAG voting scorecard',
      value: [
        `총점 ${votes.total}/100`,
        `archive 관심사 ${votes.archiveInterest}/35 · 최신성 ${votes.recency}/25`,
        `방법론 다양성 ${votes.methodDiversity}/20 · 토론 가능성 ${votes.discussionPotential}/20`,
        `방법론 신호: ${methodSignals}`,
        `토론 신호: ${discussionSignals}`,
      ].join('\n').slice(0, 1000),
    },
  ];
}

function articleSummaryFields(qwenSummary) {
  if (!qwenSummary) {
    return [
      {
        name: 'KELS 읽기 가이드',
        value: 'Qwen 요약을 사용할 수 없어 OpenAlex 초록 미리보기만 표시합니다. 아래 초록에서 문제의식, 방법론, KELS 적용 가능성을 중심으로 읽어보세요.',
      },
    ];
  }
  return [
    {
      name: '이 논문이 던지는 문제',
      value: qwenSummary.problem || 'Qwen summary unavailable.',
    },
    {
      name: '핵심 기여',
      value: qwenSummary.contribution || 'Qwen summary unavailable.',
    },
    {
      name: '방법론 포인트',
      value: qwenSummary.method || 'Qwen summary unavailable.',
    },
    {
      name: 'KELS 연구 적용 아이디어',
      value: qwenSummary.kelsApplication || 'Qwen summary unavailable.',
    },
    {
      name: '읽으면서 볼 쟁점',
      value: qwenSummary.readingLens || qwenSummary.issueTopic || 'Qwen summary unavailable.',
    },
    {
      name: '이번 주 이슈테이킹 토픽',
      value: qwenSummary.issueTopic || 'Qwen summary unavailable.',
    },
    {
      name: '토론 질문',
      value: qwenSummary.questions?.length
        ? qwenSummary.questions.map((question) => `- ${question}`).join('\n')
        : 'Qwen questions unavailable.',
    },
  ];
}

function splitSentences(text = '') {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function countTopTags(posts) {
  const counts = new Map();
  for (const post of posts) {
    for (const tag of post.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}

function formatEventTime(startsAt, timeZone = 'America/Los_Angeles') {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: 'short',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }).format(new Date(startsAt));
  } catch {
    return startsAt;
  }
}
