import { describe, expect, it } from 'vitest';
import { normalizeKciRecord, kciSearchArticles, fetchJournalArticles } from '../src/kci.js';

// Mirrors the real KCI articleSearch XML: lang-tagged title/abstract arrays, author
// "#text" with affiliation in parens, doi/url as CDATA, and a mixed-journal result
// set (the keyword search returns other journals that mention the name in a title).
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<MetaData><outputData>
  <result><total>3</total></result>
  <record>
    <journalInfo><journal-name>교육공학연구</journal-name><publisher-name>한국교육공학회</publisher-name>
      <pub-year>2026</pub-year><pub-mon>3</pub-mon><volume>42</volume><issue>1</issue></journalInfo>
    <articleInfo article-id="ART111">
      <title-group>
        <article-title lang="original"><![CDATA[융합적 사고 발달 과정 탐구]]></article-title>
        <article-title lang="english"><![CDATA[Convergent thinking development]]></article-title>
      </title-group>
      <author-group><author english="Lee">이승록(부산대학교)</author><author english="Park">박정환(부산대학교)</author></author-group>
      <abstract-group><abstract lang="original"><![CDATA[본 연구는 융합적 사고 발달 과정을 탐구한다.]]></abstract></abstract-group>
      <doi><![CDATA[10.17232/KSET.42.1.1]]></doi><url><![CDATA[https://kci.go.kr/a/ART111]]></url>
      <citation-count>0</citation-count>
    </articleInfo>
  </record>
  <record>
    <journalInfo><journal-name>교육공학연구</journal-name><publisher-name>한국교육공학회</publisher-name>
      <pub-year>2025</pub-year><pub-mon>11</pub-mon><volume>41</volume><issue>3</issue></journalInfo>
    <articleInfo article-id="ART222">
      <title-group><article-title lang="original"><![CDATA[처방적 문제해결 연구 동향]]></article-title></title-group>
      <author-group><author>조영환(서울대학교)</author></author-group>
      <abstract-group><abstract lang="original"><![CDATA[교육공학은 처방적 학문이다.]]></abstract></abstract-group>
      <doi></doi><url><![CDATA[https://kci.go.kr/a/ART222]]></url>
    </articleInfo>
  </record>
  <record>
    <journalInfo><journal-name>교육정보미디어연구</journal-name><publisher-name>한국교육정보미디어학회</publisher-name>
      <pub-year>2026</pub-year><pub-mon>2</pub-mon><volume>32</volume><issue>1</issue></journalInfo>
    <articleInfo article-id="ART333">
      <title-group><article-title lang="original"><![CDATA[교육공학연구 인용 분석]]></article-title></title-group>
      <author-group><author>조규락(영남대학교)</author></author-group>
      <abstract-group><abstract lang="original"><![CDATA[다른 저널 논문이지만 제목에 교육공학연구가 들어감.]]></abstract></abstract-group>
    </articleInfo>
  </record>
</outputData></MetaData>`;

const fakeFetch = async () => ({ ok: true, status: 200, text: async () => XML });

describe('normalizeKciRecord', () => {
  it('extracts title/abstract by language, strips author affiliations, reads CDATA doi/url', async () => {
    const { articles } = await kciSearchArticles({ key: 'x', title: '교육공학연구', fetchImpl: fakeFetch });
    const a = articles[0];
    expect(a.journal).toBe('교육공학연구');
    expect(a.titleKo).toBe('융합적 사고 발달 과정 탐구');
    expect(a.titleEn).toContain('Convergent');
    expect(a.authors).toEqual(['이승록', '박정환']); // affiliation parens stripped
    expect(a.abstractKo).toContain('융합적 사고');
    expect(a.doi).toBe('10.17232/KSET.42.1.1'); // CDATA, not "[object Object]"
    expect(a.url).toBe('https://kci.go.kr/a/ART111');
    expect(a.articleId).toBe('ART111');
  });
});

describe('kciSearchArticles', () => {
  it('returns resultMsg (and no articles) when the API reports an error', async () => {
    const errFetch = async () => ({ ok: true, status: 200, text: async () =>
      '<MetaData><outputData><result><resultMsg>등록되지 않은 key 입니다.</resultMsg></result></outputData></MetaData>' });
    const r = await kciSearchArticles({ key: 'bad', title: 'x', fetchImpl: errFetch });
    expect(r.resultMsg).toContain('key');
    expect(r.articles).toHaveLength(0);
  });
});

describe('fetchJournalArticles', () => {
  it('keeps only exact journal-name matches and sorts newest issue first', async () => {
    const { articles } = await fetchJournalArticles({ key: 'x', journalName: '교육공학연구', fetchImpl: fakeFetch });
    expect(articles.map((a) => a.articleId)).toEqual(['ART111', 'ART222']); // ART333 (other journal) filtered out
    expect(articles[0].pubYear).toBe(2026); // 42권 1호 2026 before 41권 3호 2025
  });

  it('respects max', async () => {
    const { articles } = await fetchJournalArticles({ key: 'x', journalName: '교육공학연구', max: 1, fetchImpl: fakeFetch });
    expect(articles).toHaveLength(1);
    expect(articles[0].articleId).toBe('ART111');
  });
});
