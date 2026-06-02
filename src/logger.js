export function createChatLogger(config, store, fetchImpl = fetch) {
  const enabled = Boolean(config.chatbotLoggingEnabled);

  return {
    async log(entry) {
      const log = normalizeLog(entry);
      await store.appendChatbotLog(log).catch((error) => {
        console.warn(`Failed to write local chatbot log: ${error.message}`);
      });

      if (!enabled || !config.logWebhookUrl || !config.logWebhookToken) return;
      await fetchImpl(config.logWebhookUrl, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.logWebhookToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(log),
      }).catch((error) => {
        console.warn(`Failed to send Cloudflare chatbot log: ${error.message}`);
      });
    },
  };
}

function normalizeLog(entry) {
  return {
    id: entry.id ?? crypto.randomUUID(),
    createdAt: entry.createdAt ?? new Date().toISOString(),
    eventType: entry.eventType ?? 'unknown',
    guildId: entry.guildId ?? '',
    channelId: entry.channelId ?? '',
    channelName: entry.channelName ?? '',
    userId: entry.userId ?? '',
    userName: entry.userName ?? '',
    commandName: entry.commandName ?? '',
    query: truncate(entry.query ?? '', 1200),
    promptExcerpt: truncate(entry.promptExcerpt ?? '', 2000),
    responseExcerpt: truncate(entry.responseExcerpt ?? '', 2000),
    metadata: entry.metadata ?? {},
  };
}

function truncate(value, max) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length <= max ? text : `${text.slice(0, max - 3).trim()}...`;
}
