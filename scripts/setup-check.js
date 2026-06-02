import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { loadConfig } from '../src/config.js';

function mask(value) {
  if (!value) return 'missing';
  if (value.length <= 8) return 'present';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

let config;
try {
  config = loadConfig();
} catch (error) {
  console.error(error.message);
  console.error('Create .env from .env.example before running setup checks.');
  process.exit(1);
}

console.log('Environment');
console.log(`- DISCORD_TOKEN: ${mask(config.discordToken)}`);
console.log(`- DISCORD_CLIENT_ID: ${mask(config.clientId)}`);
console.log(`- DISCORD_GUILD_ID: ${mask(config.guildId)}`);
console.log(`- DATA_DIR: ${config.dataDir}`);
console.log(`- INDEX_CHANNELS: ${config.indexChannels.length ? config.indexChannels.join(', ') : '(all visible channels)'}`);

const rest = new REST({ version: '10' }).setToken(config.discordToken);

try {
  const currentUser = await rest.get(Routes.user('@me'));
  console.log('Discord API');
  console.log(`- Bot user: ${currentUser.username}#${currentUser.discriminator ?? '0'} (${currentUser.id})`);
} catch (error) {
  console.error('Discord API token check failed.');
  console.error(error.message);
  process.exit(1);
}

try {
  const guild = await rest.get(Routes.guild(config.guildId));
  console.log(`- Guild reachable: ${guild.name} (${guild.id})`);
} catch (error) {
  console.error('Guild check failed. The bot may not be invited to this server yet.');
  console.error(error.message);
  process.exit(1);
}

console.log('Setup check passed.');
