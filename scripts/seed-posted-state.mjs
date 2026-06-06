// One-time: mark every CURRENT feed item as already-posted, WITHOUT sending any
// Discord message. This "installs" the curation system so the weekly schedulers
// only post items that appear from now on (no backlog spam, no past items).
// Run once after enabling the feeds: node scripts/seed-posted-state.mjs
import 'dotenv/config';
import { loadConfig } from '../src/config.js';
import { JsonStore } from '../src/storage.js';
import { fetchIntlSources } from '../src/intl-sources.js';
import { fetchKsetUpdates } from '../src/kset-board.js';
import { fetchKaeimUpdates } from '../src/kaeim-board.js';
import { fetchJournalArticles, KCI_JOURNALS } from '../src/kci.js';

const config = loadConfig();
const store = new JsonStore(config.dataDir);
const state = await store.getState();

const merge = (existing, fresh, cap) => [...new Set([...fresh, ...(existing ?? [])])].slice(0, cap);
const kciArticleId = (a) => a.doi || a.url || a.articleId || `${a.journal}-${a.volume}-${a.issue}-${(a.titleKo || '').slice(0, 24)}`;

// 1) International feeds (the main backlog risk — postedIntlItemIds was empty).
let intlIds = [];
try {
  const { cfp, news, errors } = await fetchIntlSources({ sinceDays: config.intlFeedsLookbackDays });
  intlIds = [...cfp, ...news].map((i) => i.id);
  if (errors.length) console.warn('  intl partial errors:', errors.map((e) => e.org).join(', '));
  console.log(`intl: ${intlIds.length} current items -> seeded`);
} catch (e) { console.warn('intl seed failed:', e.message); }

// 2) KCI journals (current year, fall back to previous if empty).
const kciIds = [];
if (config.kciApiKey) {
  for (const j of KCI_JOURNALS) {
    const year = String(new Date().getFullYear());
    let { articles } = await fetchJournalArticles({ key: config.kciApiKey, journalName: j.name, searchTerm: j.searchTerm, year, max: 20 });
    if (!articles.length) ({ articles } = await fetchJournalArticles({ key: config.kciApiKey, journalName: j.name, searchTerm: j.searchTerm, year: String(Number(year) - 1), max: 20 }));
    kciIds.push(...articles.map(kciArticleId));
  }
  console.log(`kci: ${kciIds.length} current articles -> seeded`);
}

// 3) KSET + 4) KAEIM boards.
let ksetIds = [];
try { ksetIds = (await fetchKsetUpdates({ sinceDays: config.ksetUpdatesLookbackDays })).items.map((i) => i.id); } catch (e) { console.warn('kset:', e.message); }
let kaeimIds = [];
try { kaeimIds = (await fetchKaeimUpdates({ sinceDays: config.kaeimUpdatesLookbackDays })).items.map((i) => i.id); } catch (e) { console.warn('kaeim:', e.message); }
console.log(`kset: ${ksetIds.length} · kaeim: ${kaeimIds.length} -> seeded`);

await store.setStateValue('postedIntlItemIds', merge(state.postedIntlItemIds, intlIds, 600));
await store.setStateValue('postedKciArticleIds', merge(state.postedKciArticleIds, kciIds, 600));
await store.setStateValue('postedKsetItemIds', merge(state.postedKsetItemIds, ksetIds, 400));
await store.setStateValue('postedKaeimItemIds', merge(state.postedKaeimItemIds, kaeimIds, 400));
await store.setStateValue('seededAt', new Date().toISOString());

console.log('\nDone. No Discord messages sent. Schedulers will now post only NEW items.');
