import 'dotenv/config';
import { ChannelType, Client, Events, GatewayIntentBits } from 'discord.js';
import { loadConfig } from '../src/config.js';
import { buildArticleRecommendationEmbed } from '../src/format.js';
import { fetchCandidateArticles, selectWeeklyArticle } from '../src/openalex.js';
import { createQwenClient, summarizeArticleWithQwen } from '../src/qwen.js';
import { JsonStore } from '../src/storage.js';

const config = loadConfig();
const store = new JsonStore(config.dataDir);
const state = await store.getState();
const candidates = await fetchCandidateArticles({
  days: config.articleDigestLookbackDays,
  mailto: config.openAlexMailto,
});
const article = selectWeeklyArticle(candidates, state.recommendedOpenAlexWorkIds ?? []);

if (!article) {
  console.log('No OpenAlex candidate article found.');
  process.exit(0);
}

const qwen = createQwenClient(config);
const qwenSummary = await summarizeArticleWithQwen(qwen, article);
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async () => {
  try {
    const channelId = config.articleDigestChannelId;
    const channel = await client.channels.fetch(channelId);
    if (!channel) throw new Error(`Channel not found: ${channelId}`);
    const embed = buildArticleRecommendationEmbed(article, qwenSummary);

    if (channel.type === ChannelType.GuildForum || channel.type === ChannelType.GuildMedia) {
      const thread = await channel.threads.create({
        name: `KELS weekly article: ${article.title.replace(/\s+/g, ' ').trim()}`.slice(0, 100),
        message: { embeds: [embed] },
        reason: 'KELS manual OpenAlex article recommendation',
      });
      console.log(`Posted KELS weekly article thread: ${thread.id}`);
    } else if (channel.isTextBased?.()) {
      const message = await channel.send({ embeds: [embed] });
      console.log(`Posted KELS weekly article message: ${message.id}`);
    } else {
      throw new Error('Configured channel is not postable.');
    }

    await store.setStateValue('recommendedOpenAlexWorkIds', [
      article.id,
      ...(state.recommendedOpenAlexWorkIds ?? []).filter((id) => id !== article.id),
    ].slice(0, 100));
    await store.setStateValue('lastManualArticleRecommendationAt', new Date().toISOString());
  } finally {
    client.destroy();
  }
});

await client.login(config.discordToken);
