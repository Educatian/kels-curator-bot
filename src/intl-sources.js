// International edtech / learning-sciences society feeds (AECT, ISLS, iLRN, APSCE,
// SREE, AERA ...). Items are classified as CFP vs news and routed to different
// channels (CFP -> #cfp-rfp, news -> 자유게시판).
//
// RSS/Atom sources parse with fast-xml-parser (reachable, no JS). HTML-only orgs
// are added with per-source extractors as their pages are confirmed. Status today:
//   ISLS  rss  ✅ https://www.isls.org/feed/
//   AERA  html ⏳ aera.net/Newsroom server-rendered (extractor pending)
//   SREE  html ⏳ sree.org/conferences server-rendered (extractor pending)
//   AECT  html ⏳ correct news/CFP path needed
//   APSCE html ⏳ correct news/CFP path needed
//   iLRN  ⛔ immersivelrn.org Cloudflare 403 (needs deepcloak)

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';

const execFileP = promisify(execFile);
const parser = new XMLParser({ ignoreAttributes: false, processEntities: true });

// deepcloak's venv python + the stealth-fetch helper, for type:'stealth' sources
// (Cloudflare/bot-walled pages like iLRN). Override the python via DEEPCLOAK_PYTHON.
const DEEPCLOAK_PYTHON = process.env.DEEPCLOAK_PYTHON
  || 'C:\\Users\\jewoo\\AppData\\Roaming\\uv\\tools\\deepcloak\\Scripts\\python.exe';
const STEALTH_SCRIPT = fileURLToPath(new URL('../scripts/stealth_fetch.py', import.meta.url));

async function fetchStealthHtml(url) {
  const { stdout } = await execFileP(DEEPCLOAK_PYTHON, [STEALTH_SCRIPT, url, '4000'], {
    maxBuffer: 12 * 1024 * 1024,
    timeout: 120000,
    windowsHide: true,
  });
  return stdout;
}
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

export const INTL_SOURCES = [
  { id: 'isls', org: 'ISLS', label: '국제학습과학회 (ISLS)', type: 'rss', url: 'https://www.isls.org/feed/' },
  { id: 'earli', org: 'EARLI', label: '유럽학습교수연구학회 (EARLI)', type: 'html', extract: 'earli', url: 'https://www.earli.org/news' },
  { id: 'ilrn', org: 'iLRN', label: '몰입학습연구네트워크 (iLRN)', type: 'stealth', extract: 'ilrn', url: 'https://www.immersivelrn.org/events/' },
];

// A CFP if it solicits submissions/proposals/nominations; otherwise general news.
const CFP_RE = /(call\s+for\s+(papers|proposals|submissions?|nominations?|applications?|abstracts?|chapters?|participation|reviewers?|workshops?|posters?))|(\bcfp\b)|((submissions?|applications?|nominations?)\s+(are\s+)?(now\s+)?open)|(submission\s+deadline)|(proposals?\s+due)|(abstracts?\s+due)|(now\s+accepting)|(apply\s+(now|by))|(deadline\s+(for\s+)?(submission|proposal|abstract|paper|application))/i;

export function classifyItem(item) {
  return CFP_RE.test(`${item.title || ''} ${item.summary || ''}`) ? 'cfp' : 'news';
}

function text(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  return String(node['#text'] ?? '');
}

function stripHtml(s) {
  return String(s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\s+/g, ' ').trim();
}

function linkOf(it) {
  if (typeof it.link === 'string') return it.link;
  if (Array.isArray(it.link)) {
    const alt = it.link.find((l) => l?.['@_rel'] === 'alternate') ?? it.link[0];
    return alt?.['@_href'] ?? '';
  }
  if (it.link?.['@_href']) return it.link['@_href'];
  return text(it.link) || it.guid?.['#text'] || text(it.guid) || '';
}

