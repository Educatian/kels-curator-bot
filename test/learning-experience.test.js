import { describe, expect, it } from 'vitest';
import {
  buildBetterQuestion,
  buildLearningPathway,
  buildMicroChallenge,
  buildPaperCoach,
  buildPeerLearningMatch,
  buildReflectionGuide,
} from '../src/learning-experience.js';
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
    channelName: 'academic-resources',
    authorId: 'u1',
    authorName: 'alice',
    content: 'AIED learning analytics dashboard for teacher feedback',
    createdAt: new Date().toISOString(),
  },
];

const LOGS = [
  {
    eventType: 'slash-command',
    commandName: 'ask-better',
    userId: 'u2',
    userName: 'bob',
    query: 'AIED teacher feedback dashboard',
    channelName: 'general',
    createdAt: new Date().toISOString(),
  },
];

describe('learning experience scaffolds', () => {
  it('builds a stage-based pathway', () => {
    const pathway = buildLearningPathway({
      stage: 'phd',
      interests: 'AIED learning analytics',
      posts: POSTS,
      logs: LOGS,
      fieldTopics: FIELD_TOPICS,
    });
    expect(pathway.label).toContain('PhD');
    expect(pathway.tasks).toHaveLength(3);
    expect(pathway.fieldMatches[0].name).toBe('AIED');
  });

  it('builds a weekly challenge', () => {
    const challenge = buildMicroChallenge({ focus: 'paper', posts: POSTS, fieldTopics: FIELD_TOPICS });
    expect(challenge.title).toContain('Paper');
    expect(challenge.reflection.length).toBeGreaterThan(0);
  });

  it('builds reflection prompts', () => {
    const guide = buildReflectionGuide({
      item: 'AIED learning analytics paper',
      kind: 'paper',
      fieldTopics: FIELD_TOPICS,
    });
    expect(guide.prompts.length).toBeGreaterThan(3);
    expect(guide.threadDraft).toContain('reflecting');
  });

  it('builds peer learning matches', () => {
    const match = buildPeerLearningMatch({
      topic: 'AIED teacher feedback',
      posts: POSTS,
      logs: LOGS,
      fieldTopics: FIELD_TOPICS,
    });
    expect(match.candidates.length).toBeGreaterThan(0);
  });

  it('sharpens broad questions', () => {
    const result = buildBetterQuestion({
      question: 'How can AI feedback help students?',
      fieldTopics: FIELD_TOPICS,
    });
    expect(result.improvedQuestions).toHaveLength(3);
    expect(result.threadDraft).toContain('sharpen');
  });

  it('builds a paper reading coach', () => {
    const coach = buildPaperCoach({
      text: 'AIED learning analytics dashboard paper',
      level: 'advanced',
      fieldTopics: FIELD_TOPICS,
    });
    expect(coach.readingOrder.length).toBeGreaterThan(3);
    expect(coach.level).toBe('advanced');
  });
});
