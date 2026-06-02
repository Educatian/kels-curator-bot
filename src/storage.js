import fs from 'node:fs/promises';
import path from 'node:path';
import { extractDeadlineDates, extractEventDateTimes, postMatchesKeyword } from './extractors.js';

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2), 'utf8');
}

function cutoffIso(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

export class JsonStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.postsFile = path.join(dataDir, 'posts.json');
    this.watchFile = path.join(dataDir, 'watchlists.json');
    this.profilesFile = path.join(dataDir, 'profiles.json');
    this.chatbotLogsFile = path.join(dataDir, 'chatbot-logs.json');
    this.stateFile = path.join(dataDir, 'state.json');
  }

  async savePost(post) {
    const posts = await this.getAllPosts();
    const existingIndex = posts.findIndex((item) => item.id === post.id);
    if (existingIndex >= 0) {
      posts[existingIndex] = post;
    } else {
      posts.push(post);
    }
    posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    await writeJson(this.postsFile, posts.slice(0, 5000));
  }

  async getPosts({ category = 'all', days = 30, query = '' } = {}) {
    const posts = await this.getAllPosts();
    const minDate = cutoffIso(days);
    return posts.filter((post) => {
      const categoryOk = category === 'all' || mapCategory(post.category) === category || post.category === category;
      const dateOk = post.createdAt >= minDate;
      const queryOk = !query || postMatchesKeyword(post, query);
      return categoryOk && dateOk && queryOk;
    });
  }

  async addWatch(userId, keyword) {
    const normalized = keyword.trim();
    const watchlists = await readJson(this.watchFile, {});
    const current = new Set(watchlists[userId] ?? []);
    current.add(normalized);
    watchlists[userId] = Array.from(current).sort((a, b) => a.localeCompare(b));
    await writeJson(this.watchFile, watchlists);
    return watchlists[userId];
  }

  async removeWatch(userId, keyword) {
    const normalized = keyword.trim().toLowerCase();
    const watchlists = await readJson(this.watchFile, {});
    watchlists[userId] = (watchlists[userId] ?? []).filter((item) => item.toLowerCase() !== normalized);
    await writeJson(this.watchFile, watchlists);
    return watchlists[userId];
  }

  async listWatch(userId) {
    const watchlists = await readJson(this.watchFile, {});
    return watchlists[userId] ?? [];
  }

  async matchingWatchers(post) {
    const watchlists = await readJson(this.watchFile, {});
    return Object.entries(watchlists)
      .map(([userId, keywords]) => ({
        userId,
        keywords: keywords.filter((keyword) => postMatchesKeyword(post, keyword)),
      }))
      .filter((entry) => entry.keywords.length > 0);
  }

  async addProfileTopic(userId, topic) {
    const normalized = topic.trim();
    const profiles = await readJson(this.profilesFile, {});
    const current = new Set(profiles[userId] ?? []);
    current.add(normalized);
    profiles[userId] = Array.from(current).sort((a, b) => a.localeCompare(b));
    await writeJson(this.profilesFile, profiles);
    return profiles[userId];
  }

  async removeProfileTopic(userId, topic) {
    const normalized = topic.trim().toLowerCase();
    const profiles = await readJson(this.profilesFile, {});
    profiles[userId] = (profiles[userId] ?? []).filter((item) => item.toLowerCase() !== normalized);
    await writeJson(this.profilesFile, profiles);
    return profiles[userId];
  }

  async listProfileTopics(userId) {
    const profiles = await readJson(this.profilesFile, {});
    return profiles[userId] ?? [];
  }

  async matchingProfiles(post) {
    const profiles = await readJson(this.profilesFile, {});
    return Object.entries(profiles)
      .map(([userId, topics]) => ({
        userId,
        topics: topics.filter((topic) => postMatchesKeyword(post, topic)),
      }))
      .filter((entry) => entry.topics.length > 0);
  }

  async getAllPosts() {
    return readJson(this.postsFile, []);
  }

  async appendChatbotLog(log) {
    const logs = await readJson(this.chatbotLogsFile, []);
    logs.push(log);
    await writeJson(this.chatbotLogsFile, logs.slice(-2000));
    return log;
  }

  async getStats() {
    const posts = await this.getAllPosts();
    const byCategory = {};
    const byChannel = {};
    for (const post of posts) {
      const category = mapCategory(post.category);
      byCategory[category] = (byCategory[category] ?? 0) + 1;
      byChannel[post.channelName] = (byChannel[post.channelName] ?? 0) + 1;
    }
    return {
      total: posts.length,
      newest: posts[0]?.createdAt ?? null,
      oldest: posts.at(-1)?.createdAt ?? null,
      byCategory,
      byChannel,
    };
  }

  async getUpcomingDeadlines({ days = 60, category = 'all', now = new Date() } = {}) {
    const posts = await this.getAllPosts();
    const start = isoDay(now);
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + days);
    const end = isoDay(endDate);
    const deadlines = [];

    for (const post of posts) {
      const categoryOk = category === 'all' || mapCategory(post.category) === category || post.category === category;
      if (!categoryOk) continue;
      const postDeadlines = post.deadlineDates?.length
        ? post.deadlineDates
        : extractDeadlineDates(post.content ?? '', post.createdAt ? new Date(post.createdAt) : now);
      for (const deadline of postDeadlines) {
        if (deadline.iso >= start && deadline.iso <= end) {
          deadlines.push({ ...deadline, post });
        }
      }
    }

    return deadlines.sort((a, b) => a.iso.localeCompare(b.iso));
  }

  async getUpcomingEvents({ minutes = 60, sourceChannels = [], now = new Date(), timeZone = 'America/Los_Angeles' } = {}) {
    const posts = await this.getAllPosts();
    const startMs = new Date(now).getTime();
    const endMs = startMs + minutes * 60 * 1000;
    const channelKeys = new Set(sourceChannels.map((channel) => String(channel).toLowerCase()).filter(Boolean));
    const events = [];

    for (const post of posts) {
      if (channelKeys.size) {
        const channelName = String(post.channelName ?? '').toLowerCase();
        const channelId = String(post.channelId ?? '').toLowerCase();
        if (!channelKeys.has(channelName) && !channelKeys.has(channelId)) continue;
      }
      if (!['event', 'events', 'seminar', 'seminars'].includes(mapCategory(post.category))) continue;

      const postEvents = post.eventDateTimes?.length
        ? post.eventDateTimes
        : extractEventDateTimes(post.content ?? '', post.createdAt ? new Date(post.createdAt) : now, timeZone);
      for (const event of postEvents) {
        const eventMs = new Date(event.startsAt).getTime();
        if (Number.isNaN(eventMs)) continue;
        if (eventMs > startMs && eventMs <= endMs) {
          events.push({ ...event, post });
        }
      }
    }

    return events.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }

  async getEventsOnDay({ daysFromNow = 1, sourceChannels = [], now = new Date(), timeZone = 'America/Los_Angeles' } = {}) {
    const start = new Date(now);
    start.setDate(start.getDate() + daysFromNow);
    const targetIso = start.toISOString().slice(0, 10);
    const channelKeys = new Set(sourceChannels.map((channel) => String(channel).toLowerCase()).filter(Boolean));
    const events = [];

    for (const post of await this.getAllPosts()) {
      if (!postMatchesChannel(post, channelKeys)) continue;
      if (!['event', 'events', 'seminar', 'seminars'].includes(mapCategory(post.category))) continue;
      const postEvents = post.eventDateTimes?.length
        ? post.eventDateTimes
        : extractEventDateTimes(post.content ?? '', post.createdAt ? new Date(post.createdAt) : now, timeZone);
      for (const event of postEvents) {
        const eventMs = new Date(event.startsAt).getTime();
        if (Number.isNaN(eventMs) || eventMs <= new Date(now).getTime()) continue;
        if (event.iso === targetIso) events.push({ ...event, post });
      }
    }

    return events.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }

  async getPastEventsNeedingFollowup({ sourceChannels = [], now = new Date(), windowMinutes = 1440, timeZone = 'America/Los_Angeles' } = {}) {
    const nowMs = new Date(now).getTime();
    const startMs = nowMs - windowMinutes * 60 * 1000;
    const channelKeys = new Set(sourceChannels.map((channel) => String(channel).toLowerCase()).filter(Boolean));
    const events = [];

    for (const post of await this.getAllPosts()) {
      if (!postMatchesChannel(post, channelKeys)) continue;
      if (!['event', 'events', 'seminar', 'seminars'].includes(mapCategory(post.category))) continue;
      const postEvents = post.eventDateTimes?.length
        ? post.eventDateTimes
        : extractEventDateTimes(post.content ?? '', post.createdAt ? new Date(post.createdAt) : now, timeZone);
      for (const event of postEvents) {
        const eventMs = new Date(event.startsAt).getTime();
        if (Number.isNaN(eventMs)) continue;
        if (eventMs > startMs && eventMs <= nowMs) events.push({ ...event, post });
      }
    }

    return events.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }

  async getState() {
    return readJson(this.stateFile, {});
  }

  async setStateValue(key, value) {
    const state = await this.getState();
    state[key] = value;
    await writeJson(this.stateFile, state);
    return state;
  }
}

function postMatchesChannel(post, channelKeys) {
  if (!channelKeys.size) return true;
  const channelName = String(post.channelName ?? '').toLowerCase();
  const channelId = String(post.channelId ?? '').toLowerCase();
  return channelKeys.has(channelName) || channelKeys.has(channelId);
}

export function mapCategory(category) {
  if (category === 'job') return 'jobs';
  if (category === 'seminar') return 'seminars';
  if (category === 'resource') return 'resources';
  if (category === 'event') return 'events';
  return category;
}

function isoDay(date) {
  return new Date(date).toISOString().slice(0, 10);
}
