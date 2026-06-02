import { describe, expect, it } from 'vitest';
import { buildConnectionSuggestions, formatConnectionSuggestions } from '../src/connections.js';

const posts = [
  {
    id: '1',
    guildId: 'g',
    channelId: 'c1',
    channelName: 'academic-resources',
    category: 'resource',
    tags: ['learning-analytics'],
    content: 'Learning analytics dashboard resource for formative feedback',
    createdAt: '2026-06-01T00:00:00.000Z',
  },
  {
    id: '2',
    guildId: 'g',
    channelId: 'c2',
    channelName: 'cfp-rfp',
    category: 'cfp',
    tags: ['AIED'],
    content: 'AIED CFP about learning analytics and feedback',
    createdAt: '2026-05-20T00:00:00.000Z',
  },
];

describe('member connection suggestions', () => {
  it('links profile topics to related original posts', () => {
    const suggestions = buildConnectionSuggestions({
      topics: ['learning analytics', 'feedback'],
      posts,
    });

    expect(suggestions.originals).toHaveLength(2);
    expect(suggestions.originals[0].url).toBe('https://discord.com/channels/g/c1/1');
    expect(suggestions.prompt).toContain('#academic-resources');
  });

  it('formats empty suggestions without pretending evidence exists', () => {
    const formatted = formatConnectionSuggestions(buildConnectionSuggestions({
      topics: ['ethics'],
      posts,
    }));

    expect(formatted).toContain('관심사 연결');
    expect(formatted).toContain('아직');
  });
});
