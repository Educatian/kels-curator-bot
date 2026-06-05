import path from 'node:path';
import process from 'node:process';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function splitList(value) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function bool(value) {
  return /^(1|true|yes|on)$/i.test(value ?? '');
}

function intEnv(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name] ?? String(fallback);
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Invalid ${name}: expected integer ${min}-${max}, got "${raw}"`);
  }
  return value;
}

export function loadConfig() {
  return {
    discordToken: required('DISCORD_TOKEN'),
    clientId: required('DISCORD_CLIENT_ID'),
    guildId: required('DISCORD_GUILD_ID'),
    digestChannelId: process.env.DIGEST_CHANNEL_ID ?? '',
    digestHourLocal: intEnv('DIGEST_CRON_HOUR_LOCAL', 9, { min: 0, max: 23 }),
    digestTimeZone: process.env.DIGEST_TIME_ZONE ?? 'America/Los_Angeles',
    indexChannels: splitList(process.env.INDEX_CHANNELS),
    autoReactEnabled: bool(process.env.AUTO_REACT_ENABLED),
    autoReactEmojis: splitList(process.env.AUTO_REACT_EMOJIS || 'KELS,👍'),
    autoBackfillOnReady: bool(process.env.AUTO_BACKFILL_ON_READY),
    autoBackfillForce: bool(process.env.AUTO_BACKFILL_FORCE),
    autoBackfillLimit: intEnv('AUTO_BACKFILL_LIMIT', 50, { min: 1, max: 100 }),
    articleDigestEnabled: bool(process.env.ARTICLE_DIGEST_ENABLED),
    articleDigestChannelId: process.env.ARTICLE_DIGEST_CHANNEL_ID ?? '',
    articleDigestHourLocal: intEnv('ARTICLE_DIGEST_HOUR_LOCAL', 10, { min: 0, max: 23 }),
    articleDigestLookbackDays: intEnv('ARTICLE_DIGEST_LOOKBACK_DAYS', 365, { min: 30, max: 1825 }),
    techSignalEnabled: bool(process.env.TECH_SIGNAL_ENABLED),
    techSignalChannelId: process.env.TECH_SIGNAL_CHANNEL_ID ?? process.env.ARTICLE_DIGEST_CHANNEL_ID ?? '',
    techSignalWeekday: process.env.TECH_SIGNAL_WEEKDAY ?? 'Wed',
    techSignalHourLocal: intEnv('TECH_SIGNAL_HOUR_LOCAL', 10, { min: 0, max: 23 }),
    techSignalLookbackDays: intEnv('TECH_SIGNAL_LOOKBACK_DAYS', 14, { min: 1, max: 60 }),
    techSignalQuery: process.env.TECH_SIGNAL_QUERY ?? '',
    techSignalGithubEnabled: process.env.TECH_SIGNAL_GITHUB_ENABLED === undefined ? true : bool(process.env.TECH_SIGNAL_GITHUB_ENABLED),
    techSignalGithubMinStars: intEnv('TECH_SIGNAL_GITHUB_MIN_STARS', 100, { min: 1, max: 100000 }),
    techSignalGithubQueries: splitList(process.env.TECH_SIGNAL_GITHUB_QUERIES),
    // 한국교육공학회(KSET) 주간 업데이트: kset.or.kr 공지/소식·학술대회 발표논문(프로시딩)·
    // 행사일정·뉴스레터를 직접 파싱해 새 항목을 주간 포스트. 저널(교육공학연구)은 ACOMS
    // 호스팅이라 일부 환경에서 접속 불가 → 발간 소식은 공지 보드로 포착된다.
    ksetUpdatesEnabled: bool(process.env.KSET_UPDATES_ENABLED),
    ksetUpdatesChannelId: process.env.KSET_UPDATES_CHANNEL_ID ?? process.env.ARTICLE_DIGEST_CHANNEL_ID ?? '',
    ksetUpdatesWeekday: process.env.KSET_UPDATES_WEEKDAY ?? 'Fri',
    ksetUpdatesHourLocal: intEnv('KSET_UPDATES_HOUR_LOCAL', 10, { min: 0, max: 23 }),
    ksetUpdatesLookbackDays: intEnv('KSET_UPDATES_LOOKBACK_DAYS', 14, { min: 1, max: 180 }),
    ksetUpdatesMaxItems: intEnv('KSET_UPDATES_MAX_ITEMS', 8, { min: 1, max: 25 }),
    // 한국교육정보미디어학회(KAEIM) 주간 업데이트: kaeim.jams.or.kr(JAMS) 공지 보드를
    // 직접 파싱(학회지 교육정보미디어연구 N권 M호 논문 접수 소식 포함). 서버렌더라 헤드리스
    // 불필요. 개별 글 딥링크는 JAMS의 JS 폼방식이라 보드 페이지로 링크.
    kaeimUpdatesEnabled: bool(process.env.KAEIM_UPDATES_ENABLED),
    kaeimUpdatesChannelId: process.env.KAEIM_UPDATES_CHANNEL_ID ?? process.env.KSET_UPDATES_CHANNEL_ID ?? process.env.ARTICLE_DIGEST_CHANNEL_ID ?? '',
    kaeimUpdatesWeekday: process.env.KAEIM_UPDATES_WEEKDAY ?? 'Fri',
    kaeimUpdatesHourLocal: intEnv('KAEIM_UPDATES_HOUR_LOCAL', 10, { min: 0, max: 23 }),
    kaeimUpdatesLookbackDays: intEnv('KAEIM_UPDATES_LOOKBACK_DAYS', 30, { min: 1, max: 180 }),
    kaeimUpdatesMaxItems: intEnv('KAEIM_UPDATES_MAX_ITEMS', 8, { min: 1, max: 25 }),
    // KCI Open API 저널 초록 다이제스트: 교육공학연구·교육정보미디어연구 최신 논문 제목+
    // 초록+DOI를 주간 포스트. ACOMS/JAMS/DBpia가 다 막혀서 초록의 유일한 깔끔한 소스.
    // 무료 키 필요(open.kci.go.kr → OpenAPI 인증키). 기본 OFF.
    kciDigestEnabled: bool(process.env.KCI_DIGEST_ENABLED),
    kciApiKey: process.env.KCI_API_KEY ?? '',
    kciDigestChannelId: process.env.KCI_DIGEST_CHANNEL_ID ?? process.env.KSET_UPDATES_CHANNEL_ID ?? process.env.ARTICLE_DIGEST_CHANNEL_ID ?? '',
    kciDigestWeekday: process.env.KCI_DIGEST_WEEKDAY ?? 'Tue',
    kciDigestHourLocal: intEnv('KCI_DIGEST_HOUR_LOCAL', 10, { min: 0, max: 23 }),
    kciDigestMaxPerJournal: intEnv('KCI_DIGEST_MAX_PER_JOURNAL', 3, { min: 1, max: 8 }),
    fieldExplorerEnabled: bool(process.env.FIELD_EXPLORER_ENABLED),
    fieldExplorerTopicsFile: process.env.FIELD_EXPLORER_TOPICS_FILE ?? '',
    fieldExplorerLabel: process.env.FIELD_EXPLORER_LABEL ?? 'Field Explorer',
    fieldExplorerAppUrl: process.env.FIELD_EXPLORER_APP_URL ?? '',
    // Live verified-CFP bridge (read-only Supabase). Gated; off until configured.
    fieldExplorerCfpEnabled: bool(process.env.FIELD_EXPLORER_CFP_ENABLED),
    fieldExplorerSupabaseUrl: process.env.FIELD_EXPLORER_SUPABASE_URL ?? '',
    fieldExplorerSupabaseKey: process.env.FIELD_EXPLORER_SUPABASE_KEY ?? '',
    // Proactive CFP deadline alerts: posts D-30/14/7/1 reminders to a channel.
    fieldExplorerCfpAlertEnabled: bool(process.env.FIELD_EXPLORER_CFP_ALERT_ENABLED),
    fieldExplorerCfpAlertChannelId: process.env.FIELD_EXPLORER_CFP_ALERT_CHANNEL_ID ?? '',
    fieldExplorerCfpAlertHourLocal: intEnv('FIELD_EXPLORER_CFP_ALERT_HOUR_LOCAL', 9, { min: 0, max: 23 }),
    fieldExplorerCfpAlertDays: (splitList(process.env.FIELD_EXPLORER_CFP_ALERT_DAYS)
      .map((n) => Number.parseInt(n, 10))
      .filter((n) => Number.isFinite(n) && n >= 0)),
    // Review write-bridge (/review -> FieldExplorer annotations). Needs the SERVICE
    // ROLE key because annotations RLS has no insert policy. Gated; off by default.
    fieldExplorerReviewEnabled: bool(process.env.FIELD_EXPLORER_REVIEW_ENABLED),
    fieldExplorerServiceKey: process.env.FIELD_EXPLORER_SUPABASE_SERVICE_KEY ?? '',
    // /add-venue write-bridge (community_venues). Also needs the service role key.
    fieldExplorerAddVenueEnabled: bool(process.env.FIELD_EXPLORER_ADD_VENUE_ENABLED),
    // Weekly FieldExplorer community digest (new venues + top reviews + imminent CFP).
    fieldExplorerDigestEnabled: bool(process.env.FIELD_EXPLORER_DIGEST_ENABLED),
    fieldExplorerDigestChannelId: process.env.FIELD_EXPLORER_DIGEST_CHANNEL_ID ?? '',
    fieldExplorerDigestWeekday: process.env.FIELD_EXPLORER_DIGEST_WEEKDAY ?? 'Mon',
    fieldExplorerDigestHourLocal: intEnv('FIELD_EXPLORER_DIGEST_HOUR_LOCAL', 9, { min: 0, max: 23 }),
    // Submission-fit scorecard for /venue-scout (fingerprint + methodology + CFP).
    // Needs the semantic_profiles.json path. Gated; off by default.
    fieldExplorerScorecardEnabled: bool(process.env.FIELD_EXPLORER_SCORECARD_ENABLED),
    fieldExplorerProfilesFile: process.env.FIELD_EXPLORER_PROFILES_FILE ?? '',
    // Educational /quiz + /learn. Quiz items file (defaults to the FieldExplorer repo).
    fieldExplorerEduEnabled: bool(process.env.FIELD_EXPLORER_EDU_ENABLED),
    fieldExplorerQuizFile: process.env.FIELD_EXPLORER_QUIZ_FILE ?? '',
    monthlyRadarEnabled: bool(process.env.MONTHLY_RADAR_ENABLED),
    monthlyRadarChannelId: process.env.MONTHLY_RADAR_CHANNEL_ID ?? '',
    monthlyRadarHourLocal: intEnv('MONTHLY_RADAR_HOUR_LOCAL', 9, { min: 0, max: 23 }),
    deadlineReminderEnabled: bool(process.env.DEADLINE_REMINDER_ENABLED),
    deadlineReminderChannelId: process.env.DEADLINE_REMINDER_CHANNEL_ID ?? '',
    deadlineReminderHourLocal: intEnv('DEADLINE_REMINDER_HOUR_LOCAL', 9, { min: 0, max: 23 }),
    deadlineReminderDays: splitList(process.env.DEADLINE_REMINDER_DAYS || '14,7,2').map((day) => {
      const value = Number.parseInt(day, 10);
      if (!Number.isInteger(value) || value < 1 || value > 365) {
        throw new Error(`Invalid DEADLINE_REMINDER_DAYS value: "${day}"`);
      }
      return value;
    }),
    eventReminderEnabled: bool(process.env.EVENT_REMINDER_ENABLED),
    eventReminderSourceChannels: splitList(process.env.EVENT_REMINDER_SOURCE_CHANNELS || 'announcement'),
    eventReminderChannelId: process.env.EVENT_REMINDER_CHANNEL_ID ?? process.env.DEADLINE_REMINDER_CHANNEL_ID ?? '',
    eventReminderLookaheadMinutes: intEnv('EVENT_REMINDER_LOOKAHEAD_MINUTES', 60, { min: 15, max: 240 }),
    eventReminderPollMinutes: intEnv('EVENT_REMINDER_POLL_MINUTES', 10, { min: 1, max: 60 }),
    eventDayBeforeReminderEnabled: process.env.EVENT_D1_REMINDER_ENABLED === undefined ? true : bool(process.env.EVENT_D1_REMINDER_ENABLED),
    eventFollowupEnabled: process.env.EVENT_FOLLOWUP_ENABLED === undefined ? true : bool(process.env.EVENT_FOLLOWUP_ENABLED),
    eventFollowupWindowMinutes: intEnv('EVENT_FOLLOWUP_WINDOW_MINUTES', 1440, { min: 30, max: 10080 }),
    forumSuggestionEnabled: bool(process.env.FORUM_SUGGESTION_ENABLED),
    moderatorUserIds: splitList(process.env.MODERATOR_USER_IDS),
    qwenEnabled: bool(process.env.QWEN_ENABLED),
    qwenModel: process.env.QWEN_MODEL ?? 'qwen2.5-coder:7b',
    qwenBaseUrl: process.env.QWEN_BASE_URL ?? 'http://127.0.0.1:11434',
    qwenTimeoutMs: intEnv('QWEN_TIMEOUT_MS', 60000, { min: 1000, max: 120000 }),
    chatbotLoggingEnabled: bool(process.env.KELS_CHATBOT_LOGGING_ENABLED),
    logWebhookUrl: process.env.KELS_LOG_WEBHOOK_URL ?? '',
    logWebhookToken: process.env.KELS_LOG_WEBHOOK_TOKEN ?? '',
    roleAutoTaggingEnabled: bool(process.env.ROLE_AUTO_TAGGING_ENABLED),
    roleAutoCreateEnabled: bool(process.env.ROLE_AUTO_CREATE_ENABLED),
    roleAutoAssignEnabled: bool(process.env.ROLE_AUTO_ASSIGN_ENABLED),
    roleMinConfidence: Number.parseFloat(process.env.ROLE_MIN_CONFIDENCE ?? '0.72'),
    roleAutoAssignConfidence: Number.parseFloat(process.env.ROLE_AUTO_ASSIGN_CONFIDENCE ?? '0.88'),
    roleAutoCreateConfidence: Number.parseFloat(process.env.ROLE_AUTO_CREATE_CONFIDENCE ?? '0.94'),
    roleMaxPerMember: intEnv('ROLE_MAX_PER_MEMBER', 3, { min: 1, max: 8 }),
    rolePrefix: process.env.ROLE_PREFIX ?? 'KELS:',
    roleIgnoreNames: splitList(process.env.ROLE_IGNORE_NAMES || '@everyone,KELS,Admin & Facilitator,CommunicationOfficer'),
    onboardingEnabled: bool(process.env.ONBOARDING_ENABLED),
    onboardingChannelId: process.env.ONBOARDING_CHANNEL_ID ?? '',
    onboardingFollowupEnabled: process.env.ONBOARDING_FOLLOWUP_ENABLED === undefined ? true : bool(process.env.ONBOARDING_FOLLOWUP_ENABLED),
    onboardingFollowupAfterDays: intEnv('ONBOARDING_FOLLOWUP_AFTER_DAYS', 7, { min: 1, max: 60 }),
    rolelessReminderEnabled: bool(process.env.ROLELESS_REMINDER_ENABLED),
    rolelessReminderAfterDays: intEnv('ROLELESS_REMINDER_AFTER_DAYS', 7, { min: 1, max: 365 }),
    rolelessReminderHourLocal: intEnv('ROLELESS_REMINDER_HOUR_LOCAL', 10, { min: 0, max: 23 }),
    rolelessFallbackRoleName: process.env.ROLELESS_FALLBACK_ROLE_NAME ?? 'KELS:OnboardingNeeded',
    spamAutoDeleteEnabled: bool(process.env.SPAM_AUTO_DELETE_ENABLED),
    spamMaxUrls: intEnv('SPAM_MAX_URLS', 4, { min: 1, max: 20 }),
    spamMaxMentions: intEnv('SPAM_MAX_MENTIONS', 8, { min: 1, max: 100 }),
    anonymousAdviceEnabled: bool(process.env.ANON_ADVICE_ENABLED),
    anonymousAdviceReviewChannelId: process.env.ANON_ADVICE_REVIEW_CHANNEL_ID ?? '',
    anonymousAdvicePostChannelId: process.env.ANON_ADVICE_POST_CHANNEL_ID ?? '',
    anonymousAdviceDailyLimit: intEnv('ANON_ADVICE_DAILY_LIMIT', 2, { min: 1, max: 20 }),
    anonymousAdviceMinLength: intEnv('ANON_ADVICE_MIN_LENGTH', 20, { min: 1, max: 1000 }),
    openAlexMailto: process.env.OPENALEX_MAILTO ?? '',
    dataDir: path.resolve(process.env.DATA_DIR ?? './data'),
  };
}
