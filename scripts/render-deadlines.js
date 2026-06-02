import { buildDeadlinesEmbed, formatStats } from '../src/format.js';
import { JsonStore } from '../src/storage.js';

const dataDir = process.env.DATA_DIR ?? './data';
const days = Number.parseInt(process.argv[2] ?? '365', 10);
const category = process.argv[3] ?? 'all';
const store = new JsonStore(dataDir);
const deadlines = await store.getUpcomingDeadlines({ days, category });
const embed = buildDeadlinesEmbed(deadlines, { days, category });
const stats = await store.getStats();

console.log('Archive stats');
console.log(formatStats(stats));
console.log('\nDeadlines JSON');
console.log(JSON.stringify(embed.toJSON(), null, 2));