/** Parse an RSS or Atom feed into normalized items. Pure (xml in, items out). */
export function parseFeed(xml, org) {
  const j = parser.parse(xml);
  const raw = j?.rss?.channel?.item ?? j?.feed?.entry ?? [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const items = [];
  for (const it of arr) {
    const title = stripHtml(text(it.title));
    if (!title) continue;
    const link = linkOf(it);
    const date = text(it.pubDate || it.updated || it.published || it['dc:date'] || '');
    const summary = stripHtml(text(it.description || it.summary || it['content:encoded'] || '')).slice(0, 280);
    items.push({ id: `${org}:${link || title}`, org, title, link, date, summary });
  }
  return items;
}

/**
 * Parse EARLI's (earli.org/news) rendered HTML. Each news card is an
 * <article ... list-element ...> with a leading "DD MON YYYY" date, a title link
 * into /news/, and the title text. Pure (rendered HTML in, items out).
 */
export function parseEarli(html) {
  const items = [];
  const seen = new Set();
  const blocks = html.match(/<article[^>]*list-element[^>]*>[\s\S]*?<\/article>/gi) || [];
  for (const b of blocks) {
    const title = stripHtml((b.match(/list-element__title[^>]*>([\s\S]*?)<\/h\d>/i) || [])[1] || '');
    if (!title) continue;
    const date = stripHtml((b.match(/list-element__date[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '')
      || (b.match(/(\d{1,2}\s+[A-Za-z]{3,}\s+20\d\d)/) || [])[1] || '';
    const summary = stripHtml((b.match(/list-element__description[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || '').slice(0, 280);
    const link = (b.match(/list-element__link[\s\S]*?href="([^"]+)"/i) || b.match(/href="([^"]+\/news\/[^"]+)"/i) || [])[1] || '';
    const id = `EARLI:${link || title}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({ id, org: 'EARLI', title, link, date, summary });
  }
  return items;
}

/**
 * Parse iLRN (immersivelrn.org, Invision Community). Events live as
 * <a href=".../events/event/NNN-slug/">TITLE</a>; the carousel repeats them, so
 * de-dup by the numeric event id. Pure (stealth-fetched HTML in, items out).
 */
export function parseIlrn(html) {
  const items = [];
  const seen = new Set();
  const re = /<a[^>]+href="([^"]*\/events\/event\/(\d+)-[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const link = m[1];
    const eid = m[2];
    if (seen.has(eid)) continue;
    const title = stripHtml(m[3]).replace(/^(Next|Previous)\s+carousel\s+slide\s*/i, '').trim();
    if (title.length < 6 || title.length > 140) continue;
    seen.add(eid);
    items.push({ id: `iLRN:${eid}`, org: 'iLRN', title, link, date: '', summary: '' });
  }
  return items;
}

const EXTRACTORS = { earli: parseEarli, ilrn: parseIlrn };

// Render a JS page to HTML with Playwright (dynamic import so RSS-only use and
// the unit tests never load the browser). Used for type:'html' sources.
async function fetchRenderedHtml(url) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ userAgent: UA });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(2000);
    return await page.content();
  } finally {
    await browser.close();
  }
}

function withinDays(dateStr, days, now) {
  if (!days || !dateStr) return true;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return true;
  return (now - d) / (1000 * 60 * 60 * 24) <= days;
}

const FEED_HEADERS = {
  'User-Agent': UA,
  // Some society WAFs (e.g. ISLS) 403 a bare/RSS Accept header; a full browser
  // header set (incl. Accept-Encoding) is required.
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, fetchImpl, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetchImpl(url, { headers: FEED_HEADERS });
      if (res.ok) return res.text();
      lastErr = new Error(`HTTP ${res.status}`);
      if (res.status !== 403 && res.status !== 429 && res.status < 500) break; // only retry WAF/transient
    } catch (e) {
      lastErr = e;
    }
    if (i < attempts - 1) await sleep(800 * (i + 1));
  }
  throw lastErr;
}

/**
 * Harvest all configured sources, classify each item, and split into cfp/news.
 * Per-source failures are isolated. Returns { cfp, news, errors }.
 */
export async function fetchIntlSources({
  sources = INTL_SOURCES,
  sinceDays = 0,
  fetchImpl = fetch,
  now = new Date(),
} = {}) {
  const cfp = [];
  const news = [];
  const errors = [];
  const results = await Promise.allSettled(sources.map(async (s) => {
    if (s.type === 'rss') {
      const xml = await fetchText(s.url, fetchImpl);
      return { source: s, items: parseFeed(xml, s.org) };
    }
    if (s.type === 'html' && EXTRACTORS[s.extract]) {
      const html = await fetchRenderedHtml(s.url);
      return { source: s, items: EXTRACTORS[s.extract](html) };
    }
    if (s.type === 'stealth' && EXTRACTORS[s.extract]) {
      const html = await fetchStealthHtml(s.url);
      return { source: s, items: EXTRACTORS[s.extract](html) };
    }
    return { source: s, items: [] };
  }));
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'rejected') { errors.push({ org: sources[i].org, error: r.reason?.message || String(r.reason) }); continue; }
    for (const it of r.value.items) {
      if (!withinDays(it.date, sinceDays, now)) continue;
      const enriched = { ...it, label: r.value.source.label };
      (classifyItem(it) === 'cfp' ? cfp : news).push(enriched);
    }
  }
  const byDate = (a, b) => new Date(b.date || 0) - new Date(a.date || 0);
  cfp.sort(byDate); news.sort(byDate);
  return { cfp, news, errors };
}
