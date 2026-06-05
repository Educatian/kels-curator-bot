import { describe, expect, it } from 'vitest';
import {
  computeDaysUntil, dDayLabel, matchCfpForQuery, upcomingCfp,
  formatCfpLine, formatVerifiedCfpBlock, fetchVerifiedCfp,
} from '../src/fieldexplorer-cfp.js';

const NOW = new Date('2026-06-05T00:00:00Z');

const ROWS = [
  { venue_name: 'AIED Conference', submission_deadline: '2026-06-12', submission_label: 'Full Paper', source_url: 'https://aied-conference.org/2026/call-for-paper', verified_at: '2026-03-31T00:00:00Z', timezone: 'AoE' },
  { venue_name: 'LAK Conference', submission_deadline: '2026-09-01', source_url: 'https://www.solaresearch.org/events/lak/lak26/general-call/', verified_at: '2026-03-31T00:00:00Z' },
  { venue_name: 'CHI Conference', submission_deadline: '2026-04-01' }, // passed
  { venue_name: 'EDM Conference', submission_deadline: null },          // unknown
];

describe('computeDaysUntil / dDayLabel', () => {
  it('computes whole-day deltas and labels', () => {
    expect(computeDaysUntil('2026-06-12', NOW)).toBe(7);
    expect(computeDaysUntil('2026-06-05', NOW)).toBe(0);
    expect(computeDaysUntil('2026-06-01', NOW)).toBe(-4);
    expect(computeDaysUntil(null, NOW)).toBeNull();
    expect(dDayLabel(7)).toBe('D-7');
    expect(dDayLabel(0)).toBe('D-DAY');
    expect(dDayLabel(-4)).toBe('4일 지남');
    expect(dDayLabel(null)).toBe('날짜 미확인');
  });
});

describe('matchCfpForQuery', () => {
  it('matches venue by name token / substring', () => {
    const m = matchCfpForQuery(ROWS, 'AIED 논문 투고하고 싶어요');
    expect(m[0].venue_name).toBe('AIED Conference');
  });
  it('returns [] for empty query', () => {
    expect(matchCfpForQuery(ROWS, '')).toEqual([]);
  });
});

describe('upcomingCfp', () => {
  it('keeps only future deadlines, soonest first', () => {
    const up = upcomingCfp(ROWS, { now: NOW });
    expect(up.map((x) => x.row.venue_name)).toEqual(['AIED Conference', 'LAK Conference']);
    expect(up[0].daysUntil).toBe(7);
  });
  it('includes passed when asked', () => {
    const up = upcomingCfp(ROWS, { now: NOW, includePassed: true });
    expect(up.some((x) => x.row.venue_name === 'CHI Conference')).toBe(true);
  });
});

describe('formatting', () => {
  it('formatCfpLine carries D-day + source + verified provenance', () => {
    const line = formatCfpLine(ROWS[0], { now: NOW });
    expect(line).toContain('AIED Conference');
    expect(line).toContain('D-7');
    expect(line).toContain('공식 CFP');
    expect(line).toContain('검증 2026-03-31');
  });
  it('formatVerifiedCfpBlock returns a titled block or empty', () => {
    expect(formatVerifiedCfpBlock(ROWS, { now: NOW })).toContain('FieldExplorer 검증 CFP');
    expect(formatVerifiedCfpBlock([], { now: NOW })).toBe('');
  });
});

describe('fetchVerifiedCfp', () => {
  it('returns [] without config', async () => {
    expect(await fetchVerifiedCfp({})).toEqual([]);
  });
  it('GETs cfp_verifications with apikey headers', async () => {
    let captured = null;
    const fetchImpl = async (url, opts) => {
      captured = { url, opts };
      return { ok: true, json: async () => ROWS };
    };
    const rows = await fetchVerifiedCfp({ supabaseUrl: 'https://x.supabase.co', supabaseKey: 'k', fetchImpl });
    expect(rows).toHaveLength(4);
    expect(captured.url).toContain('/rest/v1/cfp_verifications');
    expect(captured.opts.headers.apikey).toBe('k');
  });
  it('returns [] on http error', async () => {
    const fetchImpl = async () => ({ ok: false, json: async () => ({}) });
    expect(await fetchVerifiedCfp({ supabaseUrl: 'u', supabaseKey: 'k', fetchImpl })).toEqual([]);
  });
});
