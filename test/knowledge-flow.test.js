import { describe, expect, it } from 'vitest';
import { buildKnowledgeFlow, buildParticipationNudge } from '../src/knowledge-flow.js';

function post(overrides = {}) {
  return {
    id: overrides.id ?? '1',
    guildId: 'g',
    channelId: overrides.channelId ?? 'c',
    channelName: overrides.channelName ?? 'academic-resources',
    category: overrides.category ?? 'resource',
    tags: overrides.tags ?? [],
    content: overrides.content ?? 'Learning analytics resource for AI feedback',
    createdAt: overrides.createdAt ?? '2026-06-01T00:00:00.000Z',
  };
}

describe('knowledge flow', () => {
  it('builds topic, bridge, and participation signals from posts', () => {
    const flow = buildKnowledgeFlow([
      post({
        id: 'a',
        category: 'resource',
        channelName: 'academic-resources',
        tags: ['learning-analytics'],
        content: 'Learning analytics dataset for AI feedback research',
      }),
      post({
        id: 'b',
        category: 'cfp',
        channelName: 'cfp-rfp',
        tags: ['AIED'],
        content: 'AIED special issue CFP about learning analytics and feedback',
      }),
    ]);

    expect(flow.totalPosts).toBe(2);
    expect(flow.topics.map((topic) => topic.topic)).toEqual(expect.arrayContaining(['learning-analytics', 'AIED']));
    expect(flow.bridgeOpportunities.some((item) => item.topic === 'learning-analytics')).toBe(true);
    expect(flow.participationPrompts.length).toBeGreaterThan(0);
    expect(flow.evidencePosts[0]).toHaveProperty('post');
  });

  it('builds a short participation nudge', () => {
    expect(buildParticipationNudge({
      title: 'RAG tutors for formative feedback',
      issueTopic: 'RAG tutor를 수업 피드백에 적용할 때 무엇을 먼저 검증해야 하는가?',
    })).toContain('댓글로');
  });
});
