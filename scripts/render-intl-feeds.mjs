// Demo: harvest international edtech-society feeds and show the CFP/news split.
// Usage: node scripts/render-intl-feeds.mjs [sinceDays]
import { fetchIntlSources, INTL_SOURCES } from '../src/intl-sources.js';

const sinceDays = Number(process.argv[2] || 0);
console.log(`Sources: ${INTL_SOURCES.map((s) => s.org).join(', ')}`);
const { cfp, news, errors } = await fetchIntlSources({ sinceDays });
if (errors.length) console.log('Errors:', errors);
console.log(`\n📝 CFP (${cfp.length}) -> #cfp-rfp`);
for (const i of cfp.slice(0, 12)) console.log(`  [${i.org}] ${(i.date || '').slice(0, 16)}  ${i.title}`);
console.log(`\n📰 NEWS (${news.length}) -> 자유게시판`);
for (const i of news.slice(0, 12)) console.log(`  [${i.org}] ${(i.date || '').slice(0, 16)}  ${i.title}`);
