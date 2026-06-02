import { ChannelType, REST, Routes } from 'discord.js';
import { optionalEnv, requireEnv, splitList } from './discord-env.js';

let token;
let guildId;
try {
  token = requireEnv('DISCORD_TOKEN');
  guildId = requireEnv('DISCORD_GUILD_ID');
} catch (error) {
  console.error(error.message);
  console.error('Create .env with DISCORD_TOKEN and DISCORD_GUILD_ID first.');
  process.exit(1);
}

const configured = splitList(optionalEnv('INDEX_CHANNELS'));
if (!configured.length) {
  console.log('INDEX_CHANNELS is empty; the bot will index all visible public text/announcement/thread messages.');
  process.exit(0);
}

const rest = new REST({ version: '10' }).setToken(token);

try {
  const channels = await rest.get(Routes.guildChannels(guildId));
  const indexable = channels.filter((channel) => [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildForum,
  ].includes(channel.type));

  const missing = [];
  const matched = [];
  for (const item of configured) {
    const match = indexable.find((channel) =>
      channel.id === item
      || channel.name === item
      || channel.name?.toLowerCase() === item.toLowerCase(),
    );
    if (match) {
      matched.push({ configured: item, channel: match });
    } else {
      missing.push(item);
    }
  }

  console.log('Matched INDEX_CHANNELS:');
  for (const match of matched) {
    console.log(`- ${match.configured} -> #${match.channel.name} (${match.channel.id})`);
  }

  if (missing.length) {
    console.log('');
    console.log('Missing INDEX_CHANNELS entries:');
    for (const item of missing) console.log(`- ${item}`);
    process.exit(1);
  }

  console.log('All configured channels were found.');
} catch (error) {
  console.error('Failed to verify channels.');
  console.error(error.message);
  process.exit(1);
}
