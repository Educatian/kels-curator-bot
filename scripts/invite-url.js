import 'dotenv/config';
import { PermissionFlagsBits } from 'discord.js';

const clientId = process.env.DISCORD_CLIENT_ID;
if (!clientId) {
  console.error('Missing DISCORD_CLIENT_ID. Add it to .env first.');
  process.exit(1);
}

const permissions = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.CreatePublicThreads,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ReadMessageHistory,
].reduce((sum, value) => sum | value, 0n);

const params = new URLSearchParams({
  client_id: clientId,
  scope: 'bot applications.commands',
  permissions: permissions.toString(),
});

console.log(`https://discord.com/oauth2/authorize?${params.toString()}`);
