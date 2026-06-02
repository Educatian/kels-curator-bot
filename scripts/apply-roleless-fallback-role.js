import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { loadConfig } from '../src/config.js';

const ROLE_NAME = process.argv.find((arg) => arg.startsWith('--role='))?.split('=')[1] ?? 'KELS:OnboardingNeeded';
const DRY_RUN = process.argv.includes('--dry-run');

const config = loadConfig();
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

await client.login(config.discordToken);
const guild = await client.guilds.fetch(config.guildId);
const fullGuild = await guild.fetch();
const members = await fullGuild.members.fetch();
const roles = await fullGuild.roles.fetch();
const botMember = await fullGuild.members.fetchMe();
const botHighest = botMember.roles.highest.position;

let role = roles.find((item) => item.name === ROLE_NAME);
if (!role && !DRY_RUN) {
  role = await fullGuild.roles.create({
    name: ROLE_NAME,
    mentionable: false,
    reason: 'KELS roleless member onboarding marker',
  });
}

const roleless = Array.from(members.values())
  .filter((member) => !member.user.bot)
  .filter((member) => member.roles.cache.filter((item) => item.id !== fullGuild.id).size === 0);

const results = [];
for (const member of roleless) {
  if (DRY_RUN) {
    results.push({ id: member.id, user: member.user.tag, action: role ? 'would-assign-existing' : 'would-create-and-assign' });
    continue;
  }
  if (!role || role.position >= botHighest) {
    results.push({ id: member.id, user: member.user.tag, action: 'skipped-role-unmanageable' });
    continue;
  }
  await member.roles.add(role, 'KELS roleless member onboarding marker').catch((error) => {
    results.push({ id: member.id, user: member.user.tag, action: 'assign-failed', reason: error.message });
  });
  results.push({ id: member.id, user: member.user.tag, action: 'assigned' });
}

console.log(JSON.stringify({
  dryRun: DRY_RUN,
  role: ROLE_NAME,
  rolelessCount: roleless.length,
  assigned: results.filter((item) => item.action === 'assigned').length,
  results,
}, null, 2));

client.destroy();
