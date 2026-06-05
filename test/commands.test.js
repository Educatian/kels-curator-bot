import { describe, expect, it } from 'vitest';
import { buildCommands } from '../src/commands.js';

describe('slash commands', () => {
  it('builds the expected command set', () => {
    const payload = buildCommands().map((command) => command.toJSON());
    expect(payload.map((command) => command.name)).toEqual([
      'digest',
      'search',
      'watch',
      'profile',
      'ask-kels',
      'cfp-helper',
      'topic-digest',
      'field-map',
      'venue-scout',
      'review',
      'add-venue',
      'field-pulse',
      'profile-suggest',
      'learning-path',
      'weekly-challenge',
      'reflect',
      'ask-better',
      'paper-coach',
      'anon-submit',
      'submit-cfp',
      'backfill',
      'stats',
      'health',
      'post-digest',
      'post-field-pulse',
      'community-graph',
      'curation-feedback',
      'peer-learning',
      'deadlines',
      'help-kels',
    ]);
  });

  it('restricts moderator-only commands', () => {
    const payload = buildCommands().map((command) => command.toJSON());
    const backfill = payload.find((command) => command.name === 'backfill');
    const stats = payload.find((command) => command.name === 'stats');
    const health = payload.find((command) => command.name === 'health');
    const postDigest = payload.find((command) => command.name === 'post-digest');
    const postFieldPulse = payload.find((command) => command.name === 'post-field-pulse');
    const communityGraph = payload.find((command) => command.name === 'community-graph');
    const curationFeedback = payload.find((command) => command.name === 'curation-feedback');
    const peerLearning = payload.find((command) => command.name === 'peer-learning');

    expect(backfill.default_member_permissions).toBe('32');
    expect(stats.default_member_permissions).toBe('32');
    expect(health.default_member_permissions).toBe('32');
    expect(postDigest.default_member_permissions).toBe('32');
    expect(postFieldPulse.default_member_permissions).toBe('32');
    expect(communityGraph.default_member_permissions).toBe('32');
    expect(curationFeedback.default_member_permissions).toBe('32');
    expect(peerLearning.default_member_permissions).toBe('32');
  });
});
