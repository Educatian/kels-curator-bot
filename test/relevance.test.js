import { describe, expect, it } from 'vitest';
import { inferArchiveFilters, rankPostsForQuery, relatedOriginals } from '../src/relevance.js';

describe('archive relevance helpers', () => {
  it('infers common KELS archive filters from Korean queries', () => {
    expect(inferArchiveFilters('최근 AIED CFP만 보여줘', 'all')).toMatchObject({
      category: 'cfp',
      days: 120,
    });
    expect(inferArchiveFilters('교수 채용 learning sciences', 'all')).toMatchObject({
      category: 'jobs',
    });
  });

  it('ranks posts by query overlap and formats related originals', () => {
    const posts = [
      {
        id: '1',
        guildId: 'g',
        channelId: 'c',
        channelName: 'cfp-rfp',
        category: 'cfp',
        tags: ['AIED'],
        content: 'AIED special issue CFP about learning analytics',
        createdAt: '2026-06-01T00:00:00Z',
      },
      {
        id: '2',
        guildId: 'g',
        channelId: 'c2',
        channelName: 'general',
        category: 'general',
        tags: [],
        content: 'Coffee chat',
        createdAt: '2026-06-02T00:00:00Z',
      },
    ];

    const ranked = rankPostsForQuery('AIED CFP learning analytics', posts);
    expect(ranked[0].id).toBe('1');
    expect(relatedOriginals(ranked)).toEqual([
      expect.objectContaining({ channelName: 'cfp-rfp', url: 'https://discord.com/channels/g/c/1' }),
    ]);
  });
});
