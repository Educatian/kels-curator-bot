// Demo: harvest live KAEIM (한국교육정보미디어학회) notices and print them.
// Usage: node scripts/render-kaeim-updates.mjs [sinceDays]
import { fetchKaeimUpdates } from '../src/kaeim-board.js';

const sinceDays = Number(process.argv[2] || 0);
const { items, errors } = await fetchKaeimUpdates({ sinceDays });
console.log(`Harvested ${items.length} KAEIM notice(s)${sinceDays ? ` within ${sinceDays} days` : ''}.`);
if (errors.length) console.log('Errors:', errors);
console.log('');
for (const it of items.slice(0, 20)) {
  console.log(`[${it.date}] ${it.title}${it.author ? ` (${it.author})` : ''}`);
}
