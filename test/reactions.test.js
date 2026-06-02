import { describe, expect, it } from 'vitest';
import { normalizeEmojiName, resolveReactionTarget, resolveReactionTargets } from '../src/reactions.js';

describe('reaction helpers', () => {
  it('normalizes Discord emoji names for matching', () => {
    expect(normalizeEmojiName('KELS_Logo')).toBe('kelslogo');
  });

  it('resolves KELS to a matching custom guild emoji', () => {
    const emojis = [
      { id: '100', name: 'study' },
      { id: '200', name: 'kels_logo' },
    ];

    expect(resolveReactionTarget('KELS', emojis)).toBe('200');
  });

  it('resolves KELS to the server logo emoji when that is the custom name', () => {
    const emojis = [{ id: '300', name: 'Logo' }];

    expect(resolveReactionTarget('KELS', emojis)).toBe('300');
  });

  it('keeps unicode emoji reactions and deduplicates targets', () => {
    const emojis = [{ id: '200', name: 'kels' }];

    expect(resolveReactionTargets(['KELS', '👍', 'kels'], emojis)).toEqual(['200', '👍']);
  });

  it('extracts custom emoji ids from Discord emoji literals', () => {
    expect(resolveReactionTarget('<:kels:1234567890>', [])).toBe('1234567890');
  });

  it('accepts custom emoji IDs directly', () => {
    expect(resolveReactionTarget('1121048577255424093', [])).toBe('1121048577255424093');
  });

  it('matches custom emoji IDs against guild emoji metadata', () => {
    const emojis = [{ id: '1121048577255424093', name: 'Logo' }];

    expect(resolveReactionTarget('1121048577255424093', emojis)).toBe('1121048577255424093');
  });

  it('does not treat unresolved plain words as reaction targets', () => {
    expect(resolveReactionTarget('unknown-role-name', [])).toBeNull();
  });
});
