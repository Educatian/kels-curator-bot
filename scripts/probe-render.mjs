// Render a JS page with Playwright and dump candidate news/CFP items so we can
// learn the DOM structure before writing a scraper. Usage:
//   node scripts/probe-render.mjs <url>
import { chromium } from 'playwright';

const url = process.argv[2];
if (!url) { console.error('usage: node scripts/probe-render.mjs <url>'); process.exit(1); }

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36' });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const data = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a'))
      .map((a) => ({ href: a.href, text: (a.textContent || '').replace(/\s+/g, ' ').trim() }))
      .filter((a) => a.text.length > 18 && a.text.length < 140 && /^https?:/.test(a.href));
    // dedup by text
    const seen = new Set(); const uniq = [];
    for (const a of anchors) { if (seen.has(a.text)) continue; seen.add(a.text); uniq.push(a); }
    // visible date-ish strings
    const dates = (document.body.innerText.match(/\b(\d{1,2}\s+\w+\s+20\d\d|\w+\s+\d{1,2},?\s+20\d\d|20\d\d-\d\d-\d\d)\b/g) || []).slice(0, 8);
    return { title: document.title, anchorCount: uniq.length, sample: uniq.slice(0, 18), dates };
  });
  console.log('TITLE:', data.title);
  console.log('DATES:', data.dates);
  console.log('ANCHORS (', data.anchorCount, '):');
  for (const a of data.sample) console.log('  •', a.text.slice(0, 80), '->', a.href.slice(0, 70));
} finally {
  await browser.close();
}
