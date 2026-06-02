const CUSTOM_EMOJI_RE = /^<a?:[^:]+:(\d+)>$/;
const EMOJI_ID_RE = /^\d{15,25}$/;

export function normalizeEmojiName(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function resolveReactionTargets(tokens, guildEmojis = []) {
  const targets = [];
  for (const token of tokens ?? []) {
    const target = resolveReactionTarget(token, guildEmojis);
    if (target && !targets.includes(target)) {
      targets.push(target);
    }
  }
  return targets;
}

export function resolveReactionTarget(token, guildEmojis = []) {
  const raw = String(token ?? '').trim();
  if (!raw) return null;

  const literalCustom = raw.match(CUSTOM_EMOJI_RE);
  if (literalCustom) return literalCustom[1];

  const custom = findCustomEmoji(raw, guildEmojis);
  if (custom) return custom.id ?? custom.identifier ?? raw;

  if (EMOJI_ID_RE.test(raw)) return raw;
  if (looksLikePlainName(raw)) return null;
  return raw;
}

function findCustomEmoji(token, guildEmojis) {
  const emojis = Array.from(guildEmojis?.values?.() ?? guildEmojis ?? []);
  const normalizedToken = normalizeEmojiName(token);
  if (!normalizedToken) return null;

  const byId = emojis.find((emoji) => emoji.id === token);
  if (byId) return byId;

  const exact = emojis.find((emoji) => normalizeEmojiName(emoji.name) === normalizedToken);
  if (exact) return exact;

  if (normalizedToken === 'kels') {
    return emojis.find((emoji) => {
      const name = normalizeEmojiName(emoji.name);
      return name.includes('kels') || name === 'logo' || name.includes('kelslogo');
    }) ?? null;
  }

  return null;
}

function looksLikePlainName(value) {
  return /^[\p{Letter}\p{Number}_ -]+$/u.test(value);
}
