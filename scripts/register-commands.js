import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { buildCommands } from '../src/commands.js';
import { loadConfig } from '../src/config.js';

const config = loadConfig();
const rest = new REST({ version: '10' }).setToken(config.discordToken);
const commandPayload = buildCommands().map((command) => command.toJSON());

await rest.put(
  Routes.applicationGuildCommands(config.clientId, config.guildId),
  { body: commandPayload },
);

console.log(`Registered ${commandPayload.length} KELS curator commands.`);
