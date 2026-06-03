import { describe, expect, it } from 'vitest';
import {
  articleVotingScorecard,
  buildRecommendationReason,
  normalizeOpenAlexWork,
  selectWeeklyArticle,
} from '../src/openalex.js';

describe('OpenAlex article recommendations', () => {
  it('normalizes OpenAlex works into Discord-ready article records', () => {
    const article = normalizeOpenAlexWork({
      id: 'https://openalex.org/W1',
      display_name: 'Learning With AI Partners',
      publication_date: '2026-05-15',
      cited_by_count: 7,
      primary_location: {
        landing_page_url: 'https://example.org/article',
        source: { display_name: 'Journal of the Learning Sciences' },
      },
      open_access: { is_oa: true },
      authorships: [
        { author: { display_name: 'Ada Lovelace' } },
        { author: { display_name: 'Grace Hopper' } },
        { author: { display_name: 'Katherine Johnson' } },
        { author: { display_name: 'Alan Kay' } },
      ],
      abstract_inverted_index: {
        This: [0],
        study: [1],
        examines: [2],
        collaboration: [3],
      },
    });

    expect(article).toMatchObject({
      id: 'https://openalex.org/W1',
      title: 'Learning With AI Partners',
      publicationDate: '2026-05-15',
      source: 'Journal of the Learning Sciences',
      url: 'https://example.org/article',
      isOpenAccess: true,
      authors: ['Ada Lovelace', 'Grace Hopper', 'Katherine Johnson', 'et al.'],
      abstract: 'This study examines collaboration',
    });
  });

  it('selects one fresh article from the journal pool', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const candidates = [
      {
        id: 'old',
        title: 'Older Article',
        publicationDate: '2025-01-01',
        citedByCount: 50,
        isOpenAccess: false,
      },
      {
        id: 'fresh',
        title: 'Fresh Article',
        publicationDate: '2026-05-20',
        citedByCount: 1,
        isOpenAccess: true,
      },
    ];

    expect(selectWeeklyArticle(candidates, [], now).id).toBe('fresh');
    expect(selectWeeklyArticle(candidates, ['fresh'], now).id).toBe('old');
  });

  it('uses RAG voting signals when archive interests match a candidate', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const candidates = [
      {
        id: 'generic',
        title: 'General Classroom Study',
        abstract: 'A recent classroom study.',
        publicationDate: '2026-05-28',
        citedByCount: 1,
        isOpenAccess: false,
        source: 'Instructional Science',
      },
      {
        id: 'archive-match',
        title: 'Learning Analytics Feedback and AIED Collaboration',
        abstract: 'This mixed methods study uses trace data and interviews to examine feedback and collaboration.',
        publicationDate: '2026-04-15',
        citedByCount: 2,
        isOpenAccess: true,
        source: 'Journal of the Learning Sciences',
      },
    ];
    const archivePosts = [
      {
        content: 'KELS members are discussing AIED, learning analytics, feedback, trace data, and collaboration.',
        channelName: 'academic-resources',
        category: 'resource',
        tags: ['AIED', 'learning analytics'],
      },
    ];

    const selected = selectWeeklyArticle(candidates, [], now, { archivePosts });
    const scorecard = articleVotingScorecard(selected, now, archivePosts);

    expect(selected.id).toBe('archive-match');
    expect(selected.curationVotes.archiveInterest).toBeGreaterThan(0);
    expect(scorecard.methodDiversity).toBeGreaterThan(3);
  });

  it('builds a compact recommendation reason', () => {
    expect(buildRecommendationReason({
      isOpenAccess: true,
      publicationDate: '2026-05-20',
      source: 'Instructional Science',
    })).toContain('Instructional Science');
  });
});
