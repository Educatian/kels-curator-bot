import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { loadConfig } from '../src/config.js';
import { createChatLogger } from '../src/logger.js';
import { createQwenClient, inferMemberRolesWithQwen } from '../src/qwen.js';
import { JsonStore } from '../src/storage.js';

const DRY_RUN = process.argv.includes('--dry-run');
const APPLY_LIMIT = Number.parseInt(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? '0', 10);

const config = loadConfig();
const store = new JsonStore(config.dataDir);
const qwen = createQwenClient(config);
const logger = createChatLogger(config, store);
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

await client.login(config.discordToken);
const guild = await client.guilds.fetch(config.guildId);
const fullGuild = await guild.fetch();
const members = await fullGuild.members.fetch();
const roles = await fullGuild.roles.fetch();
const botMember = await fullGuild.members.fetchMe();
const botHighest = botMember.roles.highest.position;
const ignored = new Set(config.roleIgnoreNames.map(normalizeRoleKey));
const roleless = Array.from(members.values())
  .filter((member) => !member.user.bot)
  .filter((member) => member.roles.cache.filter((role) => role.id !== fullGuild.id).size === 0);
const posts = await store.getAllPosts();
const candidates = Array.from(roles.values())
  .filter((role) => !role.managed)
  .filter((role) => !ignored.has(normalizeRoleKey(role.name)))
  .map((role) => role.name)
  .sort((a, b) => a.localeCompare(b));

const results = [];
const targetMembers = APPLY_LIMIT > 0 ? roleless.slice(0, APPLY_LIMIT) : roleless;

for (const member of targetMembers) {
  const memberPosts = posts
    .filter((post) => post.authorId === member.id)
    .slice(0, 8);
  const text = memberPosts.map((post) => `#${post.channelName}: ${post.content}`).join('\n\n').slice(0, 2200);
  if (!text.trim()) {
    results.push({ member: member.user.tag, action: 'skipped-no-indexed-posts' });
    continue;
  }

  const suggestions = (await inferMemberRolesWithQwen(qwen, {
    messageText: text,
    existingRoles: candidates.slice(0, 120),
    currentRoles: [],
  }))
    .filter((item) => item.confidence >= config.roleMinConfidence)
    .filter((item) => !isForbiddenAutoRole(item.role))
    .slice(0, config.roleMaxPerMember);

  if (!suggestions.length) {
    results.push({ member: member.user.tag, action: 'skipped-no-confident-role' });
    continue;
  }

  const outcomes = [];
  for (const suggestion of suggestions) {
    const existing = findRoleByName(roles, suggestion.role);
    if (existing && existing.position < botHighest && !DRY_RUN) {
      await member.roles.add(existing, `KELS Qwen roleless member tagging: ${suggestion.reason}`).catch((error) => {
        outcomes.push({ role: existing.name, action: 'assign-failed', reason: error.message });
      });
      outcomes.push({ role: existing.name, action: 'assigned-existing', confidence: suggestion.confidence });
      continue;
    }

    const roleName = existing ? existing.name : withRolePrefix(suggestion.role, config.rolePrefix);
    if (isForbiddenAutoRole(roleName)) continue;

    if (DRY_RUN) {
      outcomes.push({ role: roleName, action: existing ? 'would-suggest-existing-unmanageable' : 'would-create-and-assign', confidence: suggestion.confidence });
      continue;
    }

    let role = existing;
    if (!role) {
      role = await fullGuild.roles.create({
        name: roleName,
        reason: `KELS Qwen roleless member tagging: ${suggestion.reason}`,
        mentionable: false,
      }).catch((error) => {
        outcomes.push({ role: roleName, action: 'create-failed', reason: error.message });
        return null;
      });
      if (role) roles.set(role.id, role);
    }

    if (role && role.position < botHighest) {
      await member.roles.add(role, `KELS Qwen roleless member tagging: ${suggestion.reason}`).catch((error) => {
        outcomes.push({ role: role.name, action: 'assign-failed', reason: error.message });
      });
      outcomes.push({ role: role.name, action: existing ? 'suggested-existing-unmanageable' : 'created-and-assigned', confidence: suggestion.confidence });
    } else if (role) {
      outcomes.push({ role: role.name, action: 'suggested-existing-unmanageable', confidence: suggestion.confidence });
    }
  }

  results.push({ member: member.user.tag, id: member.id, outcomes });
  await logger.log({
    eventType: 'roleless-member-tagging',
    guildId: fullGuild.id,
    userId: member.id,
    userName: member.user.tag,
    query: text,
    responseExcerpt: JSON.stringify(outcomes),
    metadata: { dryRun: DRY_RUN, outcomes },
  });
}

console.log(JSON.stringify({
  dryRun: DRY_RUN,
  rolelessCount: roleless.length,
  processed: targetMembers.length,
  results,
}, null, 2));

client.destroy();

function findRoleByName(roleCollection, name) {
  const key = normalizeRoleKey(name);
  return roleCollection.find((role) => normalizeRoleKey(role.name) === key);
}

function normalizeRoleKey(name) {
  return String(name ?? '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
}

function withRolePrefix(name, prefix) {
  const clean = String(name ?? '').replace(/[\r\n\t`"'<>@#]/g, '').trim().slice(0, 70);
  if (!prefix) return clean;
  return clean.startsWith(prefix) ? clean : `${prefix}${clean}`;
}

function isForbiddenAutoRole(name) {
  const key = normalizeRoleKey(name);
  return key.includes('admin') || key.includes('administrator') || key.includes('communicationofficer');
}
