import { describe, expect, it } from 'vitest';
import { parseKaeimNotices, fetchKaeimUpdates, KAEIM_NOTICE_URL } from '../src/kaeim-board.js';

// Fixture mirroring a JAMS notice list: rows of [번호, 제목, 작성자, 날짜, 조회].
const FIXTURE = `
<table><tbody>
<tr><th>번호</th><th>제목</th><th>작성자</th><th>등록일</th><th>조회</th></tr>
<tr>
  <td>1</td>
  <td style="text-align:left;">2026 한국교육정보미디어학회 춘계학술대회 초청장</td>
  <td>장혜지</td><td>2026-05-18</td><td>748</td>
</tr>
<tr>
  <td>2</td>
  <td style="text-align:left;">[교육정보미디어연구] 제32권 3호 논문 접수를 진행합니다</td>
  <td>임영미</td><td>2026-04-30</td><td>1419</td>
</tr>
</tbody></table>
`;

describe('parseKaeimNotices', () => {
  it('reads title/author/date and tags the source, skipping the header row', () => {
    const items = parseKaeimNotices(FIXTURE);
    expect(items).toHaveLength(2);
    const [a, b] = items;
    expect(a.title).toContain('춘계학술대회');
    expect(a.author).toBe('장혜지');
    expect(a.date).toBe('2026-05-18');
    expect(a.source).toBe('한국교육정보미디어학회');
    expect(a.url).toBe(KAEIM_NOTICE_URL);
    expect(b.title).toContain('교육정보미디어연구'); // journal issue news surfaces here
    expect(b.date).toBe('2026-04-30');
  });

  it('builds a stable date+title id and de-dups repeats', () => {
    const items = parseKaeimNotices(FIXTURE + FIXTURE);
    expect(items).toHaveLength(2);
    expect(items[0].id).toMatch(/^kaeim-notice-2026-/);
  });

  it('normalizes YYYY.MM.DD dates to dashes', () => {
    const dotted = FIXTURE.replace('2026-05-18', '2026.05.18');
    const items = parseKaeimNotices(dotted);
    expect(items.some((i) => i.date === '2026-05-18')).toBe(true);
  });
});

describe('fetchKaeimUpdates (injected fetch)', () => {
  const okFetch = async () => ({ ok: true, status: 200, statusText: 'OK', text: async () => FIXTURE });

  it('filters by date window and sorts newest first', async () => {
    const now = new Date('2026-05-20T00:00:00Z');
    const recent = await fetchKaeimUpdates({ sinceDays: 10, fetchImpl: okFetch, now });
    expect(recent.items.map((i) => i.date)).toEqual(['2026-05-18']); // 04-30 dropped
    expect(recent.errors).toHaveLength(0);
  });

  it('captures fetch failure as an error instead of throwing', async () => {
    const badFetch = async () => ({ ok: false, status: 503, statusText: 'down', text: async () => '' });
    const res = await fetchKaeimUpdates({ fetchImpl: badFetch });
    expect(res.items).toHaveLength(0);
    expect(res.errors).toHaveLength(1);
  });
});
