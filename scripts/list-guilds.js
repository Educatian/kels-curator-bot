import { REST, Routes } from 'discord.js';
import { mask, requireEnv } from './discord-env.js';

let token;
try {
  token = requireEnv('DISCORD_TOKEN');
} catch (error) {
  console.error(error.message);
  console.error('Run scripts/write-env.ps1 or create .env first.');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);
console.log(`DISCORD_TOKEN: ${mask(token)}`);

try {
  const guilds = await rest.get(Routes.userGuilds());
  if (!guilds.length) {
    console.log('No guilds are visible to this bot token yet. Invite the bot first.');
    process.exit(0);
  }

  console.log('Guilds visible to this bot:');
  for (const guild of guilds) {
    console.log(`- ${guild.name} | ${guild.id}`);
  }
} catch (error) {
  console.error('Failed to list guilds.');
  console.error(error.message);
  process.exit(1);
}
