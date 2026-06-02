const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'authorization,content-type',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return json({ ok: true });
    }

    if (url.pathname === '/health') {
      return json({ ok: true, service: 'kels-bot-logs' });
    }

    if (url.pathname === '/logs' && request.method === 'POST') {
      if (!authorized(request, env)) return json({ ok: false, error: 'unauthorized' }, 401);
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== 'object') return json({ ok: false, error: 'invalid_json' }, 400);
      const log = normalizeLog(body);
      await insertLog(env.DB, log);
      return json({ ok: true, id: log.id });
    }

    if (url.pathname === '/logs/recent' && request.method === 'GET') {
      if (!authorized(request, env)) return json({ ok: false, error: 'unauthorized' }, 401);
      const limit = Math.min(Number.parseInt(url.searchParams.get('limit') ?? '25', 10) || 25, 100);
      const result = await env.DB.prepare(
        'SELECT * FROM chatbot_logs ORDER BY created_at DESC LIMIT ?',
      ).bind(limit).all();
      return json({ ok: true, logs: result.results ?? [] });
    }

    return json({ ok: false, error: 'not_found' }, 404);
  },
};

function authorized(request, env) {
  const expected = env.LOG_TOKEN;
  if (!expected) return false;
  const header = request.headers.get('authorization') ?? '';
  return header === `Bearer ${expected}`;
}

function normalizeLog(body) {
  const now = new Date().toISOString();
  return {
    id: clean(body.id) || crypto.randomUUID(),
    created_at: clean(body.createdAt) || now,
    event_type: clean(body.eventType) || 'unknown',
    guild_id: clean(body.guildId),
    channel_id: clean(body.channelId),
    channel_name: clean(body.channelName),
    user_id: clean(body.userId),
    user_name: clean(body.userName),
    command_name: clean(body.commandName),
    query: clean(body.query, 1200),
    prompt_excerpt: clean(body.promptExcerpt, 2000),
    response_excerpt: clean(body.responseExcerpt, 2000),
    metadata_json: JSON.stringify(body.metadata ?? {}),
  };
}

async function insertLog(db, log) {
  await db.prepare(`
    INSERT INTO chatbot_logs (
      id, created_at, event_type, guild_id, channel_id, channel_name,
      user_id, user_name, command_name, query, prompt_excerpt,
      response_excerpt, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    log.id,
    log.created_at,
    log.event_type,
    log.guild_id,
    log.channel_id,
    log.channel_name,
    log.user_id,
    log.user_name,
    log.command_name,
    log.query,
    log.prompt_excerpt,
    log.response_excerpt,
    log.metadata_json,
  ).run();
}

function clean(value, max = 500) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}
