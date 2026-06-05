// One-off: post the inaugural KSET + KAEIM Korean-society digest now.
// Usage: node scripts/post-korean-updates-now.mjs [channelId] [lookbackDays]
// Defaults: channel #cfp-rfp, 90-day lookback. Marks items posted so the Friday
// scheduler will not repost them.
import 'dotenv/config';
import { ChannelType, Client, Events, GatewayIntentBits } from 'discord.js';
import { loadConfig } from '../src/config.js';
import { JsonStore } from '../src/storage.js';
import { fetchKsetUpdates } from '../src/kset-board.js';
import { fetchKaeimUpdates, KAEIM_NOTICE_URL } from '../src/kaeim-board.js';

const CFP_RFP_CHANNEL_ID = '1028825450832724078';
const channelId = process.argv[2] || CFP_RFP_CHANNEL_ID;
const lookbackDays = Number(process.argv[3] || 90);
const MAX = 8;

const config = loadConfig();
const store = new JsonStore(config.dataDir);
const state = await store.getState();

const ksetSeen = new Set(state.postedKsetItemIds ?? []);
const kaeimSeen = new Set(state.postedKaeimItemIds ?? []);

const { items: ksetItems } = await fetchKsetUpdates({ sinceDays: lookbackDays });
const { items: kaeimItems } = await fetchKaeimUpdates({ sinceDays: lookbackDays });
const ksetFresh = ksetItems.filter((it) => !ksetSeen.has(it.id)).slice(0, MAX);
const kaeimFresh = kaeimItems.filter((it) => !kaeimSeen.has(it.id)).slice(0, MAX);

const kindEmoji = { notice: '📢', proceedings: '📑', event: '📅', newsletter: '📰' };

function ksetBlock(items, intro) {
  const lines = items.map((it) => {
    const emoji = kindEmoji[it.kind] || '•';
    const date = it.date ? `\`${it.date}\` ` : '';
    return `${emoji} ${date}[${it.title}](${it.url}) — _${it.boardLabel}_`;
  });
  return [
    intro,
    '## 🇰🇷 한국교육공학회(KSET) 새 소식',
    '지난 기간 kset.or.kr 공지·학술대회 발표논문(자료집)·행사·뉴스레터에서 올라온 항목입니다.',
    '',
    ...lines,
    '',
    '_출처: 한국교육공학회 kset.or.kr · 학회지 「교육공학연구」 발간 소식 포함_',
  ].filter((l) => l !== null).join('\n');
}

function kaeimBlock(items) {
  const lines = items.map((it) => {
    const date = it.date ? `\`${it.date}\` ` : '';
    const who = it.author ? ` _(${it.author})_` : '';
    return `📢 ${date}${it.title}${who}`;
  });
  return [
    '## 🇰🇷 한국교육정보미디어학회(KAEIM) 새 소식',
    `최근 [학회 공지 보드](${KAEIM_NOTICE_URL})에 올라온 항목입니다 (학회지 「교육정보미디어연구」 발간·접수 소식 포함).`,
    '',
    ...lines,
    '',
    '_출처: 한국교육정보미디어학회 kaeim.jams.or.kr_',
  ].join('\n');
}

const intro = '> 📡 **새 기능**: 이제 KELS Curator가 매주(금) 한국교육공학회·한국교육정보미디어학회 공지·CFP·학술대회·발간 소식을 자동으로 모아드립니다. 첫 다이제스트입니다.';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once(Events.ClientReady, async () => {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased?.() || channel.type === ChannelType.GuildForum) {
      throw new Error(`Channel ${channelId} is not a postable text channel.`);
    }
    let posted = 0;
    if (ksetFresh.length) { await channel.send({ content: ksetBlock(ksetFresh, intro).slice(0, 2000) }); posted++; }
    if (kaeimFresh.length) { await channel.send({ content: kaeimBlock(kaeimFresh).slice(0, 2000) }); posted++; }
    if (!posted) { console.log('Nothing fresh to post.'); return; }

    await store.setStateValue('postedKsetItemIds', [
      ...ksetFresh.map((it) => it.id), ...(state.postedKsetItemIds ?? []),
    ].slice(0, 400));
    await store.setStateValue('postedKaeimItemIds', [
      ...kaeimFresh.map((it) => it.id), ...(state.postedKaeimItemIds ?? []),
    ].slice(0, 400));
    await store.setStateValue('lastManualKoreanUpdatesAt', new Date().toISOString());
    console.log(`Posted inaugural digest to ${channelId}: KSET ${ksetFresh.length}, KAEIM ${kaeimFresh.length}.`);
  } finally {
    client.destroy();
  }
});

await client.login(config.discordToken);
