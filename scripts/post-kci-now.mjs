// One-off: post the inaugural KCI journal-abstract digest now.
// Usage: node scripts/post-kci-now.mjs [channelId] [year]
// Defaults: #cfp-rfp, current year (falls back to previous year per journal).
import 'dotenv/config';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { loadConfig } from '../src/config.js';
import { JsonStore } from '../src/storage.js';
import { fetchJournalArticles, KCI_JOURNALS } from '../src/kci.js';

const CFP_RFP = '1028825450832724078';
const channelId = process.argv[2] || CFP_RFP;
const year = process.argv[3] || String(new Date().getFullYear());

const config = loadConfig();
if (!config.kciApiKey) { console.error('No KCI_API_KEY in env.'); process.exit(1); }
const store = new JsonStore(config.dataDir);
const state = await store.getState();
const posted = new Set(state.postedKciArticleIds ?? []);

function kciArticleId(a) {
  return a.doi || a.url || a.articleId || `${a.journal}-${a.volume}-${a.issue}-${(a.titleKo || '').slice(0, 24)}`;
}
function block(journal, articles) {
  const blocks = articles.map((a) => {
    const authors = a.authors.length ? a.authors.slice(0, 4).join(', ') + (a.authors.length > 4 ? ' 외' : '') : '';
    const where = [a.volume && `${a.volume}권`, a.issue && `${a.issue}호`, a.pubYear && `${a.pubYear}.${a.pubMon || ''}`].filter(Boolean).join(' ');
    const linkTitle = (a.url || a.doi) ? `[${a.titleKo}](${a.url || a.doi})` : a.titleKo;
    const abs = (a.abstractKo || '').replace(/\s+/g, ' ').trim();
    const excerpt = abs ? `> ${abs.slice(0, 220)}${abs.length > 220 ? '…' : ''}` : '';
    return [`**${linkTitle}**`, `${authors}${where ? ` · ${where}` : ''}`, excerpt].filter(Boolean).join('\n');
  });
  return [`## 📚 ${journal.name} 최신 논문 (초록)`, `_${journal.society} · KCI 색인 기준_`, '', blocks.join('\n\n')].join('\n');
}

const newIds = [];
const messages = [];
const intro = '> 📡 **새 기능**: 한국 대표 교육공학 저널(교육공학연구·교육정보미디어연구)의 최신 논문을 **초록과 함께** 매주(화) 모아드립니다. KCI 색인 기준 첫 다이제스트입니다.';
for (const j of KCI_JOURNALS) {
  let { articles } = await fetchJournalArticles({ key: config.kciApiKey, journalName: j.name, year, max: config.kciDigestMaxPerJournal });
  if (!articles.length) ({ articles } = await fetchJournalArticles({ key: config.kciApiKey, journalName: j.name, year: String(Number(year) - 1), max: config.kciDigestMaxPerJournal }));
  const fresh = articles.filter((a) => !posted.has(kciArticleId(a)));
  if (!fresh.length) continue;
  fresh.forEach((a) => newIds.push(kciArticleId(a)));
  let content = block(j, fresh);
  while (fresh.length > 1 && content.length > 1990) { fresh.pop(); content = block(j, fresh); }
  messages.push(content.slice(0, 2000));
}

if (!messages.length) { console.log('Nothing fresh to post.'); process.exit(0); }

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once(Events.ClientReady, async () => {
  try {
    const channel = await client.channels.fetch(channelId);
    await channel.send({ content: intro });
    for (const m of messages) await channel.send({ content: m });
    await store.setStateValue('postedKciArticleIds', [...newIds, ...(state.postedKciArticleIds ?? [])].slice(0, 600));
    await store.setStateValue('lastManualKciDigestAt', new Date().toISOString());
    console.log(`Posted KCI inaugural digest to ${channelId}: ${newIds.length} article(s) across ${messages.length} message(s).`);
  } finally {
    client.destroy();
  }
});
await client.login(config.discordToken);
