import { describe, expect, it } from 'vitest';
import {
  buildVenueScout,
  parseFieldExplorerFile,
  parseFieldExplorerNetworkCsv,
  parseFieldExplorerTopics,
  parseFieldExplorerVenuesJson,
  rankFieldTopics,
  tokenize,
} from '../src/field-explorer.js';

const TOPICS_CSV = `Topic,Count,Name,Representation,Representative_Docs
0,25,0_learning_analytics_feedback,"['learning analytics', 'feedback', 'dashboard', 'students']","['Learning analytics dashboards support formative feedback.']"
1,18,1_ai_ethics_policy,"['ai ethics', 'policy', 'responsible ai', 'education']","['Responsible AI policy in education contexts.']"
-1,3,-1_outlier_misc,"['misc']","['Outlier']"`;

const NETWORK_CSV = `Name,Type,Category
Journal of the Learning Sciences,Journal,Learning sciences focused
International Journal of Computer-Supported Collaborative Learning,Journal,Learning sciences focused
LAK Conference,Conference,Learning Analytics
Journal of Learning Analytics,Journal,Learning Analytics
AIED Conference,Conference,AIED
International Journal of Artificial Intelligence in Education,Journal,AIED`;

const VENUES_JSON = JSON.stringify([
  {
    id: 'jls',
    name: 'Journal of the Learning Sciences',
    type: 'Journal',
    categories: ['Well-known', 'Learning Sciences'],
    impact: 'Q1',
  },
  {
    id: 'lak',
    name: 'LAK Conference',
    type: 'Conference',
    categories: ['Learning Analytics'],
    cfpDeadline: 'October',
  },
  {
    id: 'aied',
    name: 'AIED Conference',
    type: 'Conference',
    categories: ['AIED'],
    cfpDeadline: 'February',
  },
]);

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

  it('parses FieldExplorer network CSV into field categories', () => {
    const fields = parseFieldExplorerNetworkCsv(NETWORK_CSV);
    const learningSciences = fields.find((field) => field.name === 'Learning sciences focused');
    expect(fields).toHaveLength(3);
    expect(learningSciences).toMatchObject({
      id: 'Learning sciences focused',
      name: 'Learning sciences focused',
      count: 2,
      journals: [
        'International Journal of Computer-Supported Collaborative Learning',
        'Journal of the Learning Sciences',
      ],
    });
  });

  it('extracts embedded FieldExplorer csvData from a source file', () => {
    const fields = parseFieldExplorerFile(`const csvData = \`${NETWORK_CSV}\`;`);
    const ranked = rankFieldTopics('AIED journal and conference', fields);
    expect(ranked[0].name).toBe('AIED');
    expect(ranked[0].conferences).toEqual(['AIED Conference']);
  });

  it('parses FieldExplorer 1.0 venues.json into field categories', () => {
    const fields = parseFieldExplorerVenuesJson(VENUES_JSON);
    const learningAnalytics = fields.find((field) => field.name === 'Learning Analytics');
    expect(fields).toHaveLength(4);
    expect(learningAnalytics).toMatchObject({
      id: 'Learning Analytics',
      count: 1,
      conferences: ['LAK Conference (CFP: October)'],
      sourceType: 'fieldexplorer-venues-json',
    });
  });

  it('detects FieldExplorer 1.0 venues.json through the generic parser', () => {
    const fields = parseFieldExplorerFile(VENUES_JSON);
    const ranked = rankFieldTopics('AIED conference artificial intelligence education', fields);
    expect(ranked[0].name).toBe('AIED');
  });

  it('builds tiered venue-scout lanes from FieldExplorer categories', () => {
    const fields = parseFieldExplorerFile(VENUES_JSON);
    const scout = buildVenueScout('AIED learning analytics dashboard for teacher feedback', fields);
    expect(scout.weakFit).toBe(false);
    expect(scout.tiers[0]).toMatchObject({
      tier: 'Strong fit',
      topicName: 'AIED',
    });
    expect(scout.tiers[0].conferences).toContain('AIED Conference (CFP: February)');
  });
});
