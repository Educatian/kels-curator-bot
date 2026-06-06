// KCI Open API harvester — article metadata WITH abstracts for Korean journals.
//
// This is the only clean source of abstracts for our target journals: ACOMS
// (교육공학연구) is network-blocked, and JAMS/KCI-portal/DBpia are JS/login/Cloudflare
// walls. The KCI Open API (open.kci.go.kr) returns structured XML including the
// abstract directly in articleSearch — no per-article second call needed.
//
// articleSearch is title-keyword based (recognized params: title, year, page,
// displayCount), so we query with the journal name as the keyword and then filter
// to an exact journal-name match (the keyword also matches other journals' titles
// that mention it). Requires a free key (open.kci.go.kr -> 로그인 -> OpenAPI 인증키).

import { XMLParser } from 'fast-xml-parser';

const ENDPOINT = 'https://open.kci.go.kr/po/openapi/openApiSearch.kci';
const parser = new XMLParser({ ignoreAttributes: false, cdataPropName: '__cdata' });

function cdata(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  return String(node.__cdata ?? node['#text'] ?? '').trim();
}

function asArray(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

// Pick a language variant from a repeated lang-tagged group (title/abstract).
function pickLang(group, childKey, langs) {
  const items = asArray(group?.[childKey]);
  if (items.length === 0) return '';
  for (const lang of langs) {
    const hit = items.find((it) => String(it?.['@_lang'] ?? '').toLowerCase() === lang);
    if (hit) return cdata(hit);
  }
  return cdata(items[0]);
}

/** Normalize one KCI <record> into a flat article object. */
export function normalizeKciRecord(rec) {
  const j = rec?.journalInfo ?? {};
  const a = rec?.articleInfo ?? {};
  const authors = asArray(a['author-group']?.author)
    .map((x) => String(x?.['#text'] ?? '').replace(/\s*\(.*?\)\s*/g, '').trim())
    .filter(Boolean);
  return {
    journal: String(j['journal-name'] ?? '').trim(),
    publisher: String(j['publisher-name'] ?? '').trim(),
    volume: j.volume ?? null,
    issue: j.issue ?? null,
    pubYear: Number(j['pub-year']) || null,
    pubMon: Number(j['pub-mon']) || null,
    titleKo: pickLang(a['title-group'], 'article-title', ['original']),
    titleEn: pickLang(a['title-group'], 'article-title', ['english', 'foreign']),
    authors,
    abstractKo: pickLang(a['abstract-group'], 'abstract', ['original']),
    abstractEn: pickLang(a['abstract-group'], 'abstract', ['english', 'foreign']),
    doi: cdata(a.doi),
    uci: cdata(a.uci),
    url: cdata(a.url),
    articleId: String(a['@_article-id'] ?? '').trim(),
    citationCount: Number(a['citation-count']) || 0,
  };
}

/** Raw articleSearch call. Returns { total, articles, resultMsg }. */
export async function kciSearchArticles({
  key,
  title,
  year,
  page = 1,
  displayCount = 100,
  fetchImpl = fetch,
}) {
  if (!key) throw new Error('KCI API key is required (KCI_API_KEY / token_kci.txt).');
  const qs = new URLSearchParams({
    apiCode: 'articleSearch',
    key,
    title,
    page: String(page),
    displayCount: String(displayCount),
  });
  if (year) qs.set('year', String(year));
  const res = await fetchImpl(`${ENDPOINT}?${qs}`, { headers: { 'User-Agent': 'kels-curator-bot/kci' } });
  if (!res.ok) throw new Error(`KCI API HTTP ${res.status}`);
  const json = parser.parse(await res.text());
  const out = json?.MetaData?.outputData ?? {};
  const resultMsg = out?.result?.resultMsg ?? null;
  if (resultMsg) return { total: 0, articles: [], resultMsg };
  const total = Number(out?.result?.total) || 0;
  const articles = asArray(out.record).map(normalizeKciRecord);
  return { total, articles, resultMsg: null };
}

function recencyKey(x) {
  // Sort newest first by year, month, volume, issue.
  return [x.pubYear || 0, x.pubMon || 0, Number(x.volume) || 0, Number(x.issue) || 0];
}

/**
 * Fetch a specific journal's articles (with abstracts) for a year, newest first.
 * Queries by journal name and keeps only exact journal-name matches.
 */
export async function fetchJournalArticles({
  key,
  journalName,
  searchTerm,
  year,
  max = 12,
  displayCount = 100,
  fetchImpl = fetch,
}) {
  // articleSearch is title-keyword based: some journal names appear in article
  // titles (good search term), others don't, so allow a distinct searchTerm and
  // always filter to the exact journalName.
  const { articles, resultMsg } = await kciSearchArticles({
    key, title: searchTerm || journalName, year, displayCount, fetchImpl,
  });
  if (resultMsg) return { articles: [], resultMsg };
  const own = articles.filter((a) => a.journal === journalName);
  own.sort((a, b) => {
    const ka = recencyKey(a), kb = recencyKey(b);
    for (let i = 0; i < ka.length; i++) if (kb[i] !== ka[i]) return kb[i] - ka[i];
    return 0;
  });
  return { articles: own.slice(0, max), resultMsg: null };
}

// The journals we can harvest abstracts for (학습과학연구 deferred: not yet published).
export const KCI_JOURNALS = [
  { name: '교육공학연구', society: '한국교육공학회' },
  { name: '교육정보미디어연구', society: '한국교육정보미디어학회' },
  { name: '교육방법연구', society: '한국교육방법학회', searchTerm: '교육방법연구' },
  { name: '컴퓨터교육학회 논문지', society: '한국컴퓨터교육학회', searchTerm: '컴퓨터교육' },
];
