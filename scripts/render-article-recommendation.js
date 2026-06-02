import 'dotenv/config';
import { buildArticleRecommendationEmbed } from '../src/format.js';
import { loadConfig } from '../src/config.js';
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
const qwen = createQwenClient(config);

if (!article) {
  console.log('No OpenAlex candidate article found.');
  process.exit(0);
}

const qwenSummary = await summarizeArticleWithQwen(qwen, article);
console.log(JSON.stringify(buildArticleRecommendationEmbed(article, qwenSummary).toJSON(), null, 2));
