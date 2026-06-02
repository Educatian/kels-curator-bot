import 'dotenv/config';
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
const qwen = createQwenClient(config);

if (!paper) {
  console.log('No arXiv tech signal candidate found.');
  process.exit(0);
}

const qwenDigest = await summarizeTechPaperWithQwen(qwen, paper);
console.log(JSON.stringify(buildTechSignalEmbed(paper, qwenDigest).toJSON(), null, 2));
