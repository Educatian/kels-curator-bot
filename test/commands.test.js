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
      'submit-cfp',
      'backfill',
      'stats',
      'health',
      'post-digest',
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

    expect(backfill.default_member_permissions).toBe('32');
    expect(stats.default_member_permissions).toBe('32');
    expect(health.default_member_permissions).toBe('32');
    expect(postDigest.default_member_permissions).toBe('32');
  });
});
