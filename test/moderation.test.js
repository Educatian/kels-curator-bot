import { describe, expect, it } from 'vitest';
import { detectSpam } from '../src/moderation.js';

const config = { spamMaxUrls: 4, spamMaxMentions: 8 };

function message(content, overrides = {}) {
  return {
    content,
    author: { id: overrides.authorId ?? 'user-1' },
    mentions: {
      users: { size: overrides.userMentions ?? 0 },
      roles: { size: overrides.roleMentions ?? 0 },
      everyone: Boolean(overrides.everyone),
    },
    embeds: [],
    attachments: new Map(),
  };
}

describe('spam moderation', () => {
  it('detects obvious scam phrases', () => {
    expect(detectSpam(message('Free nitro for everyone https://bad.example'), config)).toBe('known scam/spam phrase');
  });

  it('detects excessive URLs', () => {
    expect(detectSpam(message('https://a.test https://b.test https://c.test https://d.test'), config)).toBe('too many URLs (4)');
  });

  it('detects mention floods', () => {
    expect(detectSpam(message('hello', { userMentions: 8 }), config)).toBe('too many mentions (8)');
  });
});
