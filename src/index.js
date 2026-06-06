import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
} from 'discord.js';
import { fetchCandidateTechPapers, scoreTechPaper, selectWeeklyTechPaper } from './arxiv.js';
import { fetchKsetUpdates } from './kset-board.js';
import { fetchKaeimUpdates, KAEIM_NOTICE_URL } from './kaeim-board.js';
import { fetchJournalArticles, KCI_JOURNALS } from './kci.js';
import { fetchIntlSources } from './intl-sources.js';
import {
  buildCommunityGraph,
  buildCurationFeedback,
  suggestProfileTopics,
} from './community-intelligence.js';
import { buildConnectionSuggestions, formatConnectionSuggestions } from './connections.js';
import { loadConfig } from './config.js';
import {
  buildCfpContent,
  buildDeadlinesEmbed,
  buildDeadlineReminderEmbed,
  buildDigestEmbed,
  buildHelpEmbed,
  buildAnonymousAdvicePostPayload,
  buildAnonymousReviewClosedPayload,
  buildAnonymousReviewPayload,
  buildArticleRecommendationEmbed,
  buildCommunityGraphEmbed,
  buildCurationFeedbackEmbed,
  buildEventReminderEmbed,
  buildBetterQuestionEmbed,
  buildFieldExplorerEmbed,
  buildFieldPulseEmbed,
  buildLearningPathEmbed,
  buildMonthlyRadarEmbed,
  buildPaperCoachEmbed,
  buildPeerLearningEmbed,
  buildReflectionEmbed,
  buildTechSignalEmbed,
  buildVenueScoutEmbed,
  buildProfileSuggestionsEmbed,
  buildWeeklyChallengeEmbed,
  buildSearchEmbed,
  formatTopicList,
  formatHealth,
  formatStats,
  formatWatchList,
} from './format.js';
import { buildVenueScout, loadFieldExplorerTopics, rankFieldTopics } from './field-explorer.js';
import { fetchVerifiedCfp, matchCfpForQuery, formatVerifiedCfpBlock, computeDaysUntil, cfpAlertsForDay, formatCfpAlertMessage } from './fieldexplorer-cfp.js';
import { parseVenueList, normalizeVenue, parseTags, clampRating, buildAnnotationPayload, submitReview } from './fieldexplorer-review.js';
import { rankSubmissionFit, formatScorecard } from './submission-fit.js';
import { buildVenuePayload, submitVenue } from './fieldexplorer-venue-add.js';
import { fetchVenueReviews, formatVenueReviews, formatWeeklyDigest, buildWeeklyDigestData } from './fieldexplorer-digest.js';
import { gradeQuiz, formatQuizQuestion, formatQuizFeedback, formatLearnModules } from './fieldexplorer-quiz.js';
import { readFile as fxReadFile } from 'node:fs/promises';
import { normalizePost } from './extractors.js';
import { fetchCandidateGithubRepos, scoreGithubRepo, selectWeeklyGithubRepo } from './github-repos.js';
import {
  buildBetterQuestion,
  buildLearningPathway,
  buildMicroChallenge,
  buildPaperCoach,
  buildPeerLearningMatch,
  buildReflectionGuide,
} from './learning-experience.js';
import { createChatLogger } from './logger.js';
import { detectSpam } from './moderation.js';
import {
  buildOnboardingFollowupMessage,
  buildOnboardingPathway,
  formatOnboardingPathway,
} from './onboarding-pathway.js';
import { fetchCandidateArticles, selectWeeklyArticle } from './openalex.js';
import {
  answerArchiveQuestionWithQwen,
  analyzeCfpWithQwen,
  buildOnboardingReplyWithQwen,
  buildTopicDigestWithQwen,
  createQwenClient,
  explainProfileMatchWithQwen,
  extractIntroFullNameWithQwen,
  extractOnboardingProfileWithQwen,
  inferMemberRolesWithQwen,
  summarizeGithubRepoWithQwen,
  suggestForumWithQwen,
  summarizeTechPaperWithQwen,
  summarizeArticleWithQwen,
} from './qwen.js';
import {
  archiveEvidenceStatus,
  formatArchiveEvidencePanel,
  inferArchiveFilters,
  rankPostsForQuery,
  relatedOriginals,
  scoreCandidateAgainstArchive,
} from './relevance.js';
import { resolveReactionTargets } from './reactions.js';
import { JsonStore } from './storage.js';

const config = loadConfig();
const store = new JsonStore(config.dataDir);
const qwen = createQwenClient(config);
const chatLogger = createChatLogger(config, store);
let autoReactionTargetCache = { guildId: '', tokenKey: '', expiresAt: 0, targets: [] };
let fieldExplorerTopicCache = { filePath: '', loadedAt: 0, topics: [] };

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User],
});

