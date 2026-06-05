// FieldExplorer live CFP bridge.
//
// Reads VERIFIED call-for-papers records from the FieldExplorer Supabase
// (`cfp_verifications`) so the bot can surface real, provenance-tagged deadlines
// (source URL + verified date + D-day) instead of guesses. Read-only.
//
// All formatting is pure and unit-tested; the network fetch takes an injectable
// fetch implementation so it can be tested without hitting Supabase.

const DAY_MS = 24 * 60 * 60 * 1000;

export function computeDaysUntil(deadline, now = new Date()) {
  if (!deadline) return null;
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return null;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

export function dDayLabel(daysUntil) {
  if (daysUntil === null) return '날짜 미확인';
  if (daysUntil === 0) return 'D-DAY';
  if (daysUntil > 0) return `D-${daysUntil}`;
  return `${Math.abs(daysUntil)}일 지남`;
}

function tokens(text) {
  return (text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

/** Filter verified CFP rows whose venue name overlaps the query. */
export function matchCfpForQuery(rows, query, { limit = 5 } = {}) {
  const q = new Set(tokens(query));
  if (q.size === 0) return [];
  const scored = [];
  for (const row of rows ?? []) {
    const name = row.venue_name ?? '';
    const nameTokens = new Set(tokens(name));
    let overlap = 0;
    for (const t of nameTokens) if (q.has(t)) overlap += 1;
    // also catch substring (e.g. "AIED" within "AIED Conference")
    const sub = q.has(name.toLowerCase()) || [...q].some((t) => name.toLowerCase().includes(t) && t.length > 3);
    if (overlap > 0 || sub) scored.push({ row, overlap: overlap + (sub ? 0.5 : 0) });
  }
  return scored
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, limit)
    .map((s) => s.row);
}

/** Verified CFP rows sorted by soonest upcoming deadline (passed ones last). */
export function upcomingCfp(rows, { now = new Date(), limit = 8, includePassed = false } = {}) {
  const enriched = (rows ?? [])
    .map((row) => ({ row, daysUntil: computeDaysUntil(row.submission_deadline, now) }))
    .filter((x) => x.daysUntil !== null && (includePassed || x.daysUntil >= 0));
  enriched.sort((a, b) => a.daysUntil - b.daysUntil);
  return enriched.slice(0, limit);
}

/** Format a single verified CFP row as a Discord line with provenance. */
export function formatCfpLine(row, { now = new Date() } = {}) {
  const daysUntil = computeDaysUntil(row.submission_deadline, now);
  const parts = [`**${row.venue_name}** · ${dDayLabel(daysUntil)}`];
  if (row.submission_deadline) {
    const label = row.submission_label ? ` (${row.submission_label})` : '';
    parts.push(`마감 ${row.submission_deadline}${label}${row.timezone ? ` ${row.timezone}` : ''}`);
  }
  if (row.abstract_deadline) {
    parts.push(`초록 ${row.abstract_deadline}`);
  }
  if (row.source_url) {
    parts.push(`[공식 CFP](${row.source_url})`);
  }
  if (row.verified_at) {
    parts.push(`✅ 검증 ${String(row.verified_at).slice(0, 10)}`);
  }
  return parts.join(' · ');
}

/** Build a Discord block from verified CFP rows. Returns '' when empty. */
export function formatVerifiedCfpBlock(rows, { now = new Date(), title = '📅 FieldExplorer 검증 CFP', limit = 6 } = {}) {
  const top = upcomingCfp(rows, { now, limit });
  if (top.length === 0) return '';
  const lines = top.map(({ row }) => `• ${formatCfpLine(row, { now })}`);
  return `${title}\n${lines.join('\n')}`;
}

/** Fetch verified CFP rows from Supabase REST. Read-only; returns [] on failure. */
export async function fetchVerifiedCfp({ supabaseUrl, supabaseKey, fetchImpl = fetch, limit = 200 } = {}) {
  if (!supabaseUrl || !supabaseKey) return [];
  const url =
    `${supabaseUrl.replace(/\/$/, '')}/rest/v1/cfp_verifications` +
    `?select=venue_name,submission_deadline,submission_label,abstract_deadline,abstract_label,source_url,source_label,verified_at,timezone` +
    `&order=submission_deadline.asc&limit=${limit}`;
  try {
    const res = await fetchImpl(url, {
      headers: { apikey: supabaseKey, authorization: `Bearer ${supabaseKey}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
