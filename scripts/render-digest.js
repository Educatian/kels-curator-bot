import { buildDigestEmbed, formatStats } from '../src/format.js';
import { JsonStore } from '../src/storage.js';

const dataDir = process.env.DATA_DIR ?? './data';
const category = process.argv[2] ?? 'all';
const days = Number.parseInt(process.argv[3] ?? '365', 10);
const store = new JsonStore(dataDir);
const posts = await store.getPosts({ category, days });
const embed = buildDigestEmbed(posts, { category, days });
const stats = await store.getStats();

console.log('Archive stats');
console.log(formatStats(stats));
console.log('\nDigest JSON');
console.log(JSON.stringify(embed.toJSON(), null, 2));
