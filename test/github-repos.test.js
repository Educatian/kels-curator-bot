import { describe, expect, it } from 'vitest';
import {
  fetchCandidateGithubRepos,
  normalizeGithubRepo,
  selectWeeklyGithubRepo,
} from '../src/github-repos.js';

describe('GitHub tech signals', () => {
  it('normalizes GitHub repository search items', () => {
    const repo = normalizeGithubRepo({
      full_name: 'example/ai-tutor',
      description: 'An LLM tutor with RAG feedback.',
      html_url: 'https://github.com/example/ai-tutor',
      stargazers_count: 1234,
      forks_count: 55,
      language: 'TypeScript',
      topics: ['education', 'rag'],
      pushed_at: '2026-06-01T00:00:00Z',
      created_at: '2026-05-01T00:00:00Z',
    });

    expect(repo).toMatchObject({
      id: 'example/ai-tutor',
      kind: 'github',
      title: 'example/ai-tutor',
      stars: 1234,
      language: 'TypeScript',
    });
  });

  it('fetches and deduplicates GitHub repo candidates', async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        items: [
          {
            full_name: 'example/ai-tutor',
            description: 'RAG tutor',
            html_url: 'https://github.com/example/ai-tutor',
            stargazers_count: 500,
            forks_count: 20,
            language: 'Python',
            topics: ['rag'],
            pushed_at: '2026-06-01T00:00:00Z',
          },
        ],
      }),
    });

    const repos = await fetchCandidateGithubRepos({
      queries: ['rag education', 'rag education'],
      fetchImpl,
      now: new Date('2026-06-02T00:00:00Z'),
    });

    expect(repos).toHaveLength(1);
    expect(repos[0].title).toBe('example/ai-tutor');
  });

  it('selects a fresh high-signal repository', () => {
    const now = new Date('2026-06-02T00:00:00Z');
    const repos = [
      {
        id: 'generic/tool',
        title: 'generic/tool',
        description: 'Generic developer tool.',
        stars: 100,
        forks: 1,
        topics: [],
        pushedAt: '2026-05-15T00:00:00Z',
      },
      {
        id: 'signal/rag-tutor',
        title: 'signal/rag-tutor',
        description: 'RAG agent tutor for learning feedback evaluation.',
        stars: 800,
        forks: 50,
        topics: ['education', 'feedback'],
        pushedAt: '2026-06-01T00:00:00Z',
      },
    ];

    expect(selectWeeklyGithubRepo(repos, [], now).id).toBe('signal/rag-tutor');
    expect(selectWeeklyGithubRepo(repos, ['signal/rag-tutor'], now).id).toBe('generic/tool');
  });
});
