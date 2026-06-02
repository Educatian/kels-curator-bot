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
    attachments: overrides.attachments ?? new Map(),
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

  it('does not treat @everyone alone as spam', () => {
    expect(detectSpam(message('@everyone seminar reminder tomorrow', { everyone: true }), config)).toBeNull();
  });

  it('does not count attachment URLs as visible URL spam', () => {
    const attachments = new Map([
      ['1', { name: 'a.png', url: 'https://cdn.discordapp.com/a.png' }],
      ['2', { name: 'b.png', url: 'https://cdn.discordapp.com/b.png' }],
      ['3', { name: 'c.png', url: 'https://cdn.discordapp.com/c.png' }],
      ['4', { name: 'd.png', url: 'https://cdn.discordapp.com/d.png' }],
    ]);
    expect(detectSpam(message('Project share https://project.example', { attachments }), config)).toBeNull();
  });
});
