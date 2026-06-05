// Create #korean-edutech-research-news and move the Korean-society digest messages
// from #cfp-rfp into it (Discord has no "move", so we re-post then delete originals).
// Usage: node scripts/move-korean-news-channel.mjs [sourceChannelId]
import 'dotenv/config';
import { ChannelType, Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import { loadConfig } from '../src/config.js';

const config = loadConfig();
const SOURCE = process.argv[2] || '1028825450832724078'; // #cfp-rfp
const NEW_NAME = 'korean-edutech-research-news';
const TOPIC = '한국 교육공학 학회 소식·CFP·학술대회·논문 초록 자동 큐레이션 (한국교육공학회·한국교육정보미디어학회 · KCI)';

// Strong markers that identify a Korean-society digest message the bot posted.
const MARKERS = [
  '🇰🇷 한국교육', '📚', '📡 **새 기능**', 'kset.or.kr', 'kaeim.jams', 'KCI 색인',
  '한국교육공학회(KSET)', '한국교육정보미디어학회(KAEIM)', '최신 논문 (초록)',
];
const isKoreanDigest = (text) => !!text && MARKERS.some((m) => text.includes(m));

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel, Partials.Message],
});

client.once(Events.ClientReady, async () => {
  try {
    const source = await client.channels.fetch(SOURCE);
    const guild = source.guild;

    // 1. Find or create the destination channel.
    let dest = guild.channels.cache.find((c) => c.name === NEW_NAME && c.type === ChannelType.GuildText);
    if (!dest) {
      dest = await guild.channels.create({
        name: NEW_NAME,
        type: ChannelType.GuildText,
        parent: source.parentId ?? undefined,
        topic: TOPIC,
        reason: 'Dedicated channel for Korean edutech research-society curation',
      });
      console.log(`Created channel #${dest.name} (${dest.id})`);
    } else {
      console.log(`Channel #${dest.name} already exists (${dest.id})`);
    }

    // 2. Collect this bot's Korean-digest messages in the source channel (oldest first).
    const fetched = await source.messages.fetch({ limit: 80 });
    const mine = [...fetched.values()]
      .filter((m) => m.author.id === client.user.id && isKoreanDigest(m.content))
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    console.log(`Found ${mine.length} Korean-digest message(s) in #${source.name} to move.`);

    // 3. Re-post into the new channel, then delete the originals.
    let moved = 0;
    for (const m of mine) {
      await dest.send({ content: m.content.slice(0, 2000) });
      await m.delete().catch((e) => console.warn('  delete failed:', e.message));
      moved++;
    }
    console.log(`Moved ${moved} message(s) to #${dest.name} (${dest.id}).`);
    console.log(`NEXT: set KSET_UPDATES_CHANNEL_ID / KAEIM_UPDATES_CHANNEL_ID / KCI_DIGEST_CHANNEL_ID = ${dest.id}`);
  } catch (error) {
    console.error('Move failed:', error.message);
  } finally {
    client.destroy();
  }
});

await client.login(config.discordToken);
