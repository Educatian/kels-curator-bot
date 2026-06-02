import 'dotenv/config';
import { ChannelType, Client, Events, GatewayIntentBits } from 'discord.js';
import { fetchCandidateTechPapers, scoreTechPaper, selectWeeklyTechPaper } from '../src/arxiv.js';
import { loadConfig } from '../src/config.js';
import { buildTechSignalEmbed } from '../src/format.js';
import { fetchCandidateGithubRepos, scoreGithubRepo, selectWeeklyGithubRepo } from '../src/github-repos.js';
import { createQwenClient, summarizeGithubRepoWithQwen, summarizeTechPaperWithQwen } from '../src/qwen.js';
import { scoreCandidateAgainstArchive } from '../src/relevance.js';
import { JsonStore } from '../src/storage.js';

const config = loadConfig();
const store = new JsonStore(config.dataDir);
const state = await store.getState();
const papers = await fetchCandidateTechPapers({
  query: config.techSignalQuery || undefined,
  days: config.techSignalLookbackDays,
});
const repos = config.techSignalGithubEnabled
  ? await fetchCandidateGithubRepos({
    queries: config.techSignalGithubQueries.length ? config.techSignalGithubQueries : undefined,
    days: config.techSignalLookbackDays,
    minStars: config.techSignalGithubMinStars,
  })
  : [];
const recentPosts = await store.getPosts({ category: 'all', days: 60 });
const paper = selectWeeklyTechPaper(papers, state.recommendedArxivTechPaperIds ?? []);
const repo = selectWeeklyGithubRepo(repos, state.recommendedGithubRepoIds ?? []);
const signal = [
  paper ? { ...paper, kind: 'arxiv', score: scoreTechPaper(paper) + scoreCandidateAgainstArchive(paper, recentPosts) } : null,
  repo ? { ...repo, score: scoreGithubRepo(repo) + scoreCandidateAgainstArchive(repo, recentPosts) } : null,
].filter(Boolean).sort((a, b) => b.score - a.score)[0] ?? null;

if (!signal) {
  console.log('No tech signal candidate found.');
  process.exit(0);
}

const qwen = createQwenClient(config);
const qwenDigest = signal.kind === 'github'
  ? await summarizeGithubRepoWithQwen(qwen, signal)
  : await summarizeTechPaperWithQwen(qwen, signal);
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async () => {
  try {
    const channelId = config.techSignalChannelId || config.articleDigestChannelId;
    const channel = await client.channels.fetch(channelId);
    if (!channel) throw new Error(`Channel not found: ${channelId}`);
    const embed = buildTechSignalEmbed(signal, qwenDigest);

    if (channel.type === ChannelType.GuildForum || channel.type === ChannelType.GuildMedia) {
      const thread = await channel.threads.create({
        name: `KELS Tech Signal: ${signal.title.replace(/\s+/g, ' ').trim()}`.slice(0, 100),
        message: { embeds: [embed] },
        reason: 'KELS manual tech signal',
      });
      console.log(`Posted KELS Tech Signal thread: ${thread.id}`);
    } else if (channel.isTextBased?.()) {
      const message = await channel.send({ embeds: [embed] });
      console.log(`Posted KELS Tech Signal message: ${message.id}`);
    } else {
      throw new Error('Configured channel is not postable.');
    }

    if (signal.kind === 'github') {
      await store.setStateValue('recommendedGithubRepoIds', [
        signal.id,
        ...(state.recommendedGithubRepoIds ?? []).filter((id) => id !== signal.id),
      ].slice(0, 100));
    } else {
      await store.setStateValue('recommendedArxivTechPaperIds', [
        signal.id,
        ...(state.recommendedArxivTechPaperIds ?? []).filter((id) => id !== signal.id),
      ].slice(0, 100));
    }
    await store.setStateValue('lastManualTechSignalAt', new Date().toISOString());
  } finally {
    client.destroy();
  }
});

await client.login(config.discordToken);