// Liveness heartbeat: a fresh timestamp lets the external health-check detect a
// hung (logged-in but not processing) bot, not just a dead process.
function startHeartbeat() {
  const path = join(config.dataDir, 'heartbeat.txt');
  const beat = () => { try { writeFileSync(path, new Date().toISOString()); } catch { /* ignore */ } };
  beat();
  setInterval(beat, 60 * 1000);
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`KELS Curator Bot ready as ${readyClient.user.tag}`);
  startHeartbeat();
  scheduleWeeklyDigest();
  scheduleWeeklyArticleRecommendation();
  scheduleWeeklyTechSignal();
  scheduleKsetUpdates();
  scheduleKaeimUpdates();
  scheduleKciJournalDigest();
  scheduleIntlFeeds();
  scheduleMonthlyRadar();
  scheduleDeadlineReminders();
  scheduleFieldExplorerCfpAlerts();
  scheduleFieldExplorerWeeklyDigest();
  scheduleEventReminders();
  scheduleRolelessReminders();
  scheduleOnboardingFollowups();
  if (config.autoBackfillOnReady) {
    await autoBackfillConfiguredChannels(readyClient).catch((error) => {
      console.error('Auto-backfill failed', error);
    });
  }
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (await deleteSpamIfNeeded(message)) return;
    if (!shouldIndexMessage(message)) return;
    await addAutoReactions(message);
    const post = await indexMessage(message);
    await handleOnboardingIntro(post, message);
    await notifyWatchers(post, message);
    await notifyProfileMatches(post, message);
    await suggestForumCleanup(post, message);
    autoTagMemberRoles(post, message).catch((error) => {
      console.error('Failed to auto-tag member roles', error);
    });
  } catch (error) {
    console.error('Failed to index message', error);
  }
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  try {
    await logReactionAdd(reaction, user);
  } catch (error) {
    console.error('Failed to log reaction add', error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
  if (interaction.isButton()) {
    await handleButtonInteraction(interaction);
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  await logSlashCommandUsage(interaction);

  if (interaction.commandName === 'digest') {
    const category = interaction.options.getString('category') ?? 'all';
    const days = interaction.options.getInteger('days') ?? 7;
    const posts = await store.getPosts({ category, days });
    await interaction.reply({ embeds: [buildDigestEmbed(posts, { category, days })], ephemeral: true });
    return;
  }

  if (interaction.commandName === 'search') {
    const query = interaction.options.getString('query', true);
    const category = interaction.options.getString('category') ?? 'all';
    const posts = await store.getPosts({ category, days: 365, query });
    await interaction.reply({ embeds: [buildSearchEmbed(posts, query, category)], ephemeral: true });
    return;
  }

  if (interaction.commandName === 'watch') {
    const action = interaction.options.getString('action', true);
    const keyword = interaction.options.getString('keyword') ?? '';
    const result = await handleWatch(interaction.user.id, action, keyword);
    await interaction.reply({ content: result, ephemeral: true });
    return;
  }

  if (interaction.commandName === 'profile') {
    const action = interaction.options.getString('action', true);
    const topic = interaction.options.getString('topic') ?? '';
    const result = await handleProfile(interaction.user.id, action, topic);
    await interaction.reply({ content: result, ephemeral: true });
    return;
  }

  if (interaction.commandName === 'ask-kels') {
    await interaction.deferReply({ ephemeral: true });
    const query = interaction.options.getString('query', true);
    const category = interaction.options.getString('category') ?? 'all';
    const result = await handleAskKels(interaction, query, category);
    await interaction.editReply(result);
    return;
  }

  if (interaction.commandName === 'cfp-helper') {
    await interaction.deferReply({ ephemeral: true });
    const text = interaction.options.getString('text', true);
    let result = await analyzeCfpWithQwen(qwen, text);
    // Augment with FieldExplorer verified CFP (provenance-tagged), when configured.
    if (config.fieldExplorerCfpEnabled) {
      const rows = await fetchVerifiedCfp({
        supabaseUrl: config.fieldExplorerSupabaseUrl,
        supabaseKey: config.fieldExplorerSupabaseKey,
      });
      const matched = matchCfpForQuery(rows, text, { limit: 5 });
      const block = formatVerifiedCfpBlock(matched.length ? matched : rows, { now: new Date() });
      if (block) result = `${result}\n\n${block}`;
    }
    await chatLogger.log({
      eventType: 'cfp-helper',
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      channelName: displayChannelName(interaction.channel),
      userId: interaction.user.id,
      userName: interaction.user.username,
      commandName: 'cfp-helper',
      query: text,
      responseExcerpt: result,
      metadata: { qwenEnabled: qwen.enabled },
    });
    await interaction.editReply(truncateDiscord(result, 1900));
    return;
  }

  if (interaction.commandName === 'topic-digest') {
    await interaction.deferReply({ ephemeral: true });
    const topic = interaction.options.getString('topic', true);
    const days = interaction.options.getInteger('days') ?? 30;
    const posts = await store.getPosts({ category: 'all', days, query: topic });
    const result = await buildTopicDigestWithQwen(qwen, topic, posts.slice(0, 10));
    await chatLogger.log({
      eventType: 'topic-digest',
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      channelName: displayChannelName(interaction.channel),
      userId: interaction.user.id,
      userName: interaction.user.username,
      commandName: 'topic-digest',
      query: topic,
      responseExcerpt: result,
      metadata: { days, matchedPosts: posts.length, qwenEnabled: qwen.enabled },
    });
    await interaction.editReply(truncateDiscord(result, 1900));
    return;
  }

  if (interaction.commandName === 'field-map') {
    await interaction.deferReply({ ephemeral: true });
    const query = interaction.options.getString('query', true);
    const days = interaction.options.getInteger('days') ?? 180;
    const result = await handleFieldMap(query, days);
    await chatLogger.log({
      eventType: 'field-map',
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      channelName: displayChannelName(interaction.channel),
      userId: interaction.user.id,
      userName: interaction.user.username,
      commandName: 'field-map',
      query,
      responseExcerpt: result.topics.map((topic) => `T${topic.id} ${topic.name}`).join('; '),
      metadata: { days, matchedTopics: result.topics.length, relatedPosts: result.relatedPosts.length },
    });
    await interaction.editReply({
      embeds: [buildFieldExplorerEmbed({
        query,
        topics: result.topics,
        relatedPosts: result.relatedPosts,
        label: config.fieldExplorerLabel,
        appUrl: config.fieldExplorerAppUrl,
        enabled: result.enabled,
      })],
    });
    return;
  }

  if (interaction.commandName === 'venue-scout') {
    await interaction.deferReply({ ephemeral: true });
    const query = interaction.options.getString('text', true);
    const days = interaction.options.getInteger('days') ?? 180;
    const result = await handleVenueScout(query, days);
    await chatLogger.log({
      eventType: 'venue-scout',
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      channelName: displayChannelName(interaction.channel),
      userId: interaction.user.id,
      userName: interaction.user.username,
      commandName: 'venue-scout',
      query,
      responseExcerpt: result.scout.tiers.map((tier) => `${tier.tier}: ${tier.topicName}`).join('; '),
      metadata: { days, tiers: result.scout.tiers.length, relatedPosts: result.relatedPosts.length },
    });
    await interaction.editReply({
      embeds: [buildVenueScoutEmbed({
        query,
        scout: result.scout,
        relatedPosts: result.relatedPosts,
        label: config.fieldExplorerLabel,
        appUrl: config.fieldExplorerAppUrl,
        enabled: result.enabled,
      })],
    });
    // Higher-precision fingerprint scorecard (topic + methodology + CFP), when enabled.
    const scorecard = await buildScorecardBlock(query);
    if (scorecard) {
      await interaction.followUp({ ephemeral: true, content: truncateDiscord(scorecard, 1900) });
    }
    return;
  }

  if (interaction.commandName === 'review') {
    await interaction.deferReply({ ephemeral: true });
    const venueQuery = interaction.options.getString('venue', true);
    const rating = clampRating(interaction.options.getInteger('rating', true));
    const comment = interaction.options.getString('comment', true);
    const tags = parseTags(interaction.options.getString('tags') ?? '');

    if (!config.fieldExplorerReviewEnabled) {
      await interaction.editReply('리뷰 쓰기 브릿지가 아직 비활성화되어 있어요. 운영자가 `FIELD_EXPLORER_REVIEW_ENABLED`를 설정하면 사용할 수 있습니다.');
      return;
    }
    const venues = await getFieldExplorerVenueList();
    const venue = normalizeVenue(venueQuery, venues);
    if (!venue) {
      await interaction.editReply(`"${venueQuery}"와 매칭되는 FieldExplorer venue를 찾지 못했어요. 정식 명칭(예: Journal of the Learning Sciences)으로 다시 시도해 주세요.`);
      return;
    }
    const payload = buildAnnotationPayload({
      venueName: venue.name, venueType: venue.type, rating, comment, tags,
      discordUserId: interaction.user.id,
    });
    const outcome = await submitReview({
      supabaseUrl: config.fieldExplorerSupabaseUrl,
      serviceKey: config.fieldExplorerServiceKey,
      payload,
    });
    await chatLogger.log({
      eventType: 'review',
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      channelName: displayChannelName(interaction.channel),
      userId: interaction.user.id,
      userName: interaction.user.username,
      commandName: 'review',
      query: `${venue.name} | ${rating}★`,
      responseExcerpt: outcome.ok ? 'ok' : `fail:${outcome.error}`,
      metadata: { venue: venue.name, rating, ok: outcome.ok },
    });
    if (outcome.ok) {
      const stars = '⭐'.repeat(rating);
      const tagText = tags.length ? `\n태그: ${tags.join(', ')}` : '';
      await interaction.editReply(
        `✅ **${venue.name}** 리뷰가 FieldExplorer에 추가됐어요. ${stars}\n> ${comment}${tagText}\n\n앱 리뷰 피드에서 확인: ${config.fieldExplorerAppUrl || 'FieldExplorer'}`,
      );
    } else {
      await interaction.editReply(`리뷰 저장에 실패했어요 (${outcome.error}). 운영자에게 알려주세요.`);
    }
    return;
  }

  if (interaction.commandName === 'add-venue') {
    await interaction.deferReply({ ephemeral: true });
    if (!config.fieldExplorerAddVenueEnabled) {
      await interaction.editReply('venue 추가 브릿지가 아직 비활성화되어 있어요. 운영자가 `FIELD_EXPLORER_ADD_VENUE_ENABLED`를 설정하면 사용할 수 있습니다.');
      return;
    }
    const built = buildVenuePayload({
      name: interaction.options.getString('name', true),
      type: interaction.options.getString('type') ?? 'Journal',
      categories: interaction.options.getString('categories', true),
      impact: interaction.options.getString('impact') ?? null,
      cfpDeadline: interaction.options.getString('cfp_deadline') ?? null,
      discordUserId: interaction.user.id,
    });
    if (built.error) {
      await interaction.editReply(built.error);
      return;
    }
    const outcome = await submitVenue({
      supabaseUrl: config.fieldExplorerSupabaseUrl,
      serviceKey: config.fieldExplorerServiceKey,
      payload: built.payload,
    });
    await chatLogger.log({
      eventType: 'add-venue',
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      channelName: displayChannelName(interaction.channel),
      userId: interaction.user.id,
      userName: interaction.user.username,
      commandName: 'add-venue',
      query: `${built.payload.name} (${built.payload.type})`,
      responseExcerpt: outcome.ok ? 'ok' : `fail:${outcome.error}`,
      metadata: { venue: built.payload.name, ok: outcome.ok, duplicate: outcome.duplicate },
    });
    if (outcome.ok) {
      const cats = built.payload.categories.join(', ');
      const q = built.payload.impact ? ` · ${built.payload.impact}` : '';
      await interaction.editReply(
        `✅ **${built.payload.name}** (${built.payload.type}${q})를 FieldExplorer에 추가했어요.\n카테고리: ${cats}\n\n앱을 새로고침하면 네트워크에 나타납니다: ${config.fieldExplorerAppUrl || 'FieldExplorer'}`,
      );
    } else if (outcome.duplicate) {
      await interaction.editReply(`이미 등록된 venue예요: **${built.payload.name}**`);
    } else {
      await interaction.editReply(`venue 추가에 실패했어요 (${outcome.error}). 운영자에게 알려주세요.`);
    }
    return;
  }

  if (interaction.commandName === 'venue-reviews') {
    await interaction.deferReply({ ephemeral: true });
    const query = interaction.options.getString('venue', true);
    if (!config.fieldExplorerSupabaseUrl || !config.fieldExplorerServiceKey) {
      await interaction.editReply('리뷰 조회 브릿지가 아직 설정되지 않았어요. 운영자에게 문의해 주세요.');
      return;
    }
    // Resolve to a canonical venue name when possible (so "JLS" etc. still match).
    const venues = await getFieldExplorerVenueList();
    const resolved = normalizeVenue(query, venues);
    const venueName = resolved ? resolved.name : query;
    const rows = await fetchVenueReviews({
      supabaseUrl: config.fieldExplorerSupabaseUrl,
      serviceKey: config.fieldExplorerServiceKey,
      venueName,
    });
    await chatLogger.log({
      eventType: 'venue-reviews',
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      channelName: displayChannelName(interaction.channel),
      userId: interaction.user.id,
      userName: interaction.user.username,
      commandName: 'venue-reviews',
      query: venueName,
      responseExcerpt: `${rows.length} reviews`,
      metadata: { venue: venueName, count: rows.length },
    });
    await interaction.editReply(truncateDiscord(formatVenueReviews(venueName, rows), 1900));
    return;
  }

  if (interaction.commandName === 'learn') {
    if (!config.fieldExplorerEduEnabled) {
      await interaction.reply({ ephemeral: true, content: '학습 기능이 아직 비활성화되어 있어요. 운영자가 `FIELD_EXPLORER_EDU_ENABLED`를 설정하면 사용할 수 있습니다.' });
      return;
    }
    await interaction.reply({ ephemeral: true, content: truncateDiscord(formatLearnModules(), 1900) });
    return;
  }

  if (interaction.commandName === 'quiz') {
    await interaction.deferReply({ ephemeral: true });
    if (!config.fieldExplorerEduEnabled) {
      await interaction.editReply('퀴즈 기능이 아직 비활성화되어 있어요. 운영자가 `FIELD_EXPLORER_EDU_ENABLED`를 설정하면 사용할 수 있습니다.');
      return;
    }
    const items = await getQuizItems();
    if (items.length === 0) {
      await interaction.editReply('퀴즈 문항을 불러오지 못했어요. 운영자에게 문의해 주세요.');
      return;
    }
    const idx = Math.floor(Math.random() * items.length);
    const item = items[idx];
    const row = new ActionRowBuilder().addComponents(
      (item.options || []).slice(0, 5).map((o, i) =>
        new ButtonBuilder().setCustomId(`quiz:${idx}:${i}`).setLabel(['A', 'B', 'C', 'D', 'E'][i]).setStyle(ButtonStyle.Secondary)),
    );
    await chatLogger.log({
      eventType: 'quiz', guildId: interaction.guildId, channelId: interaction.channelId,
      channelName: displayChannelName(interaction.channel), userId: interaction.user.id,
      userName: interaction.user.username, commandName: 'quiz', query: item.id, responseExcerpt: 'served', metadata: { item: item.id },
    });
    await interaction.editReply({ content: formatQuizQuestion(item), components: [row] });
    return;
  }

  if (interaction.commandName === 'field-pulse') {
    await interaction.deferReply({ ephemeral: true });
    const days = interaction.options.getInteger('days') ?? 14;
    const result = await handleFieldPulse(days);
    await chatLogger.log({
      eventType: 'field-pulse',
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      channelName: displayChannelName(interaction.channel),
      userId: interaction.user.id,
      userName: interaction.user.username,
      commandName: 'field-pulse',
      query: `last ${days} days`,
      responseExcerpt: result.fieldMatches.map((topic) => topic.name).join('; '),
      metadata: { days, posts: result.posts.length, fieldMatches: result.fieldMatches.length },
    });
    await interaction.editReply({
      embeds: [buildFieldPulseEmbed({
        posts: result.posts,
        fieldMatches: result.fieldMatches,
        days,
        label: config.fieldExplorerLabel,
        appUrl: config.fieldExplorerAppUrl,
      })],
    });
    return;
  }

  if (interaction.commandName === 'profile-suggest') {
    await interaction.deferReply({ ephemeral: true });
    const days = interaction.options.getInteger('days') ?? 90;
    const result = await handleProfileSuggest(interaction.user.id, days);
    await interaction.editReply({
      embeds: [buildProfileSuggestionsEmbed({ suggestions: result, days })],
    });
    return;
  }

  if (interaction.commandName === 'learning-path') {
    await interaction.deferReply({ ephemeral: true });
    const stage = interaction.options.getString('stage', true);
    const interests = interaction.options.getString('interests') ?? '';
    const pathway = await handleLearningPath(interaction.user.id, { stage, interests });
    await interaction.editReply({ embeds: [buildLearningPathEmbed({ pathway })] });
    return;
  }

  if (interaction.commandName === 'weekly-challenge') {
    await interaction.deferReply({ ephemeral: true });
    const focus = interaction.options.getString('focus') ?? 'paper';
    const challenge = await handleWeeklyChallenge(focus);
    await interaction.editReply({ embeds: [buildWeeklyChallengeEmbed({ challenge })] });
    return;
  }

  if (interaction.commandName === 'reflect') {
    await interaction.deferReply({ ephemeral: true });
    const item = interaction.options.getString('item', true);
    const kind = interaction.options.getString('kind') ?? 'paper';
    const context = interaction.options.getString('context') ?? '';
    const guide = await handleReflectionGuide({ item, kind, context });
    await interaction.editReply({ embeds: [buildReflectionEmbed({ guide })] });
    return;
  }

  if (interaction.commandName === 'ask-better') {
    await interaction.deferReply({ ephemeral: true });
    const question = interaction.options.getString('question', true);
    const result = await handleBetterQuestion(question);
    await interaction.editReply({ embeds: [buildBetterQuestionEmbed({ result })] });
    return;
  }

  if (interaction.commandName === 'paper-coach') {
    await interaction.deferReply({ ephemeral: true });
    const text = interaction.options.getString('text', true);
    const level = interaction.options.getString('level') ?? 'beginner';
    const coach = await handlePaperCoach({ text, level });
    await interaction.editReply({ embeds: [buildPaperCoachEmbed({ coach })] });
    return;
  }

  if (interaction.commandName === 'anon-submit') {
    await interaction.deferReply({ ephemeral: true });
    const category = interaction.options.getString('category', true);
    const text = interaction.options.getString('text', true);
    const result = await handleAnonymousSubmission(interaction, { category, text });
    await interaction.editReply(result);
    return;
  }

  if (interaction.commandName === 'submit-cfp') {
    const title = interaction.options.getString('title', true);
    const deadline = interaction.options.getString('deadline', true);
    const url = interaction.options.getString('url', true);
    const notes = interaction.options.getString('notes') ?? '';
    const content = buildCfpContent({ title, deadline, url, notes, userMention: interaction.user.toString() });
    const reply = await interaction.reply({ content, fetchReply: true, ephemeral: true });
    await store.savePost(normalizePost({
      messageId: reply.id ?? `submit-cfp-${interaction.id}`,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      channelName: displayChannelName(interaction.channel),
      authorId: interaction.user.id,
      authorName: interaction.user.username,
      content,
      createdAt: reply.createdAt,
    }));
    return;
  }

  if (interaction.commandName === 'backfill') {
    await interaction.deferReply({ ephemeral: true });
    const targetChannel = interaction.options.getChannel('channel') ?? interaction.channel;
    const limit = interaction.options.getInteger('limit') ?? 50;
    const result = await backfillChannel(targetChannel, limit);
    await interaction.editReply(
      `Backfilled ${result.indexed} message(s) from ${result.scanned} scanned item(s) in #${displayChannelName(targetChannel)}.`,
    );
    return;
  }

  if (interaction.commandName === 'stats') {
    const stats = await store.getStats();
    await interaction.reply({ content: formatStats(stats), ephemeral: true });
    return;
  }

  if (interaction.commandName === 'health') {
    const health = await buildRuntimeHealth(interaction);
    await interaction.reply({ content: formatHealth(health), ephemeral: true });
    return;
  }

  if (interaction.commandName === 'post-digest') {
    const category = interaction.options.getString('category') ?? 'all';
    const days = interaction.options.getInteger('days') ?? 7;
    const targetChannel = interaction.options.getChannel('channel') ?? interaction.channel;
    const posts = await store.getPosts({ category, days });
    if (!targetChannel?.isTextBased?.()) {
      await interaction.reply({ content: 'Please choose a text channel.', ephemeral: true });
      return;
    }

    await targetChannel.send({ embeds: [buildDigestEmbed(posts, { category, days })] });
    await interaction.reply({
      content: `Posted a ${category} digest with ${posts.length} indexed item(s) to #${displayChannelName(targetChannel)}.`,
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === 'post-field-pulse') {
    const days = interaction.options.getInteger('days') ?? 14;
    const targetChannel = interaction.options.getChannel('channel') ?? interaction.channel;
    if (!targetChannel?.isTextBased?.()) {
      await interaction.reply({ content: 'Please choose a text channel.', ephemeral: true });
      return;
    }
    const result = await handleFieldPulse(days);
    await targetChannel.send({
      embeds: [buildFieldPulseEmbed({
        posts: result.posts,
        fieldMatches: result.fieldMatches,
        days,
        label: config.fieldExplorerLabel,
        appUrl: config.fieldExplorerAppUrl,
      })],
    });
    await interaction.reply({
      content: `Posted a Field Pulse with ${result.posts.length} indexed item(s) to #${displayChannelName(targetChannel)}.`,
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === 'community-graph') {
    await interaction.deferReply({ ephemeral: true });
    const days = interaction.options.getInteger('days') ?? 30;
    const graph = await handleCommunityGraph(days);
    await interaction.editReply({ embeds: [buildCommunityGraphEmbed({ graph, days })] });
    return;
  }

  if (interaction.commandName === 'curation-feedback') {
    await interaction.deferReply({ ephemeral: true });
    const days = interaction.options.getInteger('days') ?? 30;
    const feedback = await handleCurationFeedback(days);
    await interaction.editReply({ embeds: [buildCurationFeedbackEmbed({ feedback, days })] });
    return;
  }

  if (interaction.commandName === 'peer-learning') {
    await interaction.deferReply({ ephemeral: true });
    const topic = interaction.options.getString('topic', true);
    const days = interaction.options.getInteger('days') ?? 30;
    const match = await handlePeerLearning({ topic, days });
    await interaction.editReply({ embeds: [buildPeerLearningEmbed({ match, days })] });
    return;
  }

  if (interaction.commandName === 'deadlines') {
    const days = interaction.options.getInteger('days') ?? 60;
    const category = interaction.options.getString('category') ?? 'all';
    const deadlines = await store.getUpcomingDeadlines({ days, category });
    await interaction.reply({ embeds: [buildDeadlinesEmbed(deadlines, { days, category })], ephemeral: true });
    return;
  }

  if (interaction.commandName === 'help-kels') {
    await interaction.reply({ embeds: [buildHelpEmbed()], ephemeral: true });
    return;
  }
  } catch (error) {
    await respondWithError(interaction, error);
  }
});

async function respondWithError(interaction, error) {
  console.error(`Failed to handle interaction ${interaction.commandName ?? interaction.customId ?? interaction.id}`, error);
  const payload = { content: 'Sorry, KELS Curator hit an internal error while handling that command.', ephemeral: true };
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload).catch(() => null);
  } else {
    await interaction.reply(payload).catch(() => null);
  }
}

async function logSlashCommandUsage(interaction) {
  const options = slashOptions(interaction);
  const query = slashQueryExcerpt(interaction.commandName, options);
  await chatLogger.log({
    eventType: 'slash-command',
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    channelName: displayChannelName(interaction.channel),
    userId: interaction.user.id,
    userName: interaction.user.username,
    commandName: interaction.commandName,
    query,
    metadata: {
      interactionId: interaction.id,
      options,
    },
  });
}

async function logReactionAdd(reaction, user) {
  if (user?.bot) return;
  const resolvedReaction = reaction.partial ? await reaction.fetch().catch(() => reaction) : reaction;
  const message = resolvedReaction.message?.partial
    ? await resolvedReaction.message.fetch().catch(() => resolvedReaction.message)
    : resolvedReaction.message;
  const emoji = reactionEmojiLabel(resolvedReaction.emoji);
  await chatLogger.log({
    eventType: 'reaction-add',
    guildId: message.guildId ?? '',
    channelId: message.channelId ?? '',
    channelName: displayChannelName(message.channel),
    userId: user.id,
    userName: user.username,
    query: emoji,
    responseExcerpt: getMessageText(message).slice(0, 500),
    metadata: {
      messageId: message.id,
      emoji,
      emojiId: resolvedReaction.emoji?.id ?? '',
      emojiName: resolvedReaction.emoji?.name ?? '',
      messageUrl: message.url ?? '',
      messageAuthorId: message.author?.id ?? '',
      messageAuthorName: message.author?.username ?? '',
    },
  });
}

function slashOptions(interaction) {
  return Object.fromEntries(interaction.options.data.map((option) => [
    option.name,
    option.name === 'text' && interaction.commandName === 'anon-submit'
      ? '[redacted anonymous text]'
      : slashOptionValue(option),
  ]));
}

function slashOptionValue(option) {
  if (option.channel) return `#${displayChannelName(option.channel)} (${option.channel.id})`;
  if (option.user) return `${option.user.username} (${option.user.id})`;
  if (option.role) return `${option.role.name} (${option.role.id})`;
  return option.value ?? '';
}

function slashQueryExcerpt(commandName, options) {
  if (commandName === 'anon-submit') {
    return `category=${options.category ?? ''}; text=[redacted anonymous text]`;
  }
  return Object.entries(options)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

function reactionEmojiLabel(emoji) {
  if (!emoji) return '';
  if (emoji.id) return `${emoji.name}:${emoji.id}`;
  return emoji.name ?? '';
}

async function handleButtonInteraction(interaction) {
  if (interaction.customId?.startsWith('quiz:')) {
    await handleQuizButton(interaction);
    return;
  }
  if (!interaction.customId?.startsWith('anon:')) return;
  await handleAnonymousReviewAction(interaction);
}

async function handleQuizButton(interaction) {
  try {
    const [, idxStr, optStr] = interaction.customId.split(':');
    const items = await getQuizItems();
    const item = items[Number.parseInt(idxStr, 10)];
    if (!item) {
      await interaction.reply({ ephemeral: true, content: '이 퀴즈는 만료됐어요. `/quiz`로 새 문제를 받아보세요.' });
      return;
    }
    const picked = (item.options || [])[Number.parseInt(optStr, 10)];
    const [venues, profiles] = await Promise.all([getFieldExplorerVenueList(), getFieldExplorerProfiles()]);
    const ranked = gradeQuiz(item, venues, profiles || {});
    const feedback = formatQuizFeedback(item, picked, ranked);
    await chatLogger.log({
      eventType: 'quiz-answer', guildId: interaction.guildId, channelId: interaction.channelId,
      channelName: displayChannelName(interaction.channel), userId: interaction.user.id,
      userName: interaction.user.username, commandName: 'quiz', query: item.id,
      responseExcerpt: picked === ranked[0]?.name ? 'correct' : 'wrong', metadata: { item: item.id, picked },
    });
    // Disable buttons and append feedback.
    await interaction.update({ content: `${formatQuizQuestion(item)}\n\n${feedback}`, components: [] });
  } catch (error) {
    console.error('quiz button error', error);
    try { await interaction.reply({ ephemeral: true, content: '퀴즈 채점 중 오류가 났어요.' }); } catch { /* ignore */ }
  }
}

async function handleAnonymousSubmission(interaction, { category, text }) {
  if (!config.anonymousAdviceEnabled) {
    return '익명 고민상담 제출 기능이 아직 켜져 있지 않습니다.';
  }
  if (!config.anonymousAdviceReviewChannelId || !config.anonymousAdvicePostChannelId) {
    return '익명 고민상담 채널 설정이 아직 완료되지 않았습니다.';
  }

  const cleanText = sanitizeAnonymousText(text);
  if (cleanText.length < config.anonymousAdviceMinLength) {
    return `고민 내용을 조금만 더 구체적으로 적어주세요. 최소 ${config.anonymousAdviceMinLength}자 이상이 필요합니다.`;
  }

  const submissions = await getAnonymousSubmissions();
  const recentCount = submissions.filter((submission) =>
    submission.authorId === interaction.user.id
    && Date.now() - new Date(submission.createdAt).getTime() < 24 * 60 * 60 * 1000
  ).length;
  if (recentCount >= config.anonymousAdviceDailyLimit) {
    return `하루 익명 제출 한도(${config.anonymousAdviceDailyLimit}개)에 도달했습니다. 내일 다시 제출해주세요.`;
  }

  const submission = {
    id: anonymousSubmissionId(),
    publicNumber: nextAnonymousPublicNumber(submissions),
    category,
    text: cleanText,
    authorId: interaction.user.id,
    authorName: interaction.user.username,
    guildId: interaction.guildId,
    status: 'pending',
    createdAt: new Date().toISOString(),
    reviewMessageId: null,
    publicMessageId: null,
    reviewerId: null,
    reviewedAt: null,
  };

  const reviewChannel = await client.channels.fetch(config.anonymousAdviceReviewChannelId).catch(() => null);
  if (!reviewChannel?.isTextBased?.()) {
    return '운영자 검토 채널을 찾을 수 없습니다. 설정을 확인해주세요.';
  }

  const reviewMessage = await reviewChannel.send(buildAnonymousReviewPayload(submission));
  submission.reviewMessageId = reviewMessage.id;
  submissions.push(submission);
  await setAnonymousSubmissions(submissions);

  return [
    `익명 고민 #${submission.publicNumber}으로 접수됐습니다.`,
    '운영자 검토 후 공개 채널에 작성자 정보 없이 게시됩니다.',
    '단, abuse 대응을 위해 운영자 검토 화면에는 제출자 정보가 최소한으로 표시됩니다.',
  ].join('\n');
}

async function handleAnonymousReviewAction(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: '이 버튼은 운영자만 사용할 수 있습니다.', ephemeral: true });
    return;
  }

  const [, action, submissionId] = interaction.customId.split(':');
  const submissions = await getAnonymousSubmissions();
  const index = submissions.findIndex((submission) => submission.id === submissionId);
  const submission = submissions[index];
  if (!submission) {
    await interaction.reply({ content: '해당 익명 제출을 찾을 수 없습니다.', ephemeral: true });
    return;
  }
  if (submission.status !== 'pending') {
    await interaction.reply({ content: `이미 처리된 제출입니다: ${submission.status}`, ephemeral: true });
    return;
  }

  if (action === 'reject') {
    submission.status = 'rejected';
    submission.reviewerId = interaction.user.id;
    submission.reviewedAt = new Date().toISOString();
    submissions[index] = submission;
    await setAnonymousSubmissions(submissions);
    await interaction.update(buildAnonymousReviewClosedPayload(submission, '반려됨', interaction.user.id));
    return;
  }

  if (action !== 'approve') {
    await interaction.reply({ content: '알 수 없는 익명 고민 처리 액션입니다.', ephemeral: true });
    return;
  }

  const postChannel = await client.channels.fetch(config.anonymousAdvicePostChannelId).catch(() => null);
  if (!postChannel?.isTextBased?.()) {
    await interaction.reply({ content: '익명 고민 공개 채널을 찾을 수 없습니다.', ephemeral: true });
    return;
  }

  const publicMessage = await postChannel.send(buildAnonymousAdvicePostPayload(submission));
  await publicMessage.startThread({
    name: `익명 고민 #${submission.publicNumber}`,
    autoArchiveDuration: 1440,
    reason: 'KELS anonymous advice thread',
  }).catch((error) => {
    console.warn(`Failed to create anonymous advice thread: ${error.message}`);
    return null;
  });

  submission.status = 'approved';
  submission.publicMessageId = publicMessage.id;
  submission.publicChannelId = publicMessage.channelId;
  submission.reviewerId = interaction.user.id;
  submission.reviewedAt = new Date().toISOString();
  submissions[index] = submission;
  await setAnonymousSubmissions(submissions);
  await interaction.update(buildAnonymousReviewClosedPayload(submission, '게시됨', interaction.user.id));
}

