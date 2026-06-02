import { describe, expect, it } from 'vitest';
import { parseFieldExplorerTopics, rankFieldTopics, tokenize } from '../src/field-explorer.js';

const TOPICS_CSV = `Topic,Count,Name,Representation,Representative_Docs
0,25,0_learning_analytics_feedback,"['learning analytics', 'feedback', 'dashboard', 'students']","['Learning analytics dashboards support formative feedback.']"
1,18,1_ai_ethics_policy,"['ai ethics', 'policy', 'responsible ai', 'education']","['Responsible AI policy in education contexts.']"
-1,3,-1_outlier_misc,"['misc']","['Outlier']"`;

describe('field explorer helpers', () => {
  it('parses field explorer topic CSV and excludes outliers', () => {
    const topics = parseFieldExplorerTopics(TOPICS_CSV);
    expect(topics).toHaveLength(2);
    expect(topics[0]).toMatchObject({
      id: 0,
      count: 25,
      name: 'learning analytics feedback',
      keywords: ['learning analytics', 'feedback', 'dashboard', 'students'],
    });
  });

  it('ranks topics by phrase and token overlap', () => {
    const topics = parseFieldExplorerTopics(TOPICS_CSV);
    const ranked = rankFieldTopics('responsible AI ethics policy for education', topics);
    expect(ranked[0].id).toBe(1);
    expect(ranked[0].score).toBeGreaterThan(0);
  });

  it('tokenizes research text without common filler words', () => {
    expect(tokenize('This study is about KELS learning analytics dashboards')).toEqual([
      'analytics',
      'dashboards',
    ]);
  });
});
