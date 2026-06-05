import { describe, expect, it } from 'vitest';
import {
  parseKsetBoard,
  ksetViewUrl,
  ksetBoardListUrl,
  fetchKsetUpdates,
} from '../src/kset-board.js';

// Minimal fixture mirroring the real kset.or.kr board list row shape:
// [번호, 제목+view링크, _, 조회수, 날짜]. The view link carries idx=, and the row
// also contains bo_idx= (which must NOT be mistaken for the row id).
const BOARD = { boIdx: 9, label: '공지/학회소식', kind: 'notice' };
const FIXTURE = `
<table><tbody>
<tr><th>번호</th><th>제목</th><th></th><th>조회</th><th>날짜</th></tr>
<tr>
  <td>86</td>
  <td><a href="?page=view&pg=1&idx=762&hCode=BOARD&bo_idx=9&sfl=&stx=">2026 한국교육공학회 춘계학술대회 안내 (~5/6)</a></td>
  <td></td><td>1052</td><td>2026-05-04</td>
</tr>
<tr>
  <td>85</td>
  <td><a href="?page=view&pg=1&idx=703&hCode=BOARD&bo_idx=9">[교육공학연구] 42권 1호 논문 모집 안내</a></td>
  <td></td><td>877</td><td>2026-01-16</td>
</tr>
</tbody></table>
`;

describe('parseKsetBoard', () => {
  it('extracts the row id from idx= (not bo_idx=) and reads title/date/url', () => {
    const items = parseKsetBoard(FIXTURE, BOARD);
    expect(items).toHaveLength(2);
    const [first, second] = items;
    expect(first.idx).toBe('762'); // NOT '9' (the bo_idx)
    expect(first.title).toContain('춘계학술대회');
    expect(first.date).toBe('2026-05-04');
    expect(first.url).toBe(ksetViewUrl(9, 762));
    expect(first.kind).toBe('notice');
    expect(first.source).toBe('한국교육공학회');
    expect(second.idx).toBe('703');
    expect(second.title).toContain('교육공학연구'); // journal news surfaces via the notice board
  });

  it('de-duplicates rows that resolve to the same idx', () => {
    const dup = FIXTURE + FIXTURE;
    const items = parseKsetBoard(dup, BOARD);
    expect(items).toHaveLength(2); // still 2 unique ids
  });

  it('builds canonical board/view URLs', () => {
    expect(ksetBoardListUrl(6)).toContain('bo_idx=6');
    expect(ksetViewUrl(6, 123)).toContain('idx=123');
  });
});

describe('fetchKsetUpdates (with injected fetch)', () => {
  const fakeFetch = async (url) => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => FIXTURE,
  });

  it('aggregates boards, de-dups, and filters by date window', async () => {
    const boards = [{ boIdx: 9, label: '공지', kind: 'notice' }];
    const now = new Date('2026-05-10T00:00:00Z');
    const all = await fetchKsetUpdates({ boards, fetchImpl: fakeFetch, now });
    expect(all.items.length).toBe(2);
    expect(all.errors).toHaveLength(0);

    // 30-day window from 2026-05-10 keeps 05-04, drops 01-16.
    const recent = await fetchKsetUpdates({ boards, sinceDays: 30, fetchImpl: fakeFetch, now });
    expect(recent.items.map((i) => i.idx)).toEqual(['762']);
  });

  it('isolates per-board failures instead of throwing', async () => {
    const badFetch = async () => ({ ok: false, status: 500, statusText: 'err', text: async () => '' });
    const boards = [{ boIdx: 9, label: '공지', kind: 'notice' }];
    const res = await fetchKsetUpdates({ boards, fetchImpl: badFetch });
    expect(res.items).toHaveLength(0);
    expect(res.errors).toHaveLength(1);
  });
});
