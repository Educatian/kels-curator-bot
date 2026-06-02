import { describe, expect, it } from 'vitest';
import {
  buildOnboardingFollowupMessage,
  buildOnboardingPathway,
  formatOnboardingPathway,
} from '../src/onboarding-pathway.js';

const posts = [
  {
    id: '1',
    guildId: 'g',
    channelId: 'c1',
    channelName: 'academic-resources',
    category: 'resource',
    tags: ['AIED'],
    content: 'AIED resource about learning analytics and formative feedback',
    createdAt: '2026-06-01T00:00:00.000Z',
  },
  {
    id: '2',
    guildId: 'g',
    channelId: 'c2',
    channelName: 'cfp-rfp',
    category: 'cfp',
    tags: ['learning-analytics'],
    content: 'CFP for learning analytics and AI feedback research',
    createdAt: '2026-05-20T00:00:00.000Z',
  },
];

describe('onboarding pathway', () => {
  it('builds participation targets and first-comment drafts', () => {
    const pathway = buildOnboardingPathway({
      profile: {
        interests: ['AIED', 'learning analytics'],
        lookingFor: ['CFP'],
      },
      posts,
    });

    expect(pathway.participationTargets).toHaveLength(2);
    expect(pathway.firstCommentDrafts[0]).toContain('#');
    expect(pathway.followUpPrompt).toContain('AIED');
  });

  it('formats pathway and follow-up messages', () => {
    const pathway = buildOnboardingPathway({
      profile: { interests: ['AIED'] },
      posts,
    });

    expect(formatOnboardingPathway(pathway)).toContain('첫 댓글 draft');
    expect(buildOnboardingFollowupMessage({
      fullName: 'Jane Doe',
      interests: ['AIED'],
    }, pathway)).toContain('Jane Doe');
  });
});
