// FieldExplorer review write-bridge.
//
// Lets a Discord member add a venue review straight into FieldExplorer's
// `annotations` table, where it surfaces in the app's review feed. This is the
// first WRITE path from the bot to FieldExplorer (everything else is read-only).
//
// The annotations table has RLS enabled with NO insert policy, so writes must use
// the Supabase SERVICE ROLE key (trusted, server-side bot runtime only). Pure
// helpers are unit-tested; the network POST takes an injectable fetch.

/** Parse FieldExplorer venues.json into a flat [{name, type}] list. */
export function parseVenueList(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(String(jsonText ?? '').replace(/^﻿/, ''));
  } catch {
    return [];
  }
  const venues = Array.isArray(parsed) ? parsed : parsed?.venues;
  if (!Array.isArray(venues)) return [];
  return venues
    .map((v) => ({
      name: String(v?.name ?? '').trim(),
      type: String(v?.type ?? '').trim() || 'Journal',
      impact: v?.impact ? String(v.impact).trim() : undefined,
      cfpDeadline: v?.cfpDeadline ? String(v.cfpDeadline).trim() : undefined,
    }))
    .filter((v) => v.name);
}

function norm(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9가-힣\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Resolve a free-text venue query to a known venue {name, type} or null. */
export function normalizeVenue(query, venues) {
  const q = norm(query);
  if (!q || !Array.isArray(venues) || venues.length === 0) return null;
  // 1. exact (case-insensitive) name match
  const exact = venues.find((v) => norm(v.name) === q);
  if (exact) return exact;
  // 2. query is a substring of a venue name, or vice versa
  const sub = venues.find((v) => norm(v.name).includes(q) || q.includes(norm(v.name)));
  if (sub) return sub;
  // 3. best token-overlap match
  const qt = new Set(q.split(' ').filter((t) => t.length > 1));
  let best = null;
  let bestScore = 0;
  for (const v of venues) {
    const vt = new Set(norm(v.name).split(' ').filter((t) => t.length > 1));
    let overlap = 0;
    for (const t of vt) if (qt.has(t)) overlap += 1;
    const score = vt.size ? overlap / vt.size : 0;
    if (score > bestScore) { bestScore = score; best = v; }
  }
  return bestScore >= 0.5 ? best : null;
}

export function parseTags(input) {
  return String(input ?? '')
    .split(/[,#]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);
}

export function clampRating(n) {
  const v = Number.parseInt(n, 10);
  if (!Number.isInteger(v)) return null;
  return Math.min(5, Math.max(1, v));
}

/** Build the annotations row. user_email is a stable Discord-derived pseudonym so
 *  the app's anonymizing feed view (`user_<md5>`) stays consistent. */
export function buildAnnotationPayload({ venueName, venueType, rating, comment, tags = [], discordUserId }) {
  return {
    venue_name: venueName,
    venue_type: venueType || 'Journal',
    rating,
    comment: String(comment ?? '').slice(0, 2000),
    tags,
    user_email: `discord_${discordUserId}@kels.bot`,
  };
}

/** Insert a review into FieldExplorer Supabase. Returns {ok, status, error}. */
export async function submitReview({ supabaseUrl, serviceKey, payload, fetchImpl = fetch }) {
  if (!supabaseUrl || !serviceKey) return { ok: false, status: 0, error: 'not configured' };
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/annotations`;
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        'content-type': 'application/json',
        prefer: 'return=minimal',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text())?.slice(0, 300); } catch { /* ignore */ }
      return { ok: false, status: res.status, error: detail || `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status, error: null };
  } catch (err) {
    return { ok: false, status: 0, error: err?.message || String(err) };
  }
}
