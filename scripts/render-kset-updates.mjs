// Demo: harvest live KSET (한국교육공학회) board updates and print them.
// Usage: node scripts/render-kset-updates.mjs [sinceDays]
import { fetchKsetUpdates, KSET_BOARDS } from '../src/kset-board.js';

const sinceDays = Number(process.argv[2] || 0);
const { items, errors } = await fetchKsetUpdates({ sinceDays });

console.log(`KSET boards: ${KSET_BOARDS.map((b) => b.label).join(', ')}`);
console.log(`Harvested ${items.length} items${sinceDays ? ` within ${sinceDays} days` : ''}.`);
if (errors.length) console.log('Errors:', errors);
console.log('');
for (const it of items.slice(0, 20)) {
  console.log(`[${it.date}] (${it.boardLabel}/${it.kind}) ${it.title}`);
  console.log(`         ${it.url}`);
}
