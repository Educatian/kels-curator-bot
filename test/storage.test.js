import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JsonStore } from '../src/storage.js';

let tempDir;
let store;

function post(overrides = {}) {
  return {
    id: overrides.id ?? '1',
    guildId: 'guild',
    channelId: overrides.channelId ?? 'channel',
    channelName: overrides.channelName ?? 'job_academic',
    authorId: 'author',
    authorName: 'Author',
    content: overrides.content ?? 'Assistant Professor in Learning Analytics',
    category: overrides.category ?? 'job',
    tags: overrides.tags ?? ['learning-analytics'],
    urls: overrides.urls ?? [],
    dates: overrides.dates ?? [],
    createdAt: overrides.createdAt ?? '2026-06-01T12:00:00.000Z',
  };
}

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kels-store-'));
  store = new JsonStore(tempDir);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('JsonStore', () => {
  it('preserves older posts when saving a new post', async () => {
    await store.savePost(post({ id: 'old', createdAt: '2025-01-01T00:00:00.000Z' }));
    await store.savePost(post({ id: 'new', createdAt: '2026-06-01T00:00:00.000Z' }));

    const allPosts = await store.getAllPosts();
    expect(allPosts.map((item) => item.id)).toEqual(['new', 'old']);
  });

  it('reports category and channel stats', async () => {
    await store.savePost(post({ id: 'job', category: 'job', channelName: 'job_academic' }));
    await store.savePost(post({ id: 'cfp', category: 'cfp', channelName: 'cfp-rfp' }));

    const stats = await store.getStats();
    expect(stats.total).toBe(2);
    expect(stats.byCategory).toMatchObject({ jobs: 1, cfp: 1 });
    expect(stats.byChannel).toMatchObject({ job_academic: 1, 'cfp-rfp': 1 });
  });

  it('matches watcher keywords against indexed posts', async () => {
    await store.addWatch('user-1', 'learning analytics');

    const watchers = await store.matchingWatchers(post());
    expect(watchers).toEqual([{ userId: 'user-1', keywords: ['learning analytics'] }]);
  });

  it('manages profile topics and matches them against indexed posts', async () => {
    await store.addProfileTopic('user-1', 'learning analytics');
    await store.addProfileTopic('user-1', 'AIED');
    await store.removeProfileTopic('user-1', 'AIED');

    expect(await store.listProfileTopics('user-1')).toEqual(['learning analytics']);
    expect(await store.matchingProfiles(post())).toEqual([
      { userId: 'user-1', topics: ['learning analytics'] },
    ]);
  });

  it('returns upcoming deadlines sorted by ISO date', async () => {
    await store.savePost(post({
      id: 'later',
      category: 'cfp',
      content: 'CFP deadline November 30, 2026',
      deadlineDates: [{ label: 'November 30, 2026', iso: '2026-11-30' }],
    }));
    await store.savePost(post({
      id: 'soon',
      category: 'job',
      content: 'Review begins June 15, 2026',
      deadlineDates: [{ label: 'June 15, 2026', iso: '2026-06-15' }],
    }));

    const deadlines = await store.getUpcomingDeadlines({
      days: 365,
      now: new Date('2026-06-01T00:00:00.000Z'),
    });

    expect(deadlines.map((deadline) => deadline.post.id)).toEqual(['soon', 'later']);
  });

  it('returns only non-ended announcement events inside the reminder window', async () => {
    await store.savePost(post({
      id: 'past',
      channelName: 'announcement',
      category: 'event',
      content: 'Past event June 2, 2026 11:00 AM PT',
      eventDateTimes: [{
        label: 'June 2, 2026 11:00 AM PT',
        iso: '2026-06-02',
        startsAt: '2026-06-02T18:00:00.000Z',
        timeZone: 'America/Los_Angeles',
      }],
    }));
    await store.savePost(post({
      id: 'soon',
      channelName: 'announcement',
      category: 'event',
      content: 'Upcoming event June 2, 2026 12:30 PM PT',
      eventDateTimes: [{
        label: 'June 2, 2026 12:30 PM PT',
        iso: '2026-06-02',
        startsAt: '2026-06-02T19:30:00.000Z',
        timeZone: 'America/Los_Angeles',
      }],
    }));
    await store.savePost(post({
      id: 'later',
      channelName: 'announcement',
      category: 'event',
      content: 'Later event June 2, 2026 2:30 PM PT',
      eventDateTimes: [{
        label: 'June 2, 2026 2:30 PM PT',
        iso: '2026-06-02',
        startsAt: '2026-06-02T21:30:00.000Z',
        timeZone: 'America/Los_Angeles',
      }],
    }));

    const events = await store.getUpcomingEvents({
      minutes: 60,
      sourceChannels: ['announcement'],
      now: new Date('2026-06-02T19:00:00.000Z'),
    });

    expect(events.map((event) => event.post.id)).toEqual(['soon']);
  });

  it('returns D-1 events and recently ended events for automation', async () => {
    await store.savePost(post({
      id: 'tomorrow',
      channelName: 'announcement',
      category: 'event',
      content: 'D-1 event June 3, 2026 10:00 AM PT',
      eventDateTimes: [{
        label: 'June 3, 2026 10:00 AM PT',
        iso: '2026-06-03',
        startsAt: '2026-06-03T17:00:00.000Z',
        timeZone: 'America/Los_Angeles',
      }],
    }));
    await store.savePost(post({
      id: 'ended',
      channelName: 'announcement',
      category: 'event',
      content: 'Ended event June 2, 2026 10:00 AM PT',
      eventDateTimes: [{
        label: 'June 2, 2026 10:00 AM PT',
        iso: '2026-06-02',
        startsAt: '2026-06-02T17:00:00.000Z',
        timeZone: 'America/Los_Angeles',
      }],
    }));

    const d1 = await store.getEventsOnDay({
      daysFromNow: 1,
      sourceChannels: ['announcement'],
      now: new Date('2026-06-02T12:00:00.000Z'),
    });
    const followups = await store.getPastEventsNeedingFollowup({
      sourceChannels: ['announcement'],
      now: new Date('2026-06-02T18:00:00.000Z'),
      windowMinutes: 180,
    });

    expect(d1.map((event) => event.post.id)).toEqual(['tomorrow']);
    expect(followups.map((event) => event.post.id)).toEqual(['ended']);
  });
});
