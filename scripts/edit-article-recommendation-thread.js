import 'dotenv/config';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { loadConfig } from '../src/config.js';
import { buildArticleRecommendationEmbed } from '../src/format.js';
import { fetchCandidateArticles, scoreArticle } from '../src/openalex.js';
import { createQwenClient, summarizeArticleWithQwen } from '../src/qwen.js';
import { JsonStore } from '../src/storage.js';

const threadId = process.argv[2] ?? '1511365096998436874';
const config = loadConfig();
const store = new JsonStore(config.dataDir);
const state = await store.getState();
const targetArticleId = state.recommendedOpenAlexWorkIds?.[0];

if (!targetArticleId) {
  console.log('No recommended OpenAlex article id found in state.');
  process.exit(1);
}

const candidates = await fetchCandidateArticles({
  days: config.articleDigestLookbackDays,
  mailto: config.openAlexMailto,
});
const rawArticle = candidates.find((candidate) => candidate.id === targetArticleId);

if (!rawArticle) {
  console.log(`Could not find article in OpenAlex candidates: ${targetArticleId}`);
  process.exit(1);
}

const archivePosts = await store.getPosts({ category: 'all', days: 120 });
const article = {
  ...rawArticle,
  curationVotes: scoreArticle(rawArticle, new Date(), archivePosts).votes,
};

const qwen = createQwenClient(config);
const qwenSummary = await summarizeArticleWithQwen(qwen, article);
const embed = buildArticleRecommendationEmbed(article, qwenSummary);
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async () => {
  try {
    const thread = await client.channels.fetch(threadId);
    if (!thread?.isThread?.()) throw new Error(`Thread not found or not a thread: ${threadId}`);
    const starter = await thread.fetchStarterMessage();
    await starter.edit({ embeds: [embed] });
    await store.setStateValue('lastManualArticleRecommendationEditAt', new Date().toISOString());
    console.log(`Edited KELS weekly article thread: ${threadId}`);
    console.log(`Article: ${article.title}`);
  } finally {
    client.destroy();
  }
});

await client.login(config.discordToken);
