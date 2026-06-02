import 'dotenv/config';
import { ChannelType, Client, Events, GatewayIntentBits } from 'discord.js';
import { fetchCandidateTechPapers, selectWeeklyTechPaper } from '../src/arxiv.js';
import { loadConfig } from '../src/config.js';
import { buildTechSignalEmbed } from '../src/format.js';
import { createQwenClient, summarizeTechPaperWithQwen } from '../src/qwen.js';
import { JsonStore } from '../src/storage.js';

const config = loadConfig();
const store = new JsonStore(config.dataDir);
const state = await store.getState();
const candidates = await fetchCandidateTechPapers({
  query: config.techSignalQuery || undefined,
  days: config.techSignalLookbackDays,
});
const paper = selectWeeklyTechPaper(candidates, state.recommendedArxivTechPaperIds ?? []);

if (!paper) {
  console.log('No arXiv tech signal candidate found.');
  process.exit(0);
}

const qwen = createQwenClient(config);
const qwenDigest = await summarizeTechPaperWithQwen(qwen, paper);
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async () => {
  try {
    const channelId = config.techSignalChannelId || config.articleDigestChannelId;
    const channel = await client.channels.fetch(channelId);
    if (!channel) throw new Error(`Channel not found: ${channelId}`);
    const embed = buildTechSignalEmbed(paper, qwenDigest);

    if (channel.type === ChannelType.GuildForum || channel.type === ChannelType.GuildMedia) {
      const thread = await channel.threads.create({
        name: `KELS Tech Signal: ${paper.title.replace(/\s+/g, ' ').trim()}`.slice(0, 100),
        message: { embeds: [embed] },
        reason: 'KELS manual arXiv tech signal',
      });
      console.log(`Posted KELS Tech Signal thread: ${thread.id}`);
    } else if (channel.isTextBased?.()) {
      const message = await channel.send({ embeds: [embed] });
      console.log(`Posted KELS Tech Signal message: ${message.id}`);
    } else {
      throw new Error('Configured channel is not postable.');
    }

    await store.setStateValue('recommendedArxivTechPaperIds', [
      paper.id,
      ...(state.recommendedArxivTechPaperIds ?? []).filter((id) => id !== paper.id),
    ].slice(0, 100));
    await store.setStateValue('lastManualTechSignalAt', new Date().toISOString());
  } finally {
    client.destroy();
  }
});

await client.login(config.discordToken);
