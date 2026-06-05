import { describe, expect, it } from 'vitest';
import {
  slugify, parseCategoryList, normalizeType, normalizeImpact,
  buildVenuePayload, submitVenue,
} from '../src/fieldexplorer-venue-add.js';

describe('helpers', () => {
  it('slugifies names', () => {
    expect(slugify('Journal of the Learning Sciences')).toBe('journal-of-the-learning-sciences');
    expect(slugify('  !!!  ')).toBe('venue');
  });
  it('parses categories and normalizes type/impact', () => {
    expect(parseCategoryList('Learning Sciences, CSCL ; Methods')).toEqual(['Learning Sciences', 'CSCL', 'Methods']);
    expect(normalizeType('conference')).toBe('Conference');
    expect(normalizeType('weird')).toBe('Journal');
    expect(normalizeImpact('q1')).toBe('Q1');
    expect(normalizeImpact('Q9')).toBeNull();
    expect(normalizeImpact('')).toBeNull();
  });
});

describe('buildVenuePayload', () => {
  it('builds an approved row', () => {
    const { payload } = buildVenuePayload({
      name: 'Journal of Open Learning', type: 'Journal',
      categories: 'Open Education, Distance Learning', impact: 'Q2',
      cfpDeadline: '', discordUserId: '777',
    });
    expect(payload.id).toBe('journal-of-open-learning');
    expect(payload.type).toBe('Journal');
    expect(payload.categories).toEqual(['Open Education', 'Distance Learning']);
    expect(payload.impact).toBe('Q2');
    expect(payload.status).toBe('approved');
    expect(payload.submitted_by).toBe('discord_777');
  });
  it('rejects short name or no categories', () => {
    expect(buildVenuePayload({ name: 'X', categories: 'a', discordUserId: '1' }).error).toMatch(/짧/);
    expect(buildVenuePayload({ name: 'Valid Name', categories: '', discordUserId: '1' }).error).toMatch(/카테고리/);
  });
});

describe('submitVenue', () => {
  it('refuses when unconfigured', async () => {
    expect((await submitVenue({ payload: {} })).ok).toBe(false);
  });
  it('POSTs to community_venues with service headers', async () => {
    let captured = null;
    const fetchImpl = async (url, opts) => { captured = { url, opts }; return { ok: true, status: 201 }; };
    const r = await submitVenue({ supabaseUrl: 'https://x.supabase.co', serviceKey: 'svc', payload: { name: 'A' }, fetchImpl });
    expect(r.ok).toBe(true);
    expect(captured.url).toContain('/rest/v1/community_venues');
    expect(captured.opts.headers.apikey).toBe('svc');
  });
  it('flags duplicates (409)', async () => {
    const fetchImpl = async () => ({ ok: false, status: 409, text: async () => 'duplicate key' });
    const r = await submitVenue({ supabaseUrl: 'u', serviceKey: 'k', payload: {}, fetchImpl });
    expect(r.ok).toBe(false);
    expect(r.duplicate).toBe(true);
  });
});
