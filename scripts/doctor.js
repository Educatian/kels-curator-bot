import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ChannelType, REST, Routes } from 'discord.js';
import { buildCommands } from '../src/commands.js';
import { loadConfig } from '../src/config.js';
import { resolveReactionTarget } from '../src/reactions.js';
import { JsonStore } from '../src/storage.js';

const checks = [];

async function check(name, fn) {
  try {
    const details = await fn();
    checks.push({ name, status: 'ok', details });
  } catch (error) {
    checks.push({ name, status: 'fail', details: error.message });
  }
}

await check('.env exists', async () => {
  await fs.access(path.resolve('.env'));
  return 'found';
});

let config;
await check('environment loads', async () => {
  config = loadConfig();
  return `guild=${config.guildId}, channels=${config.indexChannels.length || 'all'}`;
});

await check('slash command payload builds', async () => {
  const commands = buildCommands().map((command) => command.toJSON());
  return `${commands.length} commands: ${commands.map((command) => command.name).join(', ')}`;
});

await check('local data store readable', async () => {
  const store = new JsonStore(config?.dataDir ?? './data');
  const stats = await store.getStats();
  return `${stats.total} indexed post(s)`;
});

if (config) {
  const rest = new REST({ version: '10' }).setToken(config.discordToken);

  await check('Discord token works', async () => {
    const user = await rest.get(Routes.user('@me'));
    return `${user.username} (${user.id})`;
  });

  await check('KELS guild reachable', async () => {
    const guild = await rest.get(Routes.guild(config.guildId));
    return `${guild.name} (${guild.id})`;
  });

  await check('INDEX_CHANNELS match guild channels', async () => {
    if (!config.indexChannels.length) return 'INDEX_CHANNELS empty; all visible channels will be indexed';
    const channels = await rest.get(Routes.guildChannels(config.guildId));
    const indexable = channels.filter((channel) => [
      ChannelType.GuildText,
      ChannelType.GuildAnnouncement,
      ChannelType.GuildForum,
    ].includes(channel.type));
    const missing = config.indexChannels.filter((item) => !indexable.some((channel) =>
      channel.id === item
      || channel.name === item
      || channel.name?.toLowerCase() === item.toLowerCase(),
    ));
    if (missing.length) throw new Error(`missing: ${missing.join(', ')}`);
    return `${config.indexChannels.length} configured channel(s) matched`;
  });

  await check('auto reactions configured', async () => {
    if (!config.autoReactEnabled) return 'disabled';
    const emojis = await rest.get(Routes.guildEmojis(config.guildId));
    const missing = config.autoReactEmojis.filter((token) => !resolveReactionTarget(token, emojis));
    if (missing.length) throw new Error(`unresolved reaction token(s): ${missing.join(', ')}`);
    return `enabled: ${config.autoReactEmojis.join(', ')}`;
  });
}

for (const item of checks) {
  const icon = item.status === 'ok' ? 'OK' : 'FAIL';
  console.log(`[${icon}] ${item.name}: ${item.details}`);
}

if (checks.some((item) => item.status === 'fail')) {
  process.exit(1);
}
