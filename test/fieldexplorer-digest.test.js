import { describe, expect, it } from 'vitest';
import {
  anonAuthor, formatReviewLine, formatVenueReviews, formatWeeklyDigest,
  fetchVenueReviews, fetchRecentVenues,
} from '../src/fieldexplorer-digest.js';

const NOW = new Date('2026-06-05T00:00:00Z');

describe('anonAuthor', () => {
  it('produces a stable user_<4hex> label matching the app view', () => {
    const a = anonAuthor('discord_12345@kels.bot');
    expect(a).toMatch(/^user_[0-9a-f]{4}$/);
    expect(anonAuthor('discord_12345@kels.bot')).toBe(a); // stable
    expect(anonAuthor('')).toBe('user_anon');
  });
});

describe('formatVenueReviews', () => {
  const rows = [
    { venue_name: 'JLS', rating: 5, comment: 'great fit', tags: ['CSCL'], created_at: '2026-06-01T00:00:00Z', user_email: 'a@x' },
    { venue_name: 'JLS', rating: 3, comment: 'ok', tags: [], created_at: '2026-05-20T00:00:00Z', user_email: 'b@x' },
  ];
  it('renders count, average, and anonymized lines', () => {
    const out = formatVenueReviews('JLS', rows);
    expect(out).toContain('JLS');
    expect(out).toContain('2개');
    expect(out).toContain('평균 ⭐4.0');
    expect(out).toContain('great fit');
    expect(out).toMatch(/user_[0-9a-f]{4}/);
  });
  it('handles empty', () => {
    expect(formatVenueReviews('X', [])).toContain('아직 등록된 리뷰가 없');
  });
});

describe('formatWeeklyDigest', () => {
  it('includes only non-empty sections', () => {
    const out = formatWeeklyDigest({
      venues: [{ name: 'New J', type: 'Journal', impact: 'Q2', categories: ['LS'] }],
      reviews: [{ venue_name: 'JLS', rating: 5, comment: 'nice', tags: [], created_at: '2026-06-02', user_email: 'a@x' }],
      cfp: [{ row: { venue_name: 'AIED Conference', submission_deadline: '2026-06-12' }, daysUntil: 7 }],
      now: NOW,
    });
    expect(out).toContain('주간 다이제스트');
    expect(out).toContain('새로 추가된 venue');
    expect(out).toContain('이번 주 리뷰');
    expect(out).toContain('마감 임박 CFP');
  });
  it('returns empty string when nothing to show', () => {
    expect(formatWeeklyDigest({ venues: [], reviews: [], cfp: [] })).toBe('');
  });
});

describe('fetch wrappers', () => {
  it('fetchVenueReviews builds the right query + service headers', async () => {
    let captured = null;
    const fetchImpl = async (url, opts) => { captured = { url, opts }; return { ok: true, json: async () => [] }; };
    await fetchVenueReviews({ supabaseUrl: 'https://x.supabase.co', serviceKey: 'svc', venueName: 'A B & C', fetchImpl });
    expect(captured.url).toContain('/rest/v1/annotations');
    expect(captured.url).toContain('venue_name=eq.A%20B%20%26%20C');
    expect(captured.opts.headers.apikey).toBe('svc');
  });
  it('fetchRecentVenues filters approved + since', async () => {
    let captured = null;
    const fetchImpl = async (url) => { captured = url; return { ok: true, json: async () => [] }; };
    await fetchRecentVenues({ supabaseUrl: 'u', supabaseKey: 'k', sinceIso: '2026-06-01T00:00:00Z', fetchImpl });
    expect(captured).toContain('/rest/v1/community_venues');
    expect(captured).toContain('status=eq.approved');
    expect(captured).toContain('created_at=gte.');
  });
  it('returns [] on http error', async () => {
    const fetchImpl = async () => ({ ok: false, json: async () => ({}) });
    expect(await fetchVenueReviews({ supabaseUrl: 'u', serviceKey: 'k', venueName: 'A', fetchImpl })).toEqual([]);
  });
});
