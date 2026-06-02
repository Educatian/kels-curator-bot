import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePost } from '../src/extractors.js';
import { JsonStore } from '../src/storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(root, 'data'));
const sampleFile = path.join(root, 'samples', 'kels-posts.json');

const samples = JSON.parse(await fs.readFile(sampleFile, 'utf8'));
const store = new JsonStore(dataDir);

for (const [index, sample] of samples.entries()) {
  await store.savePost(normalizePost({
    messageId: `sample-${index + 1}`,
    guildId: 'sample-guild',
    channelId: `sample-channel-${sample.channelName}`,
    channelName: sample.channelName,
    authorId: 'sample-author',
    authorName: sample.authorName,
    content: sample.content,
    createdAt: sample.createdAt,
  }));
}

console.log(`Seeded ${samples.length} sample KELS posts into ${dataDir}`);
