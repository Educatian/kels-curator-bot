// FieldExplorer venue add-bridge.
//
// Lets a Discord member add a NEW journal/conference to FieldExplorer via
// /add-venue. Writes an approved row into the `community_venues` table, which the
// app merges into its graph at load. Like /review, this is a service-role write
// (the table has no anon insert policy). Pure helpers are unit-tested.

const VALID_TYPES = ['Journal', 'Conference', 'SubConference', 'Organization'];
const VALID_IMPACT = ['Q1', 'Q2', 'Q3', 'Q4'];

export function slugify(name) {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'venue';
}

export function parseCategoryList(input) {
  return String(input ?? '')
    .split(/[,;]/)
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 8);
}

export function normalizeType(input) {
  const t = String(input ?? '').trim();
  const hit = VALID_TYPES.find((v) => v.toLowerCase() === t.toLowerCase());
  return hit || 'Journal';
}

export function normalizeImpact(input) {
  if (!input) return null;
  const i = String(input).trim().toUpperCase();
  return VALID_IMPACT.includes(i) ? i : null;
}

/** Build a community_venues row. Returns {payload} or {error} for invalid input. */
export function buildVenuePayload({ name, type, categories, impact, cfpDeadline, discordUserId }) {
  const cleanName = String(name ?? '').trim();
  if (cleanName.length < 3) return { error: 'venue 이름이 너무 짧아요 (최소 3자).' };
  const cats = parseCategoryList(categories);
  if (cats.length === 0) return { error: '카테고리를 최소 1개 입력해 주세요 (쉼표 구분).' };
  return {
    payload: {
      id: slugify(cleanName),
      name: cleanName,
      type: normalizeType(type),
      categories: cats,
      impact: normalizeImpact(impact),
      cfp_deadline: cfpDeadline ? String(cfpDeadline).trim() : null,
      submitted_by: `discord_${discordUserId}`,
      source: 'discord',
      status: 'approved',
    },
  };
}

/** Insert a venue into community_venues. Returns {ok, status, error, duplicate}. */
export async function submitVenue({ supabaseUrl, serviceKey, payload, fetchImpl = fetch }) {
  if (!supabaseUrl || !serviceKey) return { ok: false, status: 0, error: 'not configured' };
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/community_venues`;
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
      const duplicate = res.status === 409 || /duplicate|unique/i.test(detail);
      return { ok: false, status: res.status, error: detail || `HTTP ${res.status}`, duplicate };
    }
    return { ok: true, status: res.status, error: null, duplicate: false };
  } catch (err) {
    return { ok: false, status: 0, error: err?.message || String(err), duplicate: false };
  }
}
