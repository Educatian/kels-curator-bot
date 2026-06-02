import 'dotenv/config';

const clientId = process.env.DISCORD_CLIENT_ID;
if (!clientId) {
  console.error('Missing DISCORD_CLIENT_ID. Add it to .env first.');
  process.exit(1);
}

const permissions = [
  1024n, // ViewChannel
  2048n, // SendMessages
  16384n, // EmbedLinks
  65536n, // ReadMessageHistory
  274877906944n, // SendMessagesInThreads
].reduce((sum, value) => sum + value, 0n);

const params = new URLSearchParams({
  client_id: clientId,
  scope: 'bot applications.commands',
  permissions: permissions.toString(),
});

console.log(`https://discord.com/oauth2/authorize?${params.toString()}`);