async function getAnonymousSubmissions() {
  const state = await store.getState();
  return Array.isArray(state.anonymousAdviceSubmissions) ? state.anonymousAdviceSubmissions : [];
}

async function setAnonymousSubmissions(submissions) {
  await store.setStateValue('anonymousAdviceSubmissions', submissions.slice(-1000));
}

function anonymousSubmissionId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function nextAnonymousPublicNumber(submissions) {
  const max = submissions.reduce((value, submission) => Math.max(value, Number(submission.publicNumber) || 0), 0);
  return String(max + 1).padStart(3, '0');
}

function sanitizeAnonymousText(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .replace(/@everyone/gi, '@\u200beveryone')
    .replace(/@here/gi, '@\u200bhere')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1800);
}

async function buildRuntimeHealth(interaction) {
  const stats = await store.getStats();
  const me = interaction.guild?.members?.me ?? await interaction.guild?.members.fetchMe().catch(() => null);
  const permissions = interaction.channel?.permissionsFor?.(me);
  return {
    botTag: client.user?.tag ?? 'unknown',
    guildName: interaction.guild?.name ?? 'unknown',
    channelName: displayChannelName(interaction.channel),
    stats,
    autoBackfillOnReady: config.autoBackfillOnReady,
    autoBackfillLimit: config.autoBackfillLimit,
    fieldExplorerEnabled: config.fieldExplorerEnabled,
    fieldExplorerTopicCount: fieldExplorerTopicCache.topics.length,
    configuredChannels: config.indexChannels,
    permissions: {
      ViewChannel: Boolean(permissions?.has(PermissionFlagsBits.ViewChannel)),
      SendMessages: Boolean(permissions?.has(PermissionFlagsBits.SendMessages)),
      AddReactions: Boolean(permissions?.has(PermissionFlagsBits.AddReactions)),
      EmbedLinks: Boolean(permissions?.has(PermissionFlagsBits.EmbedLinks)),
      ReadMessageHistory: Boolean(permissions?.has(PermissionFlagsBits.ReadMessageHistory)),
    },
  };
}

async function handleFieldMap(query, days) {
  const topics = await getFieldExplorerTopics();
  const rankedTopics = rankFieldTopics(query, topics, { limit: 5 });
  const posts = await store.getPosts({ category: 'all', days });
  const relatedPosts = rankPostsForQuery(query, posts, { limit: 5 })
    .filter((post) => post.relevance > 0);
  return {
    enabled: config.fieldExplorerEnabled && Boolean(config.fieldExplorerTopicsFile),
    topics: rankedTopics,
    relatedPosts,
  };
}

async function handleVenueScout(query, days) {
  const topics = await getFieldExplorerTopics();
  const scout = buildVenueScout(query, topics, { limit: 3 });
  const posts = await store.getPosts({ category: 'all', days });
  const relatedPosts = rankPostsForQuery(query, posts, { limit: 5 })
    .filter((post) => post.relevance > 0);
  return {
    enabled: config.fieldExplorerEnabled && Boolean(config.fieldExplorerTopicsFile),
    scout,
    relatedPosts,
  };
}

async function handleFieldPulse(days) {
  const posts = await store.getPosts({ category: 'all', days });
  const topics = await getFieldExplorerTopics();
  const fieldText = posts.map((post) => [
    post.channelName,
    post.category,
    ...(post.tags ?? []),
    post.content,
  ].join(' ')).join('\n');
  const fieldMatches = rankFieldTopics(fieldText, topics, { limit: 5 });
  return {
    posts,
    fieldMatches,
  };
}

async function handleCommunityGraph(days) {
  const posts = await store.getPosts({ category: 'all', days });
  const logs = await store.getChatbotLogs({ days });
  const fieldTopics = await getFieldExplorerTopics();
  return buildCommunityGraph({ posts, logs, fieldTopics });
}

async function handleCurationFeedback(days) {
  const posts = await store.getPosts({ category: 'all', days });
  const logs = await store.getChatbotLogs({ days });
  const fieldTopics = await getFieldExplorerTopics();
  return buildCurationFeedback({ posts, logs, fieldTopics });
}

async function handleProfileSuggest(userId, days) {
  const posts = await store.getPosts({ category: 'all', days });
  const logs = await store.getChatbotLogs({ days });
  const fieldTopics = await getFieldExplorerTopics();
  const existingTopics = await store.listProfileTopics(userId);
  return suggestProfileTopics({
    userId,
    existingTopics,
    posts,
    logs,
    fieldTopics,
    limit: 5,
  });
}

