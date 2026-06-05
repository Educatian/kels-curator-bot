// Probe the KCI Open API once a key exists. Confirms articleSearch -> articleDetail
// (abstract) field names so the harvester can be finalized.
//
// Get a free key: open.kci.go.kr -> 로그인(jewoong87) -> OpenAPI 인증키 발급.
// Save it to C:\Users\jewoo\Desktop\token_kci.txt (or pass as argv[1]).
//
// Usage: node scripts/probe-kci.mjs ["저널/검색 키워드"] [year]
import { readFileSync } from 'node:fs';
import { XMLParser } from 'fast-xml-parser';

const ENDPOINT = 'https://open.kci.go.kr/po/openapi/openApiSearch.kci';
const KEY = (process.argv.includes('--key') ? process.argv[process.argv.indexOf('--key') + 1] : null)
  ?? safeRead('C:\\Users\\jewoo\\Desktop\\token_kci.txt');
const title = process.argv[2] || '교육공학';        // articleSearch is title-keyword based
const year = process.argv[3] || '2026';

function safeRead(p) { try { return readFileSync(p, 'utf8').trim(); } catch { return null; } }

if (!KEY) {
  console.error('No KCI key. Put it in C:\\Users\\jewoo\\Desktop\\token_kci.txt or pass --key <KEY>.');
  process.exit(1);
}

const parser = new XMLParser({ ignoreAttributes: false, cdataPropName: '__cdata' });

async function call(params) {
  const qs = new URLSearchParams({ key: KEY, ...params });
  const res = await fetch(`${ENDPOINT}?${qs}`, { headers: { 'User-Agent': 'kels-curator-bot/kci-probe' } });
  const text = await res.text();
  return { text, json: parser.parse(text) };
}

console.log(`== articleSearch  title="${title}" year=${year} ==`);
const search = await call({ apiCode: 'articleSearch', title, year, displayCount: '5' });
const msg = search.json?.MetaData?.outputData?.result?.resultMsg;
if (msg) { console.log('resultMsg:', msg); console.log(search.text.slice(0, 600)); process.exit(0); }

// Dump the raw structure so we can lock field names.
console.log(JSON.stringify(search.json?.MetaData?.outputData ?? search.json, null, 2).slice(0, 2500));

// Try to pull the first article id and fetch its detail (abstract).
const recs = search.json?.MetaData?.outputData?.record ?? search.json?.MetaData?.outputData?.records?.record;
const first = Array.isArray(recs) ? recs[0] : recs;
const id = first?.artiId || first?.id || first?.artiID;
if (id) {
  console.log(`\n== articleDetail id=${id} (abstract) ==`);
  const detail = await call({ apiCode: 'articleDetail', id: String(id) });
  console.log(detail.text.slice(0, 2500));
}
