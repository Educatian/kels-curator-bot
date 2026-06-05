// 한국교육공학회 (KSET, kset.or.kr) board harvester.
//
// The society journal 교육공학연구 is hosted on ACOMS (acoms.kisti.re.kr), which is
// network-unreachable from some environments, so this module instead harvests the
// society's own server-rendered boards (공지/소식, 학술대회 발표논문=proceedings,
// 행사일정, 뉴스레터). Those list pages are plain HTML — no headless browser needed.
//
// Board list rows look like:
//   <tr><td>번호</td><td><a href="?page=view&idx=762&hCode=BOARD&bo_idx=9&...">제목</a></td>
//       <td>...</td><td>조회수</td><td>2026-05-04</td></tr>

const KSET_ORIGIN = 'https://www.kset.or.kr';

// Boards worth surfacing to the community, with a human label + kind tag.
export const KSET_BOARDS = [
  { boIdx: 9, label: '공지/학회소식', kind: 'notice' },
  { boIdx: 6, label: '학술대회 발표논문', kind: 'proceedings' },
  { boIdx: 13, label: '행사일정', kind: 'event' },
  { boIdx: 11, label: '뉴스레터', kind: 'newsletter' },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

export function ksetBoardListUrl(boIdx) {
  return `${KSET_ORIGIN}/index.php?hCode=BOARD&bo_idx=${boIdx}`;
}

export function ksetViewUrl(boIdx, idx) {
  return `${KSET_ORIGIN}/index.php?page=view&idx=${idx}&hCode=BOARD&bo_idx=${boIdx}`;
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, ' ');
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function clean(s) {
  return decodeEntities(stripTags(s)).replace(/\s+/g, ' ').trim();
}

/**
 * Parse a KSET board list HTML page into structured rows.
 * Pure: takes HTML text, returns items (no network).
 */
export function parseKsetBoard(html, board) {
  const items = [];
  const seen = new Set();
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const link = row.match(/href=["']([^"']*page=view[^"']*)["']/i);
    if (!link) continue;
    // Use [?&]idx= so the leading number is the row id, not the trailing bo_idx=.
    const idxMatch = link[1].match(/[?&]idx=(\d+)/i);
    if (!idxMatch) continue;
    const idx = idxMatch[1];
    if (seen.has(idx)) continue;

    // Title = text of the anchor that carries the view link.
    const anchor = row.match(/<a[^>]*page=view[^>]*>([\s\S]*?)<\/a>/i);
    const title = anchor ? clean(anchor[1]) : '';
    if (!title) continue;

    const date = (row.match(/(20\d\d[-./]\d{1,2}[-./]\d{1,2})/) || [])[1] || '';
    const cells = (row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || []).map(clean);
    const views = Number((cells.find(c => /^\d+$/.test(c) && c !== cells[0]) || '0')) || 0;

    seen.add(idx);
    items.push({
      id: `kset-${board.boIdx}-${idx}`,
      idx,
      title,
      date: date.replace(/\./g, '-'),
      views,
      url: ksetViewUrl(board.boIdx, idx),
      boardLabel: board.label,
      kind: board.kind,
      source: '한국교육공학회',
    });
  }
  return items;
}

async function fetchText(url, fetchImpl) {
  const res = await fetchImpl(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko,en;q=0.8' } });
  if (!res.ok) throw new Error(`KSET fetch failed: ${res.status} ${res.statusText} (${url})`);
  return res.text();
}

/** Fetch one board and return its parsed items (most-recent first as the site lists them). */
export async function fetchKsetBoard(board, { fetchImpl = fetch } = {}) {
  const html = await fetchText(ksetBoardListUrl(board.boIdx), fetchImpl);
  return parseKsetBoard(html, board);
}

function withinDays(dateStr, days, now) {
  if (!days) return true;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return true; // keep undated rather than silently drop
  return (now - d) / (1000 * 60 * 60 * 24) <= days;
}

/**
 * Harvest all configured KSET boards. Returns a flat, de-duplicated, date-sorted
 * list of recent updates. `sinceDays` keeps only items newer than that window
 * (0/undefined = no date filter). Per-board failures are isolated so one dead
 * board does not sink the whole digest.
 */
export async function fetchKsetUpdates({
  boards = KSET_BOARDS,
  sinceDays = 0,
  fetchImpl = fetch,
  now = new Date(),
} = {}) {
  const results = await Promise.allSettled(
    boards.map((b) => fetchKsetBoard(b, { fetchImpl })),
  );
  const all = [];
  const errors = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') all.push(...r.value);
    else errors.push({ board: boards[i].label, error: r.reason?.message || String(r.reason) });
  });
  const filtered = all.filter((it) => withinDays(it.date, sinceDays, now));
  filtered.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return { items: filtered, errors };
}
