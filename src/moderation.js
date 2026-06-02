const SCAM_PATTERNS = [
  /free\s+nitro/i,
  /discord(?:app)?\.com\/invite/i,
  /discord\.gg\//i,
  /\bairdrop\b/i,
  /\bcrypto\b/i,
  /\bwallet\b/i,
  /\btelegram\b/i,
  /무료\s*(코인|에어드랍|니트로)/i,
  /선착순.*무료/i,
];

const recentByAuthor = new Map();

export function detectSpam(message, config) {
  const text = getMessageText(message);
  if (!text.trim()) return null;

  const visibleText = getVisibleMessageText(message);
  const urls = visibleText.match(/https?:\/\/\S+/gi) ?? [];
  if (urls.length >= config.spamMaxUrls) {
    return `too many URLs (${urls.length})`;
  }

  const mentions = (message.mentions?.users?.size ?? 0) + (message.mentions?.roles?.size ?? 0);
  if (mentions >= config.spamMaxMentions) {
    return `too many mentions (${mentions})`;
  }

  if (SCAM_PATTERNS.some((pattern) => pattern.test(text))) {
    return 'known scam/spam phrase';
  }

  if (/(.)\1{24,}/.test(text)) {
    return 'repeated character flood';
  }

  const duplicateReason = duplicateBurst(message.author.id, text);
  if (duplicateReason) return duplicateReason;

  return null;
}

function duplicateBurst(authorId, text) {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 400);
  if (normalized.length < 12) return null;
  const now = Date.now();
  const entries = (recentByAuthor.get(authorId) ?? []).filter((entry) => now - entry.time < 120000);
  entries.push({ text: normalized, time: now });
  recentByAuthor.set(authorId, entries);
  const same = entries.filter((entry) => entry.text === normalized).length;
  return same >= 3 ? 'duplicate message burst' : null;
}

function getMessageText(message) {
  const parts = [message.content ?? ''];
  for (const embed of message.embeds ?? []) {
    parts.push(embed.title ?? '', embed.description ?? '', embed.url ?? '');
  }
  for (const attachment of message.attachments?.values?.() ?? []) {
    parts.push(attachment.name ?? '', attachment.url ?? '');
  }
  return parts.join('\n');
}

function getVisibleMessageText(message) {
  const parts = [message.content ?? ''];
  for (const embed of message.embeds ?? []) {
    parts.push(embed.title ?? '', embed.description ?? '', embed.url ?? '');
  }
  return parts.join('\n');
}
