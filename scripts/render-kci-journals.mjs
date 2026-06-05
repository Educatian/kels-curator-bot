// Demo: harvest latest articles + abstracts for the KCI-indexed Korean journals.
// Usage: node scripts/render-kci-journals.mjs [year] [maxPerJournal]
// Key from KCI_API_KEY env or C:\Users\jewoo\Desktop\token_kci.txt.
import { readFileSync } from 'node:fs';
import { fetchJournalArticles, KCI_JOURNALS } from '../src/kci.js';

const year = process.argv[2] || String(new Date().getFullYear());
const max = Number(process.argv[3] || 4);
const key = process.env.KCI_API_KEY || safeRead('C:\\Users\\jewoo\\Desktop\\token_kci.txt');
function safeRead(p) { try { return readFileSync(p, 'utf8').trim(); } catch { return null; } }
if (!key) { console.error('No KCI key (KCI_API_KEY or Desktop\\token_kci.txt).'); process.exit(1); }

for (const j of KCI_JOURNALS) {
  const { articles, resultMsg } = await fetchJournalArticles({ key, journalName: j.name, year, max });
  console.log(`\n=== ${j.name} (${j.society}) — ${year} — ${articles.length} article(s)${resultMsg ? ` [${resultMsg}]` : ''} ===`);
  for (const a of articles) {
    console.log(`\n• ${a.titleKo}  [${a.volume}권 ${a.issue}호, ${a.pubYear}.${a.pubMon}]`);
    console.log(`  저자: ${a.authors.join(', ')}`);
    if (a.doi) console.log(`  DOI: ${a.doi}`);
    console.log(`  초록: ${a.abstractKo.slice(0, 180)}${a.abstractKo.length > 180 ? '…' : ''}`);
  }
}
