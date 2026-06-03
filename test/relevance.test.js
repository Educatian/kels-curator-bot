import { describe, expect, it } from 'vitest';
import {
  archiveEvidenceStatus,
  formatArchiveEvidencePanel,
  inferArchiveFilters,
  rankPostsForQuery,
  relatedOriginals,
} from '../src/relevance.js';

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

  it('formats archive Q&A confidence with source metadata', () => {
    const ranked = [
      {
        id: '1',
        guildId: 'g',
        channelId: 'c',
        channelName: 'academic-resources',
        content: 'AIED resource',
        createdAt: '2026-06-01T00:00:00Z',
        relevance: 5,
      },
      {
        id: '2',
        guildId: 'g',
        channelId: 'jobs',
        channelName: 'job_academic',
        content: 'AIED job',
        createdAt: '2026-06-02T00:00:00Z',
        relevance: 3,
      },
    ];
    const status = archiveEvidenceStatus(ranked);
    const panel = formatArchiveEvidencePanel(relatedOriginals(ranked), status);

    expect(status).toMatchObject({ label: '근거 충분', confidence: '높음' });
    expect(panel).toContain('Archive Q&A 신뢰도');
    expect(panel).toContain('#academic-resources');
    expect(panel).toContain('관련도 5');
  });

  it('marks weak archive evidence explicitly', () => {
    const status = archiveEvidenceStatus([], { weakEvidence: true });
    const panel = formatArchiveEvidencePanel([], status);

    expect(status.label).toBe('근거 부족');
    expect(panel).toContain('표시할 만큼 직접적인 원문이 없습니다');
  });
});
