import 'dotenv/config';
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
const qwen = createQwenClient(config);

if (!signal) {
  console.log('No tech signal candidate found.');
  process.exit(0);
}

const qwenDigest = signal.kind === 'github'
  ? await summarizeGithubRepoWithQwen(qwen, signal)
  : await summarizeTechPaperWithQwen(qwen, signal);
console.log(JSON.stringify(buildTechSignalEmbed(signal, qwenDigest).toJSON(), null, 2));