async function handleLearningPath(userId, { stage, interests }) {
  const posts = await store.getPosts({ category: 'all', days: 90 });
  const logs = (await store.getChatbotLogs({ days: 90 })).filter((log) => log.userId === userId);
  const fieldTopics = await getFieldExplorerTopics();
  const profileTopics = await store.listProfileTopics(userId);
  return buildLearningPathway({
    stage,
    interests: [interests, ...profileTopics].filter(Boolean).join(' '),
    posts,
    logs,
    fieldTopics,
  });
}

async function handleWeeklyChallenge(focus) {
  const posts = await store.getPosts({ category: 'all', days: 14 });
  const fieldTopics = await getFieldExplorerTopics();
  return buildMicroChallenge({ focus, posts, fieldTopics });
}

async function handleReflectionGuide({ item, kind, context }) {
  const fieldTopics = await getFieldExplorerTopics();
  return buildReflectionGuide({ item, kind, context, fieldTopics });
}

async function handleBetterQuestion(question) {
  const fieldTopics = await getFieldExplorerTopics();
  return buildBetterQuestion({ question, fieldTopics });
}

async function handlePaperCoach({ text, level }) {
  const fieldTopics = await getFieldExplorerTopics();
  return buildPaperCoach({ text, level, fieldTopics });
}

async function handlePeerLearning({ topic, days }) {
  const posts = await store.getPosts({ category: 'all', days });
  const logs = await store.getChatbotLogs({ days });
  const fieldTopics = await getFieldExplorerTopics();
  return buildPeerLearningMatch({ topic, posts, logs, fieldTopics });
}

async function getFieldExplorerTopics() {
  if (!config.fieldExplorerEnabled || !config.fieldExplorerTopicsFile) return [];
  const now = Date.now();
  if (
    fieldExplorerTopicCache.filePath === config.fieldExplorerTopicsFile
    && fieldExplorerTopicCache.loadedAt > now - 10 * 60 * 1000
  ) {
    return fieldExplorerTopicCache.topics;
  }

  const topics = await loadFieldExplorerTopics(config.fieldExplorerTopicsFile);
  fieldExplorerTopicCache = {
    filePath: config.fieldExplorerTopicsFile,
    loadedAt: now,
    topics,
  };
  return topics;
}

let fieldExplorerVenueCache = { filePath: '', loadedAt: 0, venues: [] };

async function getFieldExplorerVenueList() {
  if (!config.fieldExplorerTopicsFile) return [];
  const now = Date.now();
  if (
    fieldExplorerVenueCache.filePath === config.fieldExplorerTopicsFile
    && fieldExplorerVenueCache.loadedAt > now - 10 * 60 * 1000
  ) {
    return fieldExplorerVenueCache.venues;
  }
  try {
    const text = await fxReadFile(config.fieldExplorerTopicsFile, 'utf8');
    const venues = parseVenueList(text);
    fieldExplorerVenueCache = { filePath: config.fieldExplorerTopicsFile, loadedAt: now, venues };
    return venues;
  } catch {
    return [];
  }
}

let fieldExplorerProfileCache = { filePath: '', loadedAt: 0, profiles: null };

async function getFieldExplorerProfiles() {
  if (!config.fieldExplorerProfilesFile) return null;
  const now = Date.now();
  if (
    fieldExplorerProfileCache.filePath === config.fieldExplorerProfilesFile
    && fieldExplorerProfileCache.loadedAt > now - 30 * 60 * 1000
  ) {
    return fieldExplorerProfileCache.profiles;
  }
  try {
    const text = await fxReadFile(config.fieldExplorerProfilesFile, 'utf8');
    const profiles = JSON.parse(text);
    fieldExplorerProfileCache = { filePath: config.fieldExplorerProfilesFile, loadedAt: now, profiles };
    return profiles;
  } catch {
    return null;
  }
}

let fieldExplorerQuizCache = { filePath: '', loadedAt: 0, items: [] };

async function getQuizItems() {
  if (!config.fieldExplorerQuizFile) return [];
  const now = Date.now();
  if (fieldExplorerQuizCache.filePath === config.fieldExplorerQuizFile
    && fieldExplorerQuizCache.loadedAt > now - 30 * 60 * 1000) {
    return fieldExplorerQuizCache.items;
  }
  try {
    const parsed = JSON.parse(await fxReadFile(config.fieldExplorerQuizFile, 'utf8'));
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    fieldExplorerQuizCache = { filePath: config.fieldExplorerQuizFile, loadedAt: now, items };
    return items;
  } catch {
    return [];
  }
}

// Build a fingerprint-based submission-fit scorecard for an abstract, or '' if disabled.
async function buildScorecardBlock(query) {
  if (!config.fieldExplorerScorecardEnabled) return '';
  const [venues, profiles] = await Promise.all([getFieldExplorerVenueList(), getFieldExplorerProfiles()]);
  if (!profiles || venues.length === 0) return '';
  const now = new Date();
  const inputs = venues.map((v) => ({
    name: v.name,
    type: v.type,
    impact: v.impact,
    cfpDaysUntil: v.cfpDeadline ? computeDaysUntil(v.cfpDeadline, now) : null,
    cfpVerified: false,
  }));
  const ranked = rankSubmissionFit(query, inputs, profiles);
  if (ranked.length === 0) return '';
  return `🎯 **투고 적합도 (FieldExplorer 지문 기반)**\n${formatScorecard(ranked, { limit: 5 })}`;
}

async function indexMessage(message) {
  const post = normalizePost({
    messageId: message.id,
    guildId: message.guildId,
    channelId: message.channelId,
    channelName: displayChannelName(message.channel),
    authorId: message.author.id,
    authorName: message.author.username,
    content: getMessageText(message),
    createdAt: message.createdAt,
  });

  await store.savePost(post);
  return post;
}

async function deleteSpamIfNeeded(message) {
  if (!config.spamAutoDeleteEnabled) return false;
  if (!message.guildId || message.author?.bot) return false;
  const reason = detectSpam(message, config);
  if (!reason) return false;

  await message.delete().catch((error) => {
    console.warn(`Failed to delete spam message ${message.id}: ${error.message}`);
  });
  await chatLogger.log({
    eventType: 'spam-auto-delete',
    guildId: message.guildId,
    channelId: message.channelId,
    channelName: displayChannelName(message.channel),
    userId: message.author.id,
    userName: message.author.username,
    query: getMessageText(message),
    responseExcerpt: reason,
    metadata: { messageId: message.id, reason },
  });
  console.log(`Deleted spam message ${message.id}: ${reason}`);
  return true;
}

async function addAutoReactions(message) {
  if (!config.autoReactEnabled) return;
  if (!message.guild || message.author?.bot) return;

  const targets = await getAutoReactionTargets(message.guild);
  for (const target of targets) {
    await message.react(target).catch((error) => {
      console.warn(`Failed to add auto reaction "${target}" to message ${message.id}: ${error.message}`);
    });
  }
}

async function getAutoReactionTargets(guild) {
  const tokenKey = config.autoReactEmojis.join(',');
  const now = Date.now();
  if (
    autoReactionTargetCache.guildId === guild.id
    && autoReactionTargetCache.tokenKey === tokenKey
    && autoReactionTargetCache.expiresAt > now
  ) {
    return autoReactionTargetCache.targets;
  }

  const emojis = await guild.emojis.fetch().catch(() => guild.emojis.cache);
  const targets = resolveReactionTargets(config.autoReactEmojis, emojis);
  autoReactionTargetCache = {
    guildId: guild.id,
    tokenKey,
    expiresAt: now + 10 * 60 * 1000,
    targets,
  };
  return targets;
}

function shouldIndexMessage(message) {
  if (!message.guildId || message.author?.bot) return false;
  if (!getMessageText(message).trim()) return false;
  const indexableTypes = new Set([
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.PublicThread,
    ChannelType.AnnouncementThread,
  ]);
  if (!indexableTypes.has(message.channel?.type)) return false;
  if (!config.indexChannels.length) return true;

  const channelName = displayChannelName(message.channel);
  const parentName = message.channel?.parent?.name ?? '';
  return config.indexChannels.includes(message.channelId)
    || config.indexChannels.includes(channelName)
    || config.indexChannels.includes(parentName);
}

function getMessageText(message) {
  const parts = [message.content ?? ''];

  for (const embed of message.embeds ?? []) {
    if (embed.title) parts.push(embed.title);
    if (embed.description) parts.push(embed.description);
    if (embed.url) parts.push(embed.url);
    for (const field of embed.fields ?? []) {
      parts.push(field.name, field.value);
    }
  }

  for (const attachment of message.attachments?.values?.() ?? []) {
    parts.push(attachment.name ?? '', attachment.url ?? '');
  }

  return parts.join('\n').trim();
}

function displayChannelName(channel) {
  if (!channel) return 'unknown';
  if (channel.isThread?.() && channel.parent?.name) {
    return channel.parent.name;
  }
  return channel.name ?? 'unknown';
}

async function backfillChannel(channel, limit) {
  const messages = await collectMessages(channel, limit);
  let indexed = 0;
  for (const message of messages) {
    if (!shouldIndexMessage(message)) continue;
    await indexMessage(message);
    indexed += 1;
  }
  return { scanned: messages.length, indexed };
}

async function autoBackfillConfiguredChannels(readyClient) {
  if (!config.indexChannels.length) {
    console.log('AUTO_BACKFILL_ON_READY skipped because INDEX_CHANNELS is empty.');
    return;
  }

  const state = await store.getState();
  if (state.lastAutoBackfillAt && !config.autoBackfillForce) {
    console.log(`AUTO_BACKFILL_ON_READY skipped because it already ran at ${state.lastAutoBackfillAt}.`);
    return;
  }

  const guild = await readyClient.guilds.fetch(config.guildId);
  const channels = await guild.channels.fetch();
  let totalScanned = 0;
  let totalIndexed = 0;

  for (const configured of config.indexChannels) {
    const channel = findConfiguredChannel(channels, configured);
    if (!channel) {
      console.warn(`Auto-backfill could not find channel: ${configured}`);
      continue;
    }
    const result = await backfillChannel(channel, config.autoBackfillLimit);
    totalScanned += result.scanned;
    totalIndexed += result.indexed;
    console.log(`Auto-backfilled #${displayChannelName(channel)}: ${result.indexed}/${result.scanned}`);
  }

  await store.setStateValue('lastAutoBackfillAt', new Date().toISOString());
  console.log(`Auto-backfill complete: ${totalIndexed}/${totalScanned} indexed.`);
}

function findConfiguredChannel(channels, configured) {
  return channels.find((channel) =>
    channel?.id === configured
    || channel?.name === configured
    || channel?.name?.toLowerCase() === configured.toLowerCase(),
  );
}

async function collectMessages(channel, limit) {
  if (channel?.messages?.fetch) {
    const fetched = await channel.messages.fetch({ limit });
    return Array.from(fetched.values());
  }

  if (!channel?.threads) return [];
  const threads = [];
  const active = await channel.threads.fetchActive().catch(() => null);
  if (active?.threads) threads.push(...active.threads.values());

  const archived = await channel.threads.fetchArchived({ type: 'public', limit: 100 }).catch(() => null);
  if (archived?.threads) threads.push(...archived.threads.values());

  const messages = [];
  for (const thread of threads.slice(0, limit)) {
    if (!thread.messages?.fetch) continue;
    const fetched = await thread.messages.fetch({ limit: Math.min(10, limit) }).catch(() => null);
    if (fetched) messages.push(...fetched.values());
    if (messages.length >= limit) break;
  }

  return messages.slice(0, limit);
}

async function handleWatch(userId, action, keyword) {
  if (action === 'list') {
    return formatWatchList(await store.listWatch(userId));
  }
  if (!keyword.trim()) {
    return 'Please provide a keyword for `add` or `remove`.';
  }
  if (action === 'add') {
    return formatWatchList(await store.addWatch(userId, keyword));
  }
  if (action === 'remove') {
    return formatWatchList(await store.removeWatch(userId, keyword));
  }
  return 'Unknown watch action.';
}

async function handleProfile(userId, action, topic) {
  let topics = [];
  if (action === 'list') {
    topics = await store.listProfileTopics(userId);
    return formatProfileResponse(topics, await memberConnectionSuggestions(topics));
  }
  if (!topic.trim()) {
    return 'Please provide a topic for `add` or `remove`.';
  }
  if (action === 'add') {
    topics = await store.addProfileTopic(userId, topic);
    return formatProfileResponse(topics, await memberConnectionSuggestions(topics));
  }
  if (action === 'remove') {
    topics = await store.removeProfileTopic(userId, topic);
    return formatProfileResponse(topics, await memberConnectionSuggestions(topics));
  }
  return 'Unknown profile action.';
}

function formatProfileResponse(topics, suggestions) {
  return truncateDiscord([
    formatTopicList(topics),
    formatConnectionSuggestions(suggestions),
  ].filter(Boolean).join('\n'), 1900);
}

async function handleAskKels(interaction, query, category) {
  const filters = inferArchiveFilters(query, category);
  const posts = await store.getPosts({ category: filters.category, days: filters.days });
  const selectedPosts = rankPostsForQuery(query, posts, { limit: 8 });
  const weakEvidence = !selectedPosts.length || (selectedPosts[0]?.relevance ?? 0) < 2;
  const answer = await answerArchiveQuestionWithQwen(qwen, query, selectedPosts, { weakEvidence });
  const originals = relatedOriginals(selectedPosts, { limit: 3, minRelevance: weakEvidence ? 0 : 1 });
  const evidenceStatus = archiveEvidenceStatus(selectedPosts, { weakEvidence });
  const answerWithSources = `${answer}${formatArchiveEvidencePanel(originals, evidenceStatus)}`;
  await chatLogger.log({
    eventType: 'ask-kels',
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    channelName: displayChannelName(interaction.channel),
    userId: interaction.user.id,
    userName: interaction.user.username,
    commandName: 'ask-kels',
    query,
    responseExcerpt: answer,
    metadata: {
      category: filters.category,
      days: filters.days,
      matchedPosts: posts.length,
      usedPosts: selectedPosts.map((post) => ({ id: post.id, relevance: post.relevance })),
      weakEvidence,
      evidenceStatus,
      qwenEnabled: qwen.enabled,
    },
  });
  return truncateDiscord(answerWithSources || 'No answer generated.', 1900);
}

