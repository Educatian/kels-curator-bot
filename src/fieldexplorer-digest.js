// FieldExplorer community digest + venue reviews.
//
// Reads community activity from FieldExplorer Supabase and renders it for Discord:
//   - weekly digest: new community venues, top recent reviews, imminent CFPs
//   - /venue-reviews: a venue's community reviews
//
// annotations has RLS (own + favorited venues only), so reads use the SERVICE role
// and anonymize authors the same way the app's annotations_feed view does
// (`user_<md5(email)[:4]>`). community_venues approved rows are anon-readable.

import { createHash } from 'node:crypto';
import { computeDaysUntil, dDayLabel, fetchVerifiedCfp, upcomingCfp, formatCfpLine } from './fieldexplorer-cfp.js';

export function anonAuthor(email) {
  if (!email) return 'user_anon';
  return `user_${createHash('md5').update(String(email)).digest('hex').slice(0, 4)}`;
}

export function formatReviewLine(r) {
  const stars = '⭐'.repeat(Math.max(0, Math.min(5, Number(r.rating) || 0)));
  const who = anonAuthor(r.user_email);
  const when = r.created_at ? String(r.created_at).slice(0, 10) : '';
  const tags = Array.isArray(r.tags) && r.tags.length ? ` _[${r.tags.join(', ')}]_` : '';
  const comment = String(r.comment ?? '').replace(/\s+/g, ' ').slice(0, 240);
  return `${stars} ${comment}${tags}  — ${who} ${when}`.trim();
}

/** Render a venue's reviews block for /venue-reviews. */
export function formatVenueReviews(venueName, rows, { limit = 8 } = {}) {
  if (!rows || rows.length === 0) {
    return `**${venueName}** — 아직 등록된 리뷰가 없어요. \`/review\`로 첫 리뷰를 남겨보세요!`;
  }
  const n = rows.length;
  const avg = (rows.reduce((s, r) => s + (Number(r.rating) || 0), 0) / n).toFixed(1);
  const lines = rows.slice(0, limit).map((r) => `• ${formatReviewLine(r)}`);
  const more = n > limit ? `\n…외 ${n - limit}개` : '';
  return `📝 **${venueName}** 리뷰 (${n}개, 평균 ⭐${avg})\n${lines.join('\n')}${more}`;
}

/** Render the weekly community digest. Returns '' when there is nothing to show. */
export function formatWeeklyDigest({ venues = [], reviews = [], cfp = [], now = new Date() } = {}) {
  const sections = [];
  if (venues.length) {
    const v = venues.slice(0, 8).map((x) => {
      const q = x.impact ? ` · ${x.impact}` : '';
      const cats = Array.isArray(x.categories) ? x.categories.slice(0, 3).join(', ') : '';
      return `• **${x.name}** (${x.type}${q})${cats ? ` — ${cats}` : ''}`;
    });
    sections.push(`➕ **이번 주 새로 추가된 venue (${venues.length})**\n${v.join('\n')}`);
  }
  if (reviews.length) {
    const r = reviews.slice(0, 5).map((x) => `• ${formatReviewLine(x)}`);
    sections.push(`⭐ **이번 주 리뷰 (${reviews.length})**\n${r.join('\n')}`);
  }
  if (cfp.length) {
    const c = cfp.slice(0, 6).map(({ row }) => `• ${formatCfpLine(row, { now })}`);
    sections.push(`📅 **마감 임박 CFP**\n${c.join('\n')}`);
  }
  if (sections.length === 0) return '';
  return `📚 **FieldExplorer 주간 다이제스트**\n\n${sections.join('\n\n')}\n\n탐색: https://fieldexplorer10.vercel.app`;
}

function svcHeaders(key) {
  return { apikey: key, authorization: `Bearer ${key}` };
}

/** Reviews for one venue (service read; newest first). Returns [] on failure. */
export async function fetchVenueReviews({ supabaseUrl, serviceKey, venueName, limit = 20, fetchImpl = fetch }) {
  if (!supabaseUrl || !serviceKey || !venueName) return [];
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/annotations`
    + `?select=venue_name,rating,comment,tags,created_at,user_email`
    + `&venue_name=eq.${encodeURIComponent(venueName)}&order=created_at.desc&limit=${limit}`;
  try {
    const res = await fetchImpl(url, { headers: svcHeaders(serviceKey) });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Recent reviews across all venues (service read). */
export async function fetchRecentReviews({ supabaseUrl, serviceKey, sinceIso, limit = 12, fetchImpl = fetch }) {
  if (!supabaseUrl || !serviceKey) return [];
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/annotations`
    + `?select=venue_name,rating,comment,tags,created_at,user_email`
    + `&created_at=gte.${encodeURIComponent(sinceIso)}&order=rating.desc,created_at.desc&limit=${limit}`;
  try {
    const res = await fetchImpl(url, { headers: svcHeaders(serviceKey) });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Recently added approved community venues (anon read is fine). */
export async function fetchRecentVenues({ supabaseUrl, supabaseKey, sinceIso, limit = 12, fetchImpl = fetch }) {
  if (!supabaseUrl || !supabaseKey) return [];
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/community_venues`
    + `?select=name,type,categories,impact,created_at&status=eq.approved`
    + `&created_at=gte.${encodeURIComponent(sinceIso)}&order=created_at.desc&limit=${limit}`;
  try {
    const res = await fetchImpl(url, { headers: svcHeaders(supabaseKey) });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Assemble the weekly digest inputs (venues + reviews + imminent CFP). */
export async function buildWeeklyDigestData({ config, days = 7, cfpWindow = 30, now = new Date(), fetchImpl = fetch }) {
  const sinceIso = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const [venues, reviews, cfpRows] = await Promise.all([
    fetchRecentVenues({ supabaseUrl: config.fieldExplorerSupabaseUrl, supabaseKey: config.fieldExplorerSupabaseKey, sinceIso, fetchImpl }),
    fetchRecentReviews({ supabaseUrl: config.fieldExplorerSupabaseUrl, serviceKey: config.fieldExplorerServiceKey, sinceIso, fetchImpl }),
    fetchVerifiedCfp({ supabaseUrl: config.fieldExplorerSupabaseUrl, supabaseKey: config.fieldExplorerSupabaseKey, fetchImpl }),
  ]);
  const cfp = upcomingCfp(cfpRows, { now, limit: 6 }).filter((x) => x.daysUntil <= cfpWindow);
  return { venues, reviews, cfp };
}

export { computeDaysUntil, dDayLabel };
