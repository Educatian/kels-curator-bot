import { describe, expect, it } from 'vitest';
import {
  parseVenueList, normalizeVenue, parseTags, clampRating,
  buildAnnotationPayload, submitReview,
} from '../src/fieldexplorer-review.js';

const VENUES_JSON = JSON.stringify([
  { name: 'Journal of the Learning Sciences', type: 'Journal' },
  { name: 'International Journal of Computer-Supported Collaborative Learning', type: 'Journal' },
  { name: 'AIED Conference', type: 'Conference' },
]);

describe('parseVenueList', () => {
  it('flattens to {name,type}', () => {
    const v = parseVenueList(VENUES_JSON);
    expect(v).toHaveLength(3);
    expect(v[2]).toEqual({ name: 'AIED Conference', type: 'Conference' });
  });
  it('returns [] on bad json', () => {
    expect(parseVenueList('nope')).toEqual([]);
  });
});

describe('normalizeVenue', () => {
  const venues = parseVenueList(VENUES_JSON);
  it('matches exact name', () => {
    expect(normalizeVenue('Journal of the Learning Sciences', venues).type).toBe('Journal');
  });
  it('matches by substring / acronym-ish', () => {
    expect(normalizeVenue('AIED', venues).name).toBe('AIED Conference');
  });
  it('returns null for unrelated text', () => {
    expect(normalizeVenue('quantum chromodynamics', venues)).toBeNull();
  });
});

describe('parseTags / clampRating', () => {
  it('splits tags on comma or hash', () => {
    expect(parseTags('CSCL, #methods,  ,rigor')).toEqual(['CSCL', 'methods', 'rigor']);
  });
  it('clamps rating to 1..5', () => {
    expect(clampRating(7)).toBe(5);
    expect(clampRating(0)).toBe(1);
    expect(clampRating('3')).toBe(3);
    expect(clampRating('x')).toBeNull();
  });
});

describe('buildAnnotationPayload', () => {
  it('produces an annotations row with stable pseudonym', () => {
    const p = buildAnnotationPayload({
      venueName: 'AIED Conference', venueType: 'Conference', rating: 4,
      comment: 'Strong fit for adaptive feedback work.', tags: ['AIED'], discordUserId: '12345',
    });
    expect(p.venue_name).toBe('AIED Conference');
    expect(p.rating).toBe(4);
    expect(p.user_email).toBe('discord_12345@kels.bot');
    expect(p.tags).toEqual(['AIED']);
  });
});

describe('submitReview', () => {
  it('refuses when unconfigured', async () => {
    const r = await submitReview({ payload: {} });
    expect(r.ok).toBe(false);
  });
  it('POSTs to annotations with service-role headers', async () => {
    let captured = null;
    const fetchImpl = async (url, opts) => { captured = { url, opts }; return { ok: true, status: 201 }; };
    const r = await submitReview({
      supabaseUrl: 'https://x.supabase.co', serviceKey: 'svc',
      payload: { venue_name: 'AIED Conference', rating: 4 }, fetchImpl,
    });
    expect(r.ok).toBe(true);
    expect(captured.url).toContain('/rest/v1/annotations');
    expect(captured.opts.method).toBe('POST');
    expect(captured.opts.headers.apikey).toBe('svc');
    expect(JSON.parse(captured.opts.body).venue_name).toBe('AIED Conference');
  });
  it('reports http errors', async () => {
    const fetchImpl = async () => ({ ok: false, status: 401, text: async () => 'rls denied' });
    const r = await submitReview({ supabaseUrl: 'u', serviceKey: 'k', payload: {}, fetchImpl });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
  });
});