async function notifyWatchers(post, message) {
  const watchers = await store.matchingWatchers(post);
  for (const watcher of watchers) {
    const user = await client.users.fetch(watcher.userId).catch(() => null);
    if (!user) continue;
    const keywords = watcher.keywords.map((keyword) => `\`${keyword}\``).join(', ');
    await user.send(
      `KELS watch hit (${keywords}) in #${post.channelName}:\n${message.url}\n${post.content.slice(0, 400)}`,
    ).catch(() => null);
  }
}

async function handleOnboardingIntro(post, message) {
  if (!config.onboardingEnabled) return;
  if (!message.channel || message.channel.isThread?.()) return;
  const isIntroChannel = message.channelId === config.onboardingChannelId || message.channel.name === 'introduction';
  if (!isIntroChannel) return;
  if ((post.content ?? '').trim().length < 20) return;

  const state = await store.getState();
  const handled = new Set(state.onboardingMessageIds ?? []);
  if (handled.has(message.id)) return;

  const profile = await extractOnboardingProfileWithQwen(qwen, post.content);
  const extracted = profile.fullName ? profile : await extractIntroFullNameWithQwen(qwen, post.content);
  const fullName = extracted.fullName || '새 회원';
  const threadName = onboardingThreadName(fullName);
  const thread = await message.startThread({
    name: threadName,
    autoArchiveDuration: 1440,
    reason: 'KELS self-introduction onboarding',
  }).catch((error) => {
    console.warn(`Failed to create onboarding thread: ${error.message}`);
    return null;
  });
  if (!thread) return;

  const reply = await buildOnboardingReplyWithQwen(qwen, {
    displayName: fullName,
    introText: post.content,
  });
  const pathway = await memberOnboardingPathway(profile);
  const onboardingReply = formatOnboardingReply(reply, profile, pathway);
  await thread.send(truncateDiscord(onboardingReply, 1800)).catch(() => null);
  handled.add(message.id);
  await store.setStateValue('onboardingMessageIds', Array.from(handled).slice(-1000));
  await queueOnboardingFollowup({
    userId: post.authorId,
    threadId: thread.id,
    messageId: message.id,
    fullName,
    interests: pathway?.interests ?? profile.interests ?? [],
    createdAt: new Date().toISOString(),
  });
  await chatLogger.log({
    eventType: 'onboarding-thread',
    guildId: post.guildId,
    channelId: post.channelId,
    channelName: post.channelName,
    userId: post.authorId,
    userName: post.authorName,
    query: post.content,
    responseExcerpt: onboardingReply,
    metadata: {
      threadId: thread.id,
      threadName,
      extractedFullName: extracted.fullName,
      confidence: extracted.confidence,
      profile,
      pathway,
    },
  });
}

