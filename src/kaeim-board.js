// 한국교육정보미디어학회 (KAEIM) board harvester.
//
// KAEIM runs on the KISTI JAMS platform (kaeim.jams.or.kr). Unlike ACOMS, JAMS is
// reachable and its notice list is server-rendered HTML, so a dependency-light
// fetch+parse harvests it. The journal 교육정보미디어연구 (published Feb/Apr/Jun/
// Aug/Oct/Dec) announces each new issue through this notice board
// (e.g. "[교육정보미디어연구] 제32권 3호 논문 접수…"), so issue news surfaces here.
//
// Notice rows are <tr> with cells: [번호, 제목, 작성자, 날짜(YYYY-MM-DD), 조회].
// JAMS opens each notice via a JS-driven hidden-form post (notiSeq), so per-item
// deep links are not available from static HTML; items link to the notice board.

const KAEIM_ORIGIN = 'https://kaeim.jams.or.kr';
export const KAEIM_NOTICE_URL = `${KAEIM_ORIGIN}/po/community/notice/noticeList.kci`;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

function clean(s) {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

function slug(title) {
  return title.replace(/[^0-9A-Za-z가-힣]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
}

/**
 * Parse a JAMS notice list page into structured items. Pure (HTML in, items out).
 * The board number column is volatile (it renumbers as posts are added), so the
 * stable id is built from date + title slug for reliable de-duplication.
 */
export function parseKaeimNotices(html) {
  const items = [];
  const seen = new Set();
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const cells = (row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || []).map(clean);
    if (cells.length < 4) continue;
    // Find the date cell (YYYY-MM-DD or YYYY.MM.DD) and take the longest non-empty
    // cell before it as the title; the cell after the title is the author.
    const dateIdx = cells.findIndex((c) => /^20\d\d[-.]\d{1,2}[-.]\d{1,2}$/.test(c));
    if (dateIdx < 1) continue;
    const date = cells[dateIdx].replace(/\./g, '-');
    // Title = the longest cell among those before the date (skip the leading number).
    let title = '';
    for (let i = 1; i < dateIdx; i++) {
      if (cells[i].length > title.length && !/^\d+$/.test(cells[i])) title = cells[i];
    }
    if (!title) continue;
    const author = cells[dateIdx - 1] !== title ? cells[dateIdx - 1] : '';

    const id = `kaeim-notice-${date}-${slug(title)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      title,
      author,
      date,
      url: KAEIM_NOTICE_URL, // per-item deep link needs JS; link to the board
      boardLabel: '공지/학회소식',
      kind: 'notice',
      source: '한국교육정보미디어학회',
    });
  }
  return items;
}

async function fetchText(url, fetchImpl) {
  const res = await fetchImpl(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko,en;q=0.8' } });
  if (!res.ok) throw new Error(`KAEIM fetch failed: ${res.status} ${res.statusText} (${url})`);
  return res.text();
}

function withinDays(dateStr, days, now) {
  if (!days) return true;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return true;
  return (now - d) / (1000 * 60 * 60 * 24) <= days;
}

/**
 * Harvest KAEIM notices (which carry 교육정보미디어연구 issue announcements).
 * Returns a date-sorted, de-duplicated list; `sinceDays` keeps recent items only.
 */
export async function fetchKaeimUpdates({
  sinceDays = 0,
  fetchImpl = fetch,
  now = new Date(),
} = {}) {
  const errors = [];
  let items = [];
  try {
    const html = await fetchText(KAEIM_NOTICE_URL, fetchImpl);
    items = parseKaeimNotices(html);
  } catch (error) {
    errors.push({ board: '공지/학회소식', error: error?.message || String(error) });
  }
  const filtered = items.filter((it) => withinDays(it.date, sinceDays, now));
  filtered.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return { items: filtered, errors };
}
