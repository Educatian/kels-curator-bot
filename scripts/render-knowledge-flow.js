import 'dotenv/config';
import { loadConfig } from '../src/config.js';
import { buildMonthlyRadarEmbed } from '../src/format.js';
import { buildKnowledgeFlow } from '../src/knowledge-flow.js';
import { JsonStore } from '../src/storage.js';

const config = loadConfig();
const store = new JsonStore(config.dataDir);
const days = Number.parseInt(process.argv[2] ?? '31', 10);
const monthLabel = process.argv[3] ?? new Date().toISOString().slice(0, 7);
const posts = (await store.getPosts({ category: 'all', days }))
  .filter((post) => !post.guildId || post.guildId === config.guildId);
const deadlines = await store.getUpcomingDeadlines({ days: 60, category: 'all' });
const knowledgeFlow = buildKnowledgeFlow(posts);

console.log(JSON.stringify(buildMonthlyRadarEmbed({
  posts,
  deadlines,
  monthLabel,
  knowledgeFlow,
}).toJSON(), null, 2));