function formatOnboardingReply(reply, profile, pathway = null) {
  const lines = [reply];
  if (profile?.interests?.length) lines.push('', `관심분야: ${profile.interests.join(', ')}`);
  if (profile?.affiliation || profile?.stage) {
    lines.push(`소속/단계: ${[profile.affiliation, profile.stage].filter(Boolean).join(' / ')}`);
  }
  if (profile?.lookingFor?.length) lines.push(`찾는 정보: ${profile.lookingFor.join(', ')}`);
  if (profile?.recommendedChannels?.length) {
    lines.push('', `추천 채널: ${profile.recommendedChannels.map((name) => `#${String(name).replace(/^#/, '')}`).join(', ')}`);
  }
  if (profile?.recommendedCommands?.length) {
    lines.push(`추천 slash: ${profile.recommendedCommands.map((command) => `\`${command}\``).join(' ')}`);
  }
  const pathwayText = formatOnboardingPathway(pathway);
  if (pathwayText) lines.push(pathwayText);
  return lines.filter(Boolean).join('\n');
}

async function memberConnectionSuggestions(topics) {
  const cleanTopics = (topics ?? []).map((item) => String(item ?? '').trim()).filter(Boolean);
  if (!cleanTopics.length) return null;
  const posts = (await store.getPosts({ category: 'all', days: 180 }))
    .filter((post) => !post.guildId || post.guildId === config.guildId);
  return buildConnectionSuggestions({ topics: cleanTopics, posts, limit: 3 });
}

async function memberOnboardingPathway(profile) {
  const posts = (await store.getPosts({ category: 'all', days: 180 }))
    .filter((post) => !post.guildId || post.guildId === config.guildId);
  return buildOnboardingPathway({ profile, posts, limit: 3 });
}

async function queueOnboardingFollowup(item) {
  if (!config.onboardingFollowupEnabled) return;
  const state = await store.getState();
  const queue = state.onboardingFollowupQueue ?? [];
  const key = `${item.userId}:${item.messageId}`;
  if (queue.some((entry) => `${entry.userId}:${entry.messageId}` === key)) return;
  queue.push({
    ...item,
    dueAt: daysFromIso(item.createdAt, config.onboardingFollowupAfterDays),
    sentAt: null,
  });
  await store.setStateValue('onboardingFollowupQueue', queue.slice(-1000));
}

function onboardingThreadName(fullName) {
  const clean = String(fullName ?? '새 회원')
    .replace(/[\r\n\t`"'<>@#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 84) || '새 회원';
  return `${clean} 님`;
}

async function notifyProfileMatches(post, message) {
  const matches = await store.matchingProfiles(post);
  for (const match of matches) {
    const user = await client.users.fetch(match.userId).catch(() => null);
    if (!user) continue;
    const topics = match.topics.map((topic) => `\`${topic}\``).join(', ');
    const qwenReason = await explainProfileMatchWithQwen(qwen, post, match.topics);
    await user.send(
      [
        `KELS profile match (${topics}) in #${post.channelName}:`,
        qwenReason ? `Why it matches: ${qwenReason}` : '',
        message.url,
        post.content.slice(0, 500),
      ].filter(Boolean).join('\n'),
    ).catch(() => null);
  }
}

async function suggestForumCleanup(post, message) {
  if (!config.forumSuggestionEnabled) return;
  if (!message.channel?.isThread?.()) return;
  if (message.channel.parent?.type !== ChannelType.GuildForum) return;
  if (message.id !== message.channel.id && message.channel.messageCount > 1) return;

  const qwenSuggestion = await suggestForumWithQwen(qwen, post, message.channel.name);
  const suggestion = buildForumSuggestion(post, message.channel.name, qwenSuggestion);
  if (!suggestion) return;

  const users = await moderatorUsers(message.guild);
  for (const user of users) {
    await user.send(suggestion).catch(() => null);
  }

  await chatLogger.log({
    eventType: 'forum-suggestion',
    guildId: post.guildId,
    channelId: post.channelId,
    channelName: post.channelName,
    userId: post.authorId,
    userName: post.authorName,
    query: post.content,
    responseExcerpt: suggestion,
    metadata: { qwenSuggestion },
  });
}

async function moderatorUsers(guild) {
  const ids = config.moderatorUserIds.length ? config.moderatorUserIds : [guild.ownerId];
  const users = [];
  for (const id of ids.filter(Boolean)) {
    const user = await client.users.fetch(id).catch(() => null);
    if (user) users.push(user);
  }
  return users;
}

function buildForumSuggestion(post, currentTitle, qwenSuggestion = null) {
  const tags = suggestedTags(post);
  const title = suggestedForumTitle(post);
  if (!tags.length && !title) return null;
  return [
    'KELS forum cleanup suggestion',
    `Channel: #${post.channelName}`,
    `Current title: ${currentTitle}`,
    qwenSuggestion?.title || title ? `Suggested title: ${qwenSuggestion?.title || title}` : '',
    qwenSuggestion?.tags?.length || tags.length
      ? `Suggested tags: ${(qwenSuggestion?.tags?.length ? qwenSuggestion.tags : tags).map((tag) => `#${tag}`).join(' ')}`
      : '',
    qwenSuggestion?.rationale ? `Rationale: ${qwenSuggestion.rationale}` : '',
    `Link: https://discord.com/channels/${post.guildId}/${post.channelId}/${post.id}`,
  ].filter(Boolean).join('\n');
}

function suggestedTags(post) {
  const tags = new Set(post.tags ?? []);
  if (post.category && post.category !== 'general') tags.add(post.category);
  if (post.deadlineDates?.length) tags.add('deadline');
  if (post.urls?.length) tags.add('link');
  return Array.from(tags).slice(0, 6);
}

function suggestedForumTitle(post) {
  const firstLine = (post.content ?? '')
    .split('\n')
    .map((line) => line.replace(/[*_`>#-]/g, '').trim())
    .find(Boolean);
  if (!firstLine) return '';
  const prefix = post.category && post.category !== 'general' ? `[${post.category.toUpperCase()}] ` : '';
  return `${prefix}${firstLine}`.slice(0, 95);
}

async function autoTagMemberRoles(post, message) {
  if (!config.roleAutoTaggingEnabled || !qwen.enabled) return;
  if (!message.guild || message.author?.bot) return;
  if ((post.content ?? '').trim().length < 40) return;

  const guild = message.guild;
  const member = message.member ?? await guild.members.fetch(message.author.id).catch(() => null);
  if (!member) return;

  const roles = await guild.roles.fetch();
  const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
  const botHighest = me?.roles?.highest?.position ?? 0;
  const ignored = new Set(config.roleIgnoreNames.map((name) => normalizeRoleKey(name)));
  const currentRoles = member.roles.cache.map((role) => role.name);
  const currentRoleKeys = new Set(currentRoles.map((name) => normalizeRoleKey(name)));
  const candidates = Array.from(roles.values())
    .filter((role) => !role.managed)
    .filter((role) => !ignored.has(normalizeRoleKey(role.name)))
    .map((role) => role.name)
    .sort((a, b) => a.localeCompare(b));

  const suggestions = (await inferMemberRolesWithQwen(qwen, {
    messageText: post.content,
    existingRoles: candidates.slice(0, 120),
    currentRoles,
  }))
    .filter((item) => !isForbiddenAutoRole(item.role))
    .filter((item) => item.confidence >= config.roleMinConfidence)
    .slice(0, config.roleMaxPerMember);

  if (!suggestions.length) return;

  const state = await store.getState();
  const seenKeys = new Set(state.roleAutoTagKeys ?? []);
  const outcomes = [];

  for (const suggestion of suggestions) {
    const key = `role:${member.id}:${normalizeRoleKey(suggestion.role)}`;
    if (seenKeys.has(key) || currentRoleKeys.has(normalizeRoleKey(suggestion.role))) continue;

    const existing = findRoleByName(roles, suggestion.role);
    if (existing && isForbiddenAutoRole(existing.name)) continue;
    if (existing) {
      if (suggestion.confidence < config.roleAutoAssignConfidence) {
        outcomes.push({ role: existing.name, action: 'suggested-existing-review', reason: suggestion.reason, confidence: suggestion.confidence });
      } else if (config.roleAutoAssignEnabled && existing.position < botHighest) {
        await member.roles.add(existing, `KELS Qwen auto-tag: ${suggestion.reason}`).catch((error) => {
          outcomes.push({ role: existing.name, action: 'assign-failed', reason: error.message });
        });
        outcomes.push({ role: existing.name, action: 'assigned', reason: suggestion.reason, confidence: suggestion.confidence });
      } else {
        outcomes.push({ role: existing.name, action: 'suggested-existing-unmanageable', reason: suggestion.reason, confidence: suggestion.confidence });
      }
      seenKeys.add(key);
      continue;
    }

    if (suggestion.confidence < config.roleAutoCreateConfidence) {
      outcomes.push({ role: suggestion.role, action: 'suggested-new-review', reason: suggestion.reason, confidence: suggestion.confidence });
      seenKeys.add(key);
    } else if (config.roleAutoCreateEnabled && config.roleAutoAssignEnabled && suggestion.create !== false) {
      const roleName = withRolePrefix(suggestion.role);
      if (isForbiddenAutoRole(roleName)) continue;
      const created = await guild.roles.create({
        name: roleName,
        reason: `KELS Qwen auto-created role: ${suggestion.reason}`,
        mentionable: false,
      }).catch((error) => {
        outcomes.push({ role: roleName, action: 'create-failed', reason: error.message });
        return null;
      });
      if (created) {
        await member.roles.add(created, `KELS Qwen auto-tag: ${suggestion.reason}`).catch((error) => {
          outcomes.push({ role: roleName, action: 'assign-created-failed', reason: error.message });
        });
        outcomes.push({ role: roleName, action: 'created-and-assigned', reason: suggestion.reason, confidence: suggestion.confidence });
        seenKeys.add(`role:${member.id}:${normalizeRoleKey(roleName)}`);
      }
    } else {
      outcomes.push({ role: suggestion.role, action: 'suggested-new', reason: suggestion.reason, confidence: suggestion.confidence });
      seenKeys.add(key);
    }
  }

  if (!outcomes.length) return;
  await store.setStateValue('roleAutoTagKeys', Array.from(seenKeys).slice(-1000));
  await notifyModeratorsAboutRoleOutcomes(guild, member, post, message.url, outcomes);
  await chatLogger.log({
    eventType: 'role-auto-tag',
    guildId: post.guildId,
    channelId: post.channelId,
    channelName: post.channelName,
    userId: post.authorId,
    userName: post.authorName,
    query: post.content,
    responseExcerpt: JSON.stringify(outcomes),
    metadata: { outcomes, qwenModel: qwen.model },
  });
}

async function notifyModeratorsAboutRoleOutcomes(guild, member, post, url, outcomes) {
  const actionable = outcomes.filter((item) => item.action.includes('suggested') || item.action.includes('failed'));
  if (!actionable.length) return;
  const users = await moderatorUsers(guild);
  const content = [
    'KELS role auto-tag review',
    `Member: ${member.user.tag} (${member.id})`,
    `Channel: #${post.channelName}`,
    ...actionable.map((item) => `- ${item.action}: ${item.role} [confidence ${item.confidence ?? 'n/a'}] (${item.reason ?? 'no reason'})`),
    `Link: ${url}`,
  ].join('\n');
  for (const user of users) {
    await user.send(content).catch(() => null);
  }
}

function findRoleByName(roles, name) {
  const key = normalizeRoleKey(name);
  return roles.find((role) => normalizeRoleKey(role.name) === key);
}

function normalizeRoleKey(name) {
  return String(name ?? '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
}

function withRolePrefix(name) {
  const clean = String(name ?? '').replace(/[\r\n\t`"'<>@#]/g, '').trim().slice(0, 70);
  if (!config.rolePrefix) return clean;
  return clean.startsWith(config.rolePrefix) ? clean : `${config.rolePrefix}${clean}`;
}

function isForbiddenAutoRole(name) {
  const key = normalizeRoleKey(name);
  return key.includes('admin') || key.includes('administrator') || key.includes('communicationofficer');
}

function scheduleWeeklyDigest() {
  if (!config.digestChannelId) return;
  setInterval(async () => {
    try {
    const now = localTimeParts(new Date(), config.digestTimeZone);
    if (now.weekday !== 'Mon' || now.hour !== config.digestHourLocal) return;
    const digestKey = `weeklyDigest:${now.date}`;
    const state = await store.getState();
    if (state.lastWeeklyDigestKey === digestKey) return;

    const channel = await client.channels.fetch(config.digestChannelId).catch(() => null);
    if (!channel?.isTextBased()) return;
    const posts = await store.getPosts({ category: 'all', days: 7 });
    await channel.send({ embeds: [buildDigestEmbed(posts, { category: 'all', days: 7 })] });
    await store.setStateValue('lastWeeklyDigestKey', digestKey);
    } catch (error) {
      console.error('Failed to post scheduled digest', error);
    }
  }, 30 * 60 * 1000);
}

function scheduleWeeklyArticleRecommendation() {
  if (!config.articleDigestEnabled || !config.articleDigestChannelId) return;
  setInterval(async () => {
    try {
      const now = localTimeParts(new Date(), config.digestTimeZone);
      if (now.weekday !== 'Mon' || now.hour !== config.articleDigestHourLocal) return;

      const digestKey = `weeklyArticleDigest:${now.date}`;
      const state = await store.getState();
      if (state.lastWeeklyArticleDigestKey === digestKey) return;

      const candidates = await fetchCandidateArticles({
        days: config.articleDigestLookbackDays,
        mailto: config.openAlexMailto,
      });
      const archivePosts = await store.getPosts({ category: 'all', days: 120 });
      const article = selectWeeklyArticle(candidates, state.recommendedOpenAlexWorkIds ?? [], new Date(), { archivePosts });
      if (!article) {
        console.warn('Weekly article recommendation skipped because OpenAlex returned no candidates.');
        return;
      }

      const channel = await client.channels.fetch(config.articleDigestChannelId).catch(() => null);
      if (!channel) {
        console.warn(`Weekly article recommendation channel not found: ${config.articleDigestChannelId}`);
        return;
      }

      const qwenSummary = await summarizeArticleWithQwen(qwen, article);
      await postArticleRecommendation(channel, article, qwenSummary);
      await store.setStateValue('lastWeeklyArticleDigestKey', digestKey);
      await store.setStateValue('lastWeeklyArticleDigestAt', new Date().toISOString());
      await store.setStateValue('recommendedOpenAlexWorkIds', [
        article.id,
        ...(state.recommendedOpenAlexWorkIds ?? []).filter((id) => id !== article.id),
      ].slice(0, 100));
      await chatLogger.log({
        eventType: 'weekly-article-recommendation',
        guildId: config.guildId,
        channelId: config.articleDigestChannelId,
        commandName: 'scheduled',
        query: article.title,
        responseExcerpt: JSON.stringify(qwenSummary ?? {}),
        metadata: { articleId: article.id, qwenEnabled: qwen.enabled, curationVotes: article.curationVotes },
      });
      console.log(`Posted weekly OpenAlex article recommendation: ${article.id}`);
    } catch (error) {
      console.error('Failed to post scheduled OpenAlex article recommendation', error);
    }
  }, 30 * 60 * 1000);
}

function buildKsetUpdatesContent(items) {
  const kindEmoji = { notice: '📢', proceedings: '📑', event: '📅', newsletter: '📰' };
  const lines = items.map((it) => {
    const emoji = kindEmoji[it.kind] || '•';
    const date = it.date ? `\`${it.date}\` ` : '';
    return `${emoji} ${date}[${it.title}](${it.url}) — _${it.boardLabel}_`;
  });
  return [
    '## 🇰🇷 한국교육공학회(KSET) 새 소식',
    '지난 한 주 kset.or.kr 공지·학술대회 발표논문(자료집)·행사·뉴스레터에서 올라온 항목입니다.',
    '',
    ...lines,
    '',
    '_출처: 한국교육공학회 kset.or.kr · 학회지 「교육공학연구」 발간 소식 포함_',
  ].join('\n');
}

async function postKsetUpdates(channel, items) {
  if (!channel?.isTextBased?.()) return;
  const content = buildKsetUpdatesContent(items);
  // Discord hard-caps message content at 2000 chars; trim items if needed.
  if (content.length <= 2000) {
    await channel.send({ content });
    return;
  }
  let trimmed = items.slice();
  while (trimmed.length > 1 && buildKsetUpdatesContent(trimmed).length > 2000) {
    trimmed = trimmed.slice(0, -1);
  }
  await channel.send({ content: buildKsetUpdatesContent(trimmed) });
}

function scheduleKsetUpdates() {
  if (!config.ksetUpdatesEnabled || !config.ksetUpdatesChannelId) return;
  setInterval(async () => {
    try {
      const now = localTimeParts(new Date(), config.digestTimeZone);
      if (!sameWeekday(now.weekday, config.ksetUpdatesWeekday) || now.hour !== config.ksetUpdatesHourLocal) return;

      const runKey = `ksetUpdates:${now.date}`;
      const state = await store.getState();
      if (state.lastKsetUpdatesKey === runKey) return;

      const { items, errors } = await fetchKsetUpdates({ sinceDays: config.ksetUpdatesLookbackDays });
      if (errors.length) console.warn('KSET board harvest partial errors:', errors);

      const posted = new Set(state.postedKsetItemIds ?? []);
      const fresh = items.filter((it) => !posted.has(it.id)).slice(0, config.ksetUpdatesMaxItems);
      if (fresh.length === 0) {
        await store.setStateValue('lastKsetUpdatesKey', runKey);
        return;
      }

      const channel = await client.channels.fetch(config.ksetUpdatesChannelId).catch(() => null);
      if (!channel) {
        console.warn(`KSET updates channel not found: ${config.ksetUpdatesChannelId}`);
        return;
      }

      await postKsetUpdates(channel, fresh);
      await store.setStateValue('lastKsetUpdatesKey', runKey);
      await store.setStateValue('lastKsetUpdatesAt', new Date().toISOString());
      await store.setStateValue('postedKsetItemIds', [
        ...fresh.map((it) => it.id),
        ...(state.postedKsetItemIds ?? []),
      ].slice(0, 400));
      await chatLogger.log({
        eventType: 'weekly-kset-updates',
        guildId: config.guildId,
        channelId: config.ksetUpdatesChannelId,
        commandName: 'scheduled',
        query: 'KSET board updates',
        responseExcerpt: fresh.map((it) => it.title).join(' | ').slice(0, 500),
        metadata: { count: fresh.length, boards: errors.length ? 'partial' : 'all' },
      }).catch(() => {});
      console.log(`Posted ${fresh.length} KSET update(s).`);
    } catch (error) {
      console.error('Failed to post scheduled KSET updates', error);
    }
  }, 30 * 60 * 1000);
}

function buildKaeimUpdatesContent(items) {
  const lines = items.map((it) => {
    const date = it.date ? `\`${it.date}\` ` : '';
    const who = it.author ? ` _(${it.author})_` : '';
    return `📢 ${date}${it.title}${who}`;
  });
  return [
    '## 🇰🇷 한국교육정보미디어학회(KAEIM) 새 소식',
    `최근 [학회 공지 보드](${KAEIM_NOTICE_URL})에 올라온 항목입니다 (학회지 「교육정보미디어연구」 발간·접수 소식 포함).`,
    '',
    ...lines,
    '',
    '_출처: 한국교육정보미디어학회 kaeim.jams.or.kr_',
  ].join('\n');
}

async function postKaeimUpdates(channel, items) {
  if (!channel?.isTextBased?.()) return;
  const content = buildKaeimUpdatesContent(items);
  if (content.length <= 2000) {
    await channel.send({ content });
    return;
  }
  let trimmed = items.slice();
  while (trimmed.length > 1 && buildKaeimUpdatesContent(trimmed).length > 2000) {
    trimmed = trimmed.slice(0, -1);
  }
  await channel.send({ content: buildKaeimUpdatesContent(trimmed) });
}

function scheduleKaeimUpdates() {
  if (!config.kaeimUpdatesEnabled || !config.kaeimUpdatesChannelId) return;
  setInterval(async () => {
    try {
      const now = localTimeParts(new Date(), config.digestTimeZone);
      if (!sameWeekday(now.weekday, config.kaeimUpdatesWeekday) || now.hour !== config.kaeimUpdatesHourLocal) return;

      const runKey = `kaeimUpdates:${now.date}`;
      const state = await store.getState();
      if (state.lastKaeimUpdatesKey === runKey) return;

      const { items, errors } = await fetchKaeimUpdates({ sinceDays: config.kaeimUpdatesLookbackDays });
      if (errors.length) console.warn('KAEIM board harvest errors:', errors);

      const posted = new Set(state.postedKaeimItemIds ?? []);
      const fresh = items.filter((it) => !posted.has(it.id)).slice(0, config.kaeimUpdatesMaxItems);
      if (fresh.length === 0) {
        await store.setStateValue('lastKaeimUpdatesKey', runKey);
        return;
      }

      const channel = await client.channels.fetch(config.kaeimUpdatesChannelId).catch(() => null);
      if (!channel) {
        console.warn(`KAEIM updates channel not found: ${config.kaeimUpdatesChannelId}`);
        return;
      }

      await postKaeimUpdates(channel, fresh);
      await store.setStateValue('lastKaeimUpdatesKey', runKey);
      await store.setStateValue('lastKaeimUpdatesAt', new Date().toISOString());
      await store.setStateValue('postedKaeimItemIds', [
        ...fresh.map((it) => it.id),
        ...(state.postedKaeimItemIds ?? []),
      ].slice(0, 400));
      await chatLogger.log({
        eventType: 'weekly-kaeim-updates',
        guildId: config.guildId,
        channelId: config.kaeimUpdatesChannelId,
        commandName: 'scheduled',
        query: 'KAEIM board updates',
        responseExcerpt: fresh.map((it) => it.title).join(' | ').slice(0, 500),
        metadata: { count: fresh.length },
      }).catch(() => {});
      console.log(`Posted ${fresh.length} KAEIM update(s).`);
    } catch (error) {
      console.error('Failed to post scheduled KAEIM updates', error);
    }
  }, 30 * 60 * 1000);
}

function kciArticleId(a) {
  return a.doi || a.url || a.articleId || `${a.journal}-${a.volume}-${a.issue}-${(a.titleKo || '').slice(0, 24)}`;
}

function buildKciJournalContent(journal, articles) {
  const blocks = articles.map((a) => {
    const authors = a.authors.length ? a.authors.slice(0, 4).join(', ') + (a.authors.length > 4 ? ' 외' : '') : '';
    const where = [a.volume && `${a.volume}권`, a.issue && `${a.issue}호`, a.pubYear && `${a.pubYear}.${a.pubMon || ''}`]
      .filter(Boolean).join(' ');
    const linkTitle = (a.url || a.doi) ? `[${a.titleKo}](${a.url || a.doi})` : a.titleKo;
    const abstract = (a.abstractKo || '').replace(/\s+/g, ' ').trim();
    const excerpt = abstract ? `> ${abstract.slice(0, 220)}${abstract.length > 220 ? '…' : ''}` : '';
    return [`**${linkTitle}**`, `${authors}${where ? ` · ${where}` : ''}`, excerpt].filter(Boolean).join('\n');
  });
  return [
    `## 📚 ${journal.name} 최신 논문 (초록)`,
    `_${journal.society} · KCI 색인 기준_`,
    '',
    blocks.join('\n\n'),
  ].join('\n');
}

async function postKciJournalDigest(channel, journal, articles) {
  if (!channel?.isTextBased?.()) return;
  let items = articles.slice();
  let content = buildKciJournalContent(journal, items);
  while (items.length > 1 && content.length > 2000) {
    items = items.slice(0, -1);
    content = buildKciJournalContent(journal, items);
  }
  await channel.send({ content: content.slice(0, 2000) });
}

function scheduleKciJournalDigest() {
  if (!config.kciDigestEnabled || !config.kciDigestChannelId || !config.kciApiKey) return;
  setInterval(async () => {
    try {
      const now = localTimeParts(new Date(), config.digestTimeZone);
      if (!sameWeekday(now.weekday, config.kciDigestWeekday) || now.hour !== config.kciDigestHourLocal) return;

      const runKey = `kciDigest:${now.date}`;
      const state = await store.getState();
      if (state.lastKciDigestKey === runKey) return;

      const channel = await client.channels.fetch(config.kciDigestChannelId).catch(() => null);
      if (!channel) {
        console.warn(`KCI digest channel not found: ${config.kciDigestChannelId}`);
        return;
      }

      const posted = new Set(state.postedKciArticleIds ?? []);
      const thisYear = now.date.slice(0, 4);
      const newIds = [];
      let totalPosted = 0;

      for (const journal of KCI_JOURNALS) {
        let { articles } = await fetchJournalArticles({
          key: config.kciApiKey, journalName: journal.name, searchTerm: journal.searchTerm, year: thisYear, max: config.kciDigestMaxPerJournal,
        });
        if (articles.length === 0) {
          ({ articles } = await fetchJournalArticles({
            key: config.kciApiKey, journalName: journal.name, searchTerm: journal.searchTerm, year: String(Number(thisYear) - 1), max: config.kciDigestMaxPerJournal,
          }));
        }
        const fresh = articles.filter((a) => !posted.has(kciArticleId(a)));
        if (fresh.length === 0) continue;
        await postKciJournalDigest(channel, journal, fresh);
        fresh.forEach((a) => newIds.push(kciArticleId(a)));
        totalPosted += fresh.length;
      }

      await store.setStateValue('lastKciDigestKey', runKey);
      if (newIds.length) {
        await store.setStateValue('postedKciArticleIds', [...newIds, ...(state.postedKciArticleIds ?? [])].slice(0, 600));
        await store.setStateValue('lastKciDigestAt', new Date().toISOString());
        await chatLogger.log({
          eventType: 'weekly-kci-journal-digest',
          guildId: config.guildId,
          channelId: config.kciDigestChannelId,
          commandName: 'scheduled',
          query: 'KCI journal abstracts',
          responseExcerpt: `posted ${totalPosted} article(s)`,
          metadata: { count: totalPosted },
        }).catch(() => {});
      }
      console.log(`Posted KCI journal digest: ${totalPosted} article(s).`);
    } catch (error) {
      console.error('Failed to post scheduled KCI journal digest', error);
    }
  }, 30 * 60 * 1000);
}

function buildIntlContent(kind, items) {
  const heading = kind === 'cfp'
    ? '## 🌍 국제 학회 CFP (교육공학·학습과학)'
    : '## 🌍 국제 학회 소식 (교육공학·학습과학)';
  const lines = items.map((it) => {
    const date = it.date ? `\`${new Date(it.date).toISOString().slice(0, 10)}\` ` : '';
    const title = it.link ? `[${it.title}](${it.link})` : it.title;
    return `${kind === 'cfp' ? '📝' : '📰'} ${date}**${it.org}** · ${title}`;
  });
  return [heading, '', ...lines, '', '_출처: 각 학회 공식 피드 (ISLS 등)_'].join('\n');
}

async function postIntlDigest(channel, kind, items) {
  if (!channel?.isTextBased?.() || items.length === 0) return;
  let list = items.slice();
  let content = buildIntlContent(kind, list);
  while (list.length > 1 && content.length > 2000) { list = list.slice(0, -1); content = buildIntlContent(kind, list); }
  await channel.send({ content: content.slice(0, 2000) });
}

function scheduleIntlFeeds() {
  if (!config.intlFeedsEnabled || (!config.intlCfpChannelId && !config.intlNewsChannelId)) return;
  setInterval(async () => {
    try {
      const now = localTimeParts(new Date(), config.digestTimeZone);
      if (!sameWeekday(now.weekday, config.intlFeedsWeekday) || now.hour !== config.intlFeedsHourLocal) return;

      const runKey = `intlFeeds:${now.date}`;
      const state = await store.getState();
      if (state.lastIntlFeedsKey === runKey) return;

      const { cfp, news, errors } = await fetchIntlSources({ sinceDays: config.intlFeedsLookbackDays });
      if (errors.length) console.warn('Intl feeds partial errors:', errors);

      const posted = new Set(state.postedIntlItemIds ?? []);
      // Activation floor: never post a dated item older than when the system was
      // seeded (no backlog spam). Undated items are gated by the posted-id seed.
      const floor = state.seededAt ? new Date(state.seededAt) : null;
      const isBacklog = (i) => {
        if (!floor || !i.date) return false;
        const d = new Date(i.date);
        return !Number.isNaN(d.getTime()) && d < floor;
      };
      const fresh = (i) => !posted.has(i.id) && !isBacklog(i);
      const freshCfp = cfp.filter(fresh).slice(0, config.intlFeedsMaxItems);
      const freshNews = news.filter(fresh).slice(0, config.intlFeedsMaxItems);
      if (freshCfp.length === 0 && freshNews.length === 0) {
        await store.setStateValue('lastIntlFeedsKey', runKey);
        return;
      }

      if (freshCfp.length && config.intlCfpChannelId) {
        const ch = await client.channels.fetch(config.intlCfpChannelId).catch(() => null);
        if (ch) await postIntlDigest(ch, 'cfp', freshCfp);
      }
      if (freshNews.length && config.intlNewsChannelId) {
        const ch = await client.channels.fetch(config.intlNewsChannelId).catch(() => null);
        if (ch) await postIntlDigest(ch, 'news', freshNews);
      }

      await store.setStateValue('lastIntlFeedsKey', runKey);
      await store.setStateValue('lastIntlFeedsAt', new Date().toISOString());
      await store.setStateValue('postedIntlItemIds', [
        ...freshCfp.map((i) => i.id), ...freshNews.map((i) => i.id), ...(state.postedIntlItemIds ?? []),
      ].slice(0, 600));
      await chatLogger.log({
        eventType: 'weekly-intl-feeds',
        guildId: config.guildId,
        channelId: config.intlCfpChannelId || config.intlNewsChannelId,
        commandName: 'scheduled',
        query: 'intl edtech feeds',
        responseExcerpt: `cfp ${freshCfp.length}, news ${freshNews.length}`,
        metadata: { cfp: freshCfp.length, news: freshNews.length },
      }).catch(() => {});
      console.log(`Posted intl feeds: ${freshCfp.length} CFP, ${freshNews.length} news.`);
    } catch (error) {
      console.error('Failed to post scheduled intl feeds', error);
    }
  }, 30 * 60 * 1000);
}

function scheduleWeeklyTechSignal() {
  if (!config.techSignalEnabled || !config.techSignalChannelId) return;
  setInterval(async () => {
    try {
      const now = localTimeParts(new Date(), config.digestTimeZone);
      if (!sameWeekday(now.weekday, config.techSignalWeekday) || now.hour !== config.techSignalHourLocal) return;

      const signalKey = `weeklyTechSignal:${now.date}`;
      const state = await store.getState();
      if (state.lastWeeklyTechSignalKey === signalKey) return;

      const signal = await selectWeeklyTechSignal(state);
      if (!signal) {
        console.warn('Weekly KELS Tech Signal skipped because no arXiv or GitHub candidates were available.');
        return;
      }

      const channel = await client.channels.fetch(config.techSignalChannelId).catch(() => null);
      if (!channel) {
        console.warn(`Weekly KELS Tech Signal channel not found: ${config.techSignalChannelId}`);
        return;
      }

      const qwenDigest = signal.kind === 'github'
        ? await summarizeGithubRepoWithQwen(qwen, signal)
        : await summarizeTechPaperWithQwen(qwen, signal);
      await postTechSignal(channel, signal, qwenDigest);
      await store.setStateValue('lastWeeklyTechSignalKey', signalKey);
      await store.setStateValue('lastWeeklyTechSignalAt', new Date().toISOString());
      if (signal.kind === 'github') {
        await store.setStateValue('recommendedGithubRepoIds', [
          signal.id,
          ...(state.recommendedGithubRepoIds ?? []).filter((id) => id !== signal.id),
        ].slice(0, 100));
      } else {
        await store.setStateValue('recommendedArxivTechPaperIds', [
          signal.id,
          ...(state.recommendedArxivTechPaperIds ?? []).filter((id) => id !== signal.id),
        ].slice(0, 100));
      }
      await chatLogger.log({
        eventType: 'weekly-tech-signal',
        guildId: config.guildId,
        channelId: config.techSignalChannelId,
        commandName: 'scheduled',
        query: signal.title,
        responseExcerpt: JSON.stringify(qwenDigest ?? {}),
        metadata: { signalId: signal.id, signalKind: signal.kind ?? 'arxiv', qwenEnabled: qwen.enabled },
      });
      console.log(`Posted weekly KELS Tech Signal: ${signal.kind ?? 'arxiv'} ${signal.id}`);
    } catch (error) {
      console.error('Failed to post scheduled KELS Tech Signal', error);
    }
  }, 30 * 60 * 1000);
}

async function selectWeeklyTechSignal(state) {
  const [papers, repos, recentPosts] = await Promise.all([
    fetchCandidateTechPapers({
      query: config.techSignalQuery || undefined,
      days: config.techSignalLookbackDays,
    }).catch((error) => {
      console.warn(`arXiv tech signal fetch failed: ${error.message}`);
      return [];
    }),
    config.techSignalGithubEnabled
      ? fetchCandidateGithubRepos({
        queries: config.techSignalGithubQueries.length ? config.techSignalGithubQueries : undefined,
        days: config.techSignalLookbackDays,
        minStars: config.techSignalGithubMinStars,
      }).catch((error) => {
        console.warn(`GitHub tech signal fetch failed: ${error.message}`);
        return [];
      })
      : Promise.resolve([]),
    store.getPosts({ category: 'all', days: 60 }).catch(() => []),
  ]);

  const paper = selectWeeklyTechPaper(papers, state.recommendedArxivTechPaperIds ?? []);
  const repo = selectWeeklyGithubRepo(repos, state.recommendedGithubRepoIds ?? []);
  const candidates = [
    paper ? { ...paper, kind: 'arxiv', score: scoreTechPaper(paper) + scoreCandidateAgainstArchive(paper, recentPosts) } : null,
    repo ? { ...repo, score: scoreGithubRepo(repo) + scoreCandidateAgainstArchive(repo, recentPosts) } : null,
  ].filter(Boolean);

  return candidates.sort((a, b) => b.score - a.score)[0] ?? null;
}

function scheduleMonthlyRadar() {
  if (!config.monthlyRadarEnabled || !config.monthlyRadarChannelId) return;
  setInterval(async () => {
    try {
      const now = localTimeParts(new Date(), config.digestTimeZone);
      if (now.day !== 1 || now.hour !== config.monthlyRadarHourLocal) return;

      const radarKey = `monthlyRadar:${now.date.slice(0, 7)}`;
      const state = await store.getState();
      if (state.lastMonthlyRadarKey === radarKey) return;

      const channel = await client.channels.fetch(config.monthlyRadarChannelId).catch(() => null);
      if (!channel?.isTextBased?.()) return;

      const posts = (await store.getPosts({ category: 'all', days: 31 }))
        .filter((post) => !post.guildId || post.guildId === config.guildId);
      const deadlines = await store.getUpcomingDeadlines({ days: 60, category: 'all' });
      await channel.send({
        embeds: [buildMonthlyRadarEmbed({ posts, deadlines, monthLabel: now.date.slice(0, 7) })],
      });
      await store.setStateValue('lastMonthlyRadarKey', radarKey);
      await store.setStateValue('lastMonthlyRadarAt', new Date().toISOString());
      console.log(`Posted monthly KELS research radar: ${radarKey}`);
    } catch (error) {
      console.error('Failed to post monthly KELS research radar', error);
    }
  }, 30 * 60 * 1000);
}

function scheduleDeadlineReminders() {
  if (!config.deadlineReminderEnabled || !config.deadlineReminderChannelId) return;
  setInterval(async () => {
    try {
      const now = localTimeParts(new Date(), config.digestTimeZone);
      if (now.hour !== config.deadlineReminderHourLocal) return;

      const state = await store.getState();
      const posted = new Set(state.postedDeadlineReminderKeys ?? []);
      const channel = await client.channels.fetch(config.deadlineReminderChannelId).catch(() => null);
      if (!channel?.isTextBased?.()) return;

      for (const daysUntil of config.deadlineReminderDays) {
        const reminderKey = `deadlineReminder:${now.date}:D${daysUntil}`;
        if (posted.has(reminderKey)) continue;

        const reminders = (await store.getUpcomingDeadlines({ days: daysUntil, category: 'all' }))
          .filter((deadline) => deadline.iso === isoDaysFromNow(daysUntil));
        if (!reminders.length) {
          posted.add(reminderKey);
          continue;
        }

        await channel.send({ embeds: [buildDeadlineReminderEmbed(reminders, daysUntil)] });
        posted.add(reminderKey);
        console.log(`Posted D-${daysUntil} deadline reminder with ${reminders.length} item(s).`);
      }

      await store.setStateValue('postedDeadlineReminderKeys', Array.from(posted).slice(-300));
    } catch (error) {
      console.error('Failed to post KELS deadline reminders', error);
    }
  }, 30 * 60 * 1000);
}

// Proactive FieldExplorer CFP alerts: posts D-30/14/7/1 reminders for verified
// deadlines to a channel. Gated; off unless enabled + channel + Supabase set.
function scheduleFieldExplorerCfpAlerts() {
  if (!config.fieldExplorerCfpAlertEnabled || !config.fieldExplorerCfpAlertChannelId) return;
  if (!config.fieldExplorerSupabaseUrl || !config.fieldExplorerSupabaseKey) return;
  setInterval(async () => {
    try {
      const now = localTimeParts(new Date(), config.digestTimeZone);
      if (now.hour !== config.fieldExplorerCfpAlertHourLocal) return;

      const state = await store.getState();
      const posted = new Set(state.fieldExplorerCfpAlertKeys ?? []);
      const channel = await client.channels.fetch(config.fieldExplorerCfpAlertChannelId).catch(() => null);
      if (!channel?.isTextBased?.()) return;

      const thresholds = config.fieldExplorerCfpAlertDays.length
        ? config.fieldExplorerCfpAlertDays
        : [30, 14, 7, 1];
      const rows = await fetchVerifiedCfp({
        supabaseUrl: config.fieldExplorerSupabaseUrl,
        supabaseKey: config.fieldExplorerSupabaseKey,
      });
      const alerts = cfpAlertsForDay(rows, { now: new Date(), thresholds });

      // Group by threshold and post once per (date, threshold).
      const byThreshold = new Map();
      for (const a of alerts) {
        if (!byThreshold.has(a.threshold)) byThreshold.set(a.threshold, []);
        byThreshold.get(a.threshold).push(a);
      }
      for (const [threshold, items] of byThreshold) {
        const key = `feCfpAlert:${now.date}:D${threshold}`;
        if (posted.has(key)) continue;
        const message = formatCfpAlertMessage(items, { now: new Date() });
        if (message) {
          await channel.send({ content: message });
          console.log(`Posted FieldExplorer CFP D-${threshold} alert with ${items.length} venue(s).`);
        }
        posted.add(key);
      }

      await store.setStateValue('fieldExplorerCfpAlertKeys', Array.from(posted).slice(-300));
    } catch (error) {
      console.error('Failed to post FieldExplorer CFP alerts', error);
    }
  }, 30 * 60 * 1000);
}

// Weekly FieldExplorer community digest: new venues + top reviews + imminent CFP.
function scheduleFieldExplorerWeeklyDigest() {
  if (!config.fieldExplorerDigestEnabled || !config.fieldExplorerDigestChannelId) return;
  if (!config.fieldExplorerSupabaseUrl) return;
  setInterval(async () => {
    try {
      const now = localTimeParts(new Date(), config.digestTimeZone);
      if (now.weekday !== config.fieldExplorerDigestWeekday || now.hour !== config.fieldExplorerDigestHourLocal) return;

      const state = await store.getState();
      const posted = new Set(state.fieldExplorerDigestKeys ?? []);
      const key = `feDigest:${now.date}`;
      if (posted.has(key)) return;

      const channel = await client.channels.fetch(config.fieldExplorerDigestChannelId).catch(() => null);
      if (!channel?.isTextBased?.()) return;

      const data = await buildWeeklyDigestData({ config, days: 7, cfpWindow: 30, now: new Date() });
      const message = formatWeeklyDigest({ ...data, now: new Date() });
      if (message) {
        await channel.send({ content: truncateDiscord(message, 1900) });
        console.log(`Posted FieldExplorer weekly digest (${data.venues.length} venues, ${data.reviews.length} reviews, ${data.cfp.length} cfp).`);
      }
      posted.add(key);
      await store.setStateValue('fieldExplorerDigestKeys', Array.from(posted).slice(-30));
    } catch (error) {
      console.error('Failed to post FieldExplorer weekly digest', error);
    }
  }, 30 * 60 * 1000);
}

function scheduleEventReminders() {
  if (!config.eventReminderEnabled) return;
  setInterval(async () => {
    try {
      const state = await store.getState();
      const posted = new Set(state.postedEventReminderKeys ?? []);
      const postedD1 = new Set(state.postedEventDayBeforeReminderKeys ?? []);
      const postedFollowups = new Set(state.postedEventFollowupKeys ?? []);
      const events = (await store.getUpcomingEvents({
        minutes: config.eventReminderLookaheadMinutes,
        sourceChannels: config.eventReminderSourceChannels,
        timeZone: config.digestTimeZone,
      })).filter((event) => !posted.has(eventReminderKey(event)));

      const guild = await client.guilds.fetch(config.guildId).catch(() => null);
      if (events.length) {
        const targetChannel = await findEventReminderChannel(guild, events[0]);
        if (targetChannel?.isTextBased?.()) {
          await targetChannel.send({
            content: '@everyone 곧 시작하는 KELS 이벤트 리마인더입니다.',
            embeds: [buildEventReminderEmbed(events)],
            allowedMentions: { parse: ['everyone'] },
          });
          for (const event of events) posted.add(eventReminderKey(event));
          console.log(`Posted 1-hour event reminder with ${events.length} item(s).`);
        }
      }

      if (config.eventDayBeforeReminderEnabled) {
        const d1Events = (await store.getEventsOnDay({
          daysFromNow: 1,
          sourceChannels: config.eventReminderSourceChannels,
          timeZone: config.digestTimeZone,
        })).filter((event) => !postedD1.has(eventDayBeforeReminderKey(event)));

        if (d1Events.length) {
          const targetChannel = await findEventReminderChannel(guild, d1Events[0]);
          if (targetChannel?.isTextBased?.()) {
            await targetChannel.send({
              content: '@everyone 내일 예정된 KELS 이벤트 리마인더입니다.',
              embeds: [buildEventReminderEmbed(d1Events, {
                title: 'KELS Event Reminder: D-1',
                description: 'Announcement channel event is scheduled for tomorrow.',
              })],
              allowedMentions: { parse: ['everyone'] },
            });
            for (const event of d1Events) postedD1.add(eventDayBeforeReminderKey(event));
            console.log(`Posted D-1 event reminder with ${d1Events.length} item(s).`);
          }
        }
      }

      if (config.eventFollowupEnabled) {
        const followups = (await store.getPastEventsNeedingFollowup({
          sourceChannels: config.eventReminderSourceChannels,
          timeZone: config.digestTimeZone,
          windowMinutes: config.eventFollowupWindowMinutes,
        })).filter((event) => !postedFollowups.has(eventFollowupKey(event)));

        for (const event of followups.slice(0, 5)) {
          if (await createEventFollowupThread(event)) postedFollowups.add(eventFollowupKey(event));
        }
      }

      await store.setStateValue('postedEventReminderKeys', Array.from(posted).slice(-500));
      await store.setStateValue('postedEventDayBeforeReminderKeys', Array.from(postedD1).slice(-500));
      await store.setStateValue('postedEventFollowupKeys', Array.from(postedFollowups).slice(-500));
    } catch (error) {
      console.error('Failed to post KELS event reminders', error);
    }
  }, config.eventReminderPollMinutes * 60 * 1000);
}

function scheduleRolelessReminders() {
  if (!config.rolelessReminderEnabled) return;
  setInterval(async () => {
    try {
      const now = localTimeParts(new Date(), config.digestTimeZone);
      if (now.hour !== config.rolelessReminderHourLocal) return;

      const state = await store.getState();
      const posted = new Set(state.rolelessReminderKeys ?? []);
      const reminderKey = `rolelessReminder:${now.date}`;
      if (posted.has(reminderKey)) return;

      const guild = await client.guilds.fetch(config.guildId).catch(() => null);
      if (!guild) return;
      const members = await guild.members.fetch().catch(() => null);
      if (!members) return;

      const ignored = new Set(config.roleIgnoreNames.map((name) => normalizeRoleKey(name)));
      const cutoffMs = Date.now() - config.rolelessReminderAfterDays * 24 * 60 * 60 * 1000;
      let reminded = 0;
      for (const member of members.values()) {
        if (member.user.bot) continue;
        if (!member.joinedAt || member.joinedAt.getTime() > cutoffMs) continue;
        const visibleRoles = member.roles.cache
          .filter((role) => role.id !== guild.id)
          .filter((role) => !ignored.has(normalizeRoleKey(role.name)));
        if (visibleRoles.size) continue;
        await member.send([
          'KELS role 설정을 아직 못 하신 것 같아 가볍게 알려드립니다.',
          '관심분야나 찾는 정보를 introduction에 남겨주시면 bot이 적절한 role 후보를 운영자에게 추천하고, `/profile action:add topic:<관심주제>`로 개인 맞춤 알림도 받을 수 있습니다.',
        ].join('\n')).catch(() => null);
        reminded += 1;
      }

      posted.add(reminderKey);
      await store.setStateValue('rolelessReminderKeys', Array.from(posted).slice(-90));
      if (reminded) console.log(`Sent roleless gentle reminders to ${reminded} member(s).`);
    } catch (error) {
      console.error('Failed to send roleless reminders', error);
    }
  }, 60 * 60 * 1000);
}

function scheduleOnboardingFollowups() {
  if (!config.onboardingFollowupEnabled) return;
  setInterval(async () => {
    try {
      const state = await store.getState();
      const queue = state.onboardingFollowupQueue ?? [];
      const now = new Date();
      let changed = false;

      for (const item of queue) {
        if (item.sentAt || item.failedAt) continue;
        if (!item.dueAt || new Date(item.dueAt) > now) continue;

        const pathway = await memberOnboardingPathway({ interests: item.interests ?? [] });
        const message = buildOnboardingFollowupMessage(item, pathway);
        const sent = await sendOnboardingFollowup(item.threadId, message);
        if (sent) {
          item.sentAt = now.toISOString();
          changed = true;
          await chatLogger.log({
            eventType: 'onboarding-followup',
            guildId: config.guildId,
            channelId: item.threadId,
            userId: item.userId,
            query: (item.interests ?? []).join(', '),
            responseExcerpt: message,
            metadata: { threadId: item.threadId, dueAt: item.dueAt },
          });
        } else {
          item.failedAt = now.toISOString();
          changed = true;
        }
      }

      if (changed) {
        await store.setStateValue('onboardingFollowupQueue', queue.slice(-1000));
      }
    } catch (error) {
      console.error('Failed to send onboarding follow-ups', error);
    }
  }, 60 * 60 * 1000);
}

async function sendOnboardingFollowup(threadId, content) {
  const thread = await client.channels.fetch(threadId).catch(() => null);
  if (!thread?.isTextBased?.()) return false;
  const sent = await thread.send(truncateDiscord(content, 1800)).catch((error) => {
    console.warn(`Failed to send onboarding follow-up to ${threadId}: ${error.message}`);
    return null;
  });
  return Boolean(sent);
}

async function findEventReminderChannel(guild, event) {
  if (config.eventReminderChannelId) {
    const configured = await client.channels.fetch(config.eventReminderChannelId).catch(() => null);
    if (configured) return configured;
  }
  if (event?.post?.channelId) {
    const source = await client.channels.fetch(event.post.channelId).catch(() => null);
    if (source) return source;
  }
  const channels = await guild?.channels?.fetch?.().catch(() => null);
  return channels ? findConfiguredChannel(channels, config.eventReminderSourceChannels[0] ?? 'announcement') : null;
}

function eventReminderKey(event) {
  return `eventReminder:${event.post.id}:${event.startsAt}`;
}

function eventDayBeforeReminderKey(event) {
  return `eventD1:${event.post.id}:${event.startsAt}`;
}

function eventFollowupKey(event) {
  return `eventFollowup:${event.post.id}:${event.startsAt}`;
}

async function createEventFollowupThread(event) {
  const channel = await client.channels.fetch(event.post.channelId).catch(() => null);
  if (!channel?.messages?.fetch) return false;
  const sourceMessage = await channel.messages.fetch(event.post.id).catch(() => null);
  if (!sourceMessage) return false;
  if (sourceMessage.hasThread && sourceMessage.thread?.isTextBased?.()) {
    await sourceMessage.thread.send(eventFollowupPrompt()).catch(() => null);
    return true;
  }

  const threadName = `Follow-up: ${event.post.content.replace(/\s+/g, ' ').trim().slice(0, 70) || 'KELS event'}`;
  const thread = await sourceMessage.startThread({
    name: threadName.slice(0, 100),
    autoArchiveDuration: 1440,
    reason: 'KELS event follow-up materials thread',
  }).catch((error) => {
    console.warn(`Failed to create event follow-up thread: ${error.message}`);
    return null;
  });
  if (!thread) return false;
  await thread.send(eventFollowupPrompt()).catch(() => null);
  return true;
}

function eventFollowupPrompt() {
  return [
    '이 이벤트의 후속 자료가 있으면 여기 thread에 공유해주세요.',
    '녹화, 슬라이드, RSVP 후속 링크, 요약 노트 모두 환영합니다.',
  ].join('\n');
}

async function postArticleRecommendation(channel, article, qwenSummary = null) {
  const embed = buildArticleRecommendationEmbed(article, qwenSummary);
  if (channel.type === ChannelType.GuildForum || channel.type === ChannelType.GuildMedia) {
    await channel.threads.create({
      name: forumThreadName(article),
      message: { embeds: [embed] },
      reason: 'KELS weekly OpenAlex article recommendation',
    });
    return;
  }

  if (channel.isTextBased?.()) {
    await channel.send({ embeds: [embed] });
  }
}

async function postTechSignal(channel, paper, qwenDigest = null) {
  const embed = buildTechSignalEmbed(paper, qwenDigest);
  if (channel.type === ChannelType.GuildForum || channel.type === ChannelType.GuildMedia) {
    await channel.threads.create({
      name: techSignalThreadName(paper),
      message: { embeds: [embed] },
      reason: 'KELS weekly tech signal',
    });
    return;
  }

  if (channel.isTextBased?.()) {
    await channel.send({ embeds: [embed] });
  }
}

function forumThreadName(article) {
  const prefix = 'KELS weekly article: ';
  const title = article.title.replace(/\s+/g, ' ').trim();
  return `${prefix}${title}`.slice(0, 100);
}

function techSignalThreadName(paper) {
  const prefix = 'KELS Tech Signal: ';
  const title = paper.title.replace(/\s+/g, ' ').trim();
  return `${prefix}${title}`.slice(0, 100);
}

function localTimeParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return {
    weekday: value('weekday'),
    hour: Number.parseInt(value('hour'), 10),
    date: `${value('year')}-${value('month')}-${value('day')}`,
    day: Number.parseInt(value('day'), 10),
  };
}

function isoDaysFromNow(days, now = new Date()) {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysFromIso(iso, days) {
  const date = new Date(iso);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function sameWeekday(actual, configured) {
  return String(actual ?? '').slice(0, 3).toLowerCase() === String(configured ?? '').slice(0, 3).toLowerCase();
}

function truncateDiscord(text, max = 1900) {
  const value = String(text ?? '').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 30).trim()}\n\n[truncated]`;
}

client.on(Events.Error, (error) => {
  console.error('Discord client error', error);
});

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down KELS Curator Bot.`);
  client.destroy();
  process.exit(0);
}

await client.login(config.discordToken);
