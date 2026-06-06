import { describe, expect, it } from 'vitest';
import { parseFeed, classifyItem, fetchIntlSources, parseEarli } from '../src/intl-sources.js';

const EARLI_HTML = `
<div>
<article class="card wysiwyg list-element list-element--news">
  <div class="list-element__content">
    <div class="list-element__date"><time datetime="">09 Mar 2026</time></div>
    <h3 class="list-element__title">JURE Research Development Fund 2026 - Applications are now open!</h3>
    <p class="list-element__description">We welcome applications until 8 May 2026.</p>
    <p class="list-element__link"><a href="https://www.earli.org/news/jure-research-development-fund-2026" class="button">Read more</a></p>
  </div>
</article>
<article class="card wysiwyg list-element list-element--news">
  <div class="list-element__content">
    <div class="list-element__date"><time datetime="">03 Mar 2026</time></div>
    <h3 class="list-element__title">Publication Alert: New Issue Learning and Instruction (Volume 102)</h3>
    <p class="list-element__description">A new issue is available.</p>
    <p class="list-element__link"><a href="https://www.earli.org/news/publication-alert-li-102" class="button">Read more</a></p>
  </div>
</article>
</div>`;

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>ISLS</title>
  <item>
    <title>Call for Proposals: ISLS Affiliates Programme 2026-2028</title>
    <link>https://www.isls.org/cfp-affiliates/</link>
    <pubDate>Wed, 11 Feb 2026 10:00:00 +0000</pubDate>
    <description><![CDATA[<p>Submissions are now open for the affiliates programme.</p>]]></description>
  </item>
  <item>
    <title>2026 ISLS Annual Meeting Registration Now Open!</title>
    <link>https://www.isls.org/registration/</link>
    <pubDate>Thu, 19 Mar 2026 10:00:00 +0000</pubDate>
    <description>Register for the annual meeting.</description>
  </item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Workshop announcement</title>
    <link rel="alternate" href="https://example.org/ws"/>
    <updated>2026-03-01T00:00:00Z</updated>
    <summary>A community workshop recap.</summary>
  </entry>
</feed>`;

describe('classifyItem', () => {
  it('flags solicitations as CFP and the rest as news', () => {
    expect(classifyItem({ title: 'Call for Proposals: ICLS 2027' })).toBe('cfp');
    expect(classifyItem({ title: 'CFP — workshops' })).toBe('cfp');
    expect(classifyItem({ title: 'Webinar recap', summary: 'submission deadline March 1' })).toBe('cfp');
    expect(classifyItem({ title: 'Annual Meeting Registration Now Open' })).toBe('news');
    expect(classifyItem({ title: 'New board members announced' })).toBe('news');
  });
});

describe('parseFeed', () => {
  it('parses RSS items (title/link/date/summary, CDATA stripped)', () => {
    const items = parseFeed(RSS, 'ISLS');
    expect(items).toHaveLength(2);
    expect(items[0].title).toContain('Call for Proposals');
    expect(items[0].link).toBe('https://www.isls.org/cfp-affiliates/');
    expect(items[0].summary).toContain('Submissions are now open');
    expect(items[0].summary).not.toContain('<p>'); // html stripped
    expect(items[0].id).toBe('ISLS:https://www.isls.org/cfp-affiliates/');
  });

  it('parses Atom entries with rel=alternate link', () => {
    const items = parseFeed(ATOM, 'TEST');
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Workshop announcement');
    expect(items[0].link).toBe('https://example.org/ws');
  });
});

describe('parseEarli', () => {
  it('extracts title/date/link from EARLI news cards and strips the leading date', () => {
    const items = parseEarli(EARLI_HTML);
    expect(items).toHaveLength(2);
    expect(items[0].org).toBe('EARLI');
    expect(items[0].title).toBe('JURE Research Development Fund 2026 - Applications are now open!');
    expect(items[0].title).not.toMatch(/^\d/); // date not part of title
    expect(items[0].date).toBe('09 Mar 2026');
    expect(items[0].summary).toContain('applications');
    expect(items[0].link).toContain('/news/jure-research');
    expect(classifyItem(items[0])).toBe('cfp');   // "applications are now open" -> cfp
    expect(classifyItem(items[1])).toBe('news');  // "publication alert" -> news
  });
});

describe('fetchIntlSources', () => {
  const fakeFetch = async () => ({ ok: true, status: 200, text: async () => RSS });

  it('splits into cfp/news, applies date window, and isolates source errors', async () => {
    const sources = [{ id: 'isls', org: 'ISLS', label: 'ISLS', type: 'rss', url: 'x' }];
    const now = new Date('2026-03-20T00:00:00Z');
    const { cfp, news, errors } = await fetchIntlSources({ sources, fetchImpl: fakeFetch, now, sinceDays: 0 });
    expect(errors).toHaveLength(0);
    expect(cfp.map((i) => i.title)[0]).toContain('Call for Proposals');
    expect(news.map((i) => i.title)[0]).toContain('Registration');

    // 15-day window from 2026-03-20 keeps the 03-19 news, drops the 02-11 CFP.
    const recent = await fetchIntlSources({ sources, fetchImpl: fakeFetch, now, sinceDays: 15 });
    expect(recent.cfp).toHaveLength(0);
    expect(recent.news).toHaveLength(1);
  });

  it('records a per-source error instead of throwing', async () => {
    const badFetch = async () => ({ ok: false, status: 403, text: async () => '' });
    const sources = [{ id: 'isls', org: 'ISLS', label: 'ISLS', type: 'rss', url: 'x' }];
    const { errors } = await fetchIntlSources({ sources, fetchImpl: badFetch });
    expect(errors).toHaveLength(1);
    expect(errors[0].org).toBe('ISLS');
  });
});
