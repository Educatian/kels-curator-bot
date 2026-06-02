import { describe, expect, it } from 'vitest';
import {
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

  it('builds a compact recommendation reason', () => {
    expect(buildRecommendationReason({
      isOpenAccess: true,
      publicationDate: '2026-05-20',
      source: 'Instructional Science',
    })).toContain('Instructional Science');
  });
});
