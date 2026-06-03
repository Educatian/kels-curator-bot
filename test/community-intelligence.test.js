import { describe, expect, it } from 'vitest';
import {
  buildCommunityGraph,
  buildCurationFeedback,
  suggestProfileTopics,
} from '../src/community-intelligence.js';
import { parseFieldExplorerFile } from '../src/field-explorer.js';

const FIELD_TOPICS = parseFieldExplorerFile(JSON.stringify([
  {
    id: 'aied',
    name: 'AIED Conference',
    type: 'Conference',
    categories: ['AIED'],
  },
  {
    id: 'jla',
    name: 'Journal of Learning Analytics',
    type: 'Journal',
    categories: ['Learning Analytics'],
  },
]));

const POSTS = [
  {
    id: 'p1',
    guildId: 'g1',
    channelId: 'c1',
    channelName: 'academic-resources',
    authorId: 'u1',
    authorName: 'alice',
    content: 'AIED learning analytics dashboard for teacher feedback',
    createdAt: new Date().toISOString(),
    tags: ['aied'],
  },
  {
    id: 'p2',
    guildId: 'g1',
    channelId: 'c2',
    channelName: 'cfp-rfp',
    authorId: 'u2',
    authorName: 'bob',
    content: 'Call for papers about learning analytics and dashboards',
    createdAt: new Date().toISOString(),
    tags: ['cfp'],
  },
];

const LOGS = [
  {
    eventType: 'slash-command',
    userId: 'u1',
    userName: 'alice',
    commandName: 'venue-scout',
    query: 'AIED learning analytics dashboard',
    channelName: 'general',
    createdAt: new Date().toISOString(),
  },
  {
    eventType: 'reaction-add',
    userId: 'u3',
    userName: 'carol',
    query: '👍',
    channelName: 'academic-resources',
    createdAt: new Date().toISOString(),
    metadata: {
      messageId: 'p1',
      emoji: '👍',
    },
  },
];

describe('community intelligence', () => {
  it('builds graph nodes and edges from posts and logs', () => {
    const graph = buildCommunityGraph({ posts: POSTS, logs: LOGS, fieldTopics: FIELD_TOPICS });
    expect(graph.summary.nodeCount).toBeGreaterThan(0);
    expect(graph.summary.edgeTypes.some((item) => item.name === 'reacted')).toBe(true);
    expect(graph.summary.edgeTypes.some((item) => item.name === 'used_command')).toBe(true);
  });

  it('computes curation feedback from reactions and slash demand', () => {
    const feedback = buildCurationFeedback({ posts: POSTS, logs: LOGS, fieldTopics: FIELD_TOPICS });
    expect(feedback.commandUsage[0]).toMatchObject({ name: 'venue-scout', count: 1 });
    expect(feedback.topPosts[0].post.id).toBe('p1');
    expect(feedback.topicSignals.length).toBeGreaterThan(0);
  });

  it('suggests personal profile topics from user activity', () => {
    const suggestions = suggestProfileTopics({
      userId: 'u1',
      posts: POSTS,
      logs: LOGS,
      fieldTopics: FIELD_TOPICS,
    });
    expect(suggestions.evidenceCount).toBeGreaterThan(0);
    expect(suggestions.suggestions.map((item) => item.topic)).toContain('AIED');
  });
});
