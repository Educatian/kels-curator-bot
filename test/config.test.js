import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('config', () => {
  it('loads required Discord settings and defaults', async () => {
    process.env.DISCORD_TOKEN = 'token';
    process.env.DISCORD_CLIENT_ID = 'client';
    process.env.DISCORD_GUILD_ID = 'guild';
    delete process.env.AUTO_BACKFILL_LIMIT;

    const config = loadConfig();
    expect(config.autoBackfillLimit).toBe(50);
    expect(config.autoBackfillForce).toBe(false);
    expect(config.autoReactEnabled).toBe(false);
    expect(config.autoReactEmojis).toEqual(['KELS', '👍']);
    expect(config.digestHourLocal).toBe(9);
    expect(config.articleDigestEnabled).toBe(false);
    expect(config.articleDigestHourLocal).toBe(10);
    expect(config.articleDigestLookbackDays).toBe(365);
    expect(config.techSignalGithubEnabled).toBe(true);
    expect(config.techSignalGithubMinStars).toBe(100);
    expect(config.fieldExplorerEnabled).toBe(false);
    expect(config.fieldExplorerTopicsFile).toBe('');
    expect(config.fieldExplorerLabel).toBe('Field Explorer');
    expect(config.monthlyRadarEnabled).toBe(false);
    expect(config.monthlyRadarHourLocal).toBe(9);
    expect(config.deadlineReminderEnabled).toBe(false);
    expect(config.deadlineReminderDays).toEqual([14, 7, 2]);
    expect(config.eventReminderEnabled).toBe(false);
    expect(config.eventReminderSourceChannels).toEqual(['announcement']);
    expect(config.eventReminderLookaheadMinutes).toBe(60);
    expect(config.eventReminderPollMinutes).toBe(10);
    expect(config.eventDayBeforeReminderEnabled).toBe(true);
    expect(config.eventFollowupEnabled).toBe(true);
    expect(config.forumSuggestionEnabled).toBe(false);
    expect(config.qwenEnabled).toBe(false);
    expect(config.qwenTimeoutMs).toBe(60000);
    expect(config.roleAutoTaggingEnabled).toBe(false);
    expect(config.rolePrefix).toBe('KELS:');
    expect(config.roleAutoAssignConfidence).toBe(0.88);
    expect(config.roleAutoCreateConfidence).toBe(0.94);
    expect(config.onboardingEnabled).toBe(false);
    expect(config.onboardingChannelId).toBe('');
    expect(config.onboardingFollowupEnabled).toBe(true);
    expect(config.onboardingFollowupAfterDays).toBe(7);
    expect(config.rolelessReminderEnabled).toBe(false);
    expect(config.rolelessReminderAfterDays).toBe(7);
    expect(config.spamAutoDeleteEnabled).toBe(false);
    expect(config.spamMaxUrls).toBe(4);
    expect(config.spamMaxMentions).toBe(8);
  });

  it('rejects invalid numeric settings', async () => {
    process.env.DISCORD_TOKEN = 'token';
    process.env.DISCORD_CLIENT_ID = 'client';
    process.env.DISCORD_GUILD_ID = 'guild';
    process.env.AUTO_BACKFILL_LIMIT = '500';

    expect(() => loadConfig()).toThrow('Invalid AUTO_BACKFILL_LIMIT');
  });

  it('rejects invalid deadline reminder day settings', async () => {
    process.env.DISCORD_TOKEN = 'token';
    process.env.DISCORD_CLIENT_ID = 'client';
    process.env.DISCORD_GUILD_ID = 'guild';
    process.env.DEADLINE_REMINDER_DAYS = '14,nope';

    expect(() => loadConfig()).toThrow('Invalid DEADLINE_REMINDER_DAYS');
  });
});
