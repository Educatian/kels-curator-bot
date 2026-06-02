import { ChannelType, REST, Routes } from 'discord.js';
import { requireEnv } from './discord-env.js';

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

const rest = new REST({ version: '10' }).setToken(token);

try {
  const channels = await rest.get(Routes.guildChannels(guildId));
  const sorted = channels
    .filter((channel) => [
      ChannelType.GuildText,
      ChannelType.GuildAnnouncement,
      ChannelType.GuildForum,
      ChannelType.GuildCategory,
    ].includes(channel.type))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  console.log(`Channels for guild ${guildId}:`);
  for (const channel of sorted) {
    const type = typeName(channel.type);
    const prefix = channel.type === ChannelType.GuildCategory ? '[category]' : '#';
    console.log(`- ${prefix}${channel.name} | ${channel.id} | ${type}`);
  }
} catch (error) {
  console.error('Failed to list channels.');
  console.error(error.message);
  process.exit(1);
}

function typeName(type) {
  if (type === ChannelType.GuildText) return 'text';
  if (type === ChannelType.GuildAnnouncement) return 'announcement';
  if (type === ChannelType.GuildForum) return 'forum';
  if (type === ChannelType.GuildCategory) return 'category';
  return `type-${type}`;
}
