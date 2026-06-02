import { describe, expect, it } from 'vitest';
import {
  fetchCandidateTechPapers,
  normalizeArxivEntry,
  selectWeeklyTechPaper,
} from '../src/arxiv.js';

describe('arXiv tech signals', () => {
  it('normalizes arXiv Atom entries into Discord-ready paper records', () => {
    const paper = normalizeArxivEntry({
      id: 'https://arxiv.org/abs/2605.12345v1',
      title: ' A RAG Agent for Learning Feedback ',
      summary: ' This paper studies retrieval augmented generation for feedback. ',
      published: '2026-05-31T12:00:00Z',
      updated: '2026-05-31T12:00:00Z',
      author: [{ name: 'Ada Lovelace' }, { name: 'Grace Hopper' }],
      category: [{ term: 'cs.AI' }, { term: 'cs.HC' }],
      link: [
        { href: 'https://arxiv.org/abs/2605.12345v1', rel: 'alternate' },
        { href: 'https://arxiv.org/pdf/2605.12345v1', title: 'pdf', type: 'application/pdf' },
      ],
    });

    expect(paper).toMatchObject({
      id: 'https://arxiv.org/abs/2605.12345v1',
      title: 'A RAG Agent for Learning Feedback',
      primaryCategory: 'cs.AI',
      authors: ['Ada Lovelace', 'Grace Hopper'],
      pdfUrl: 'https://arxiv.org/pdf/2605.12345v1',
    });
  });

  it('fetches and parses recent arXiv candidates', async () => {
    const fetchImpl = async () => ({
      ok: true,
      text: async () => `<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <id>https://arxiv.org/abs/2605.12345v1</id>
            <updated>2026-05-31T12:00:00Z</updated>
            <published>2026-05-31T12:00:00Z</published>
            <title>Multimodal AI Tutor Evaluation</title>
            <summary>We evaluate multimodal AI tutors in learning settings.</summary>
            <author><name>Ada Lovelace</name></author>
            <category term="cs.AI"/>
            <link href="https://arxiv.org/abs/2605.12345v1" rel="alternate"/>
            <link href="https://arxiv.org/pdf/2605.12345v1" title="pdf" type="application/pdf"/>
          </entry>
        </feed>`,
    });

    const papers = await fetchCandidateTechPapers({
      fetchImpl,
      now: new Date('2026-06-02T00:00:00Z'),
    });

    expect(papers).toHaveLength(1);
    expect(papers[0].title).toBe('Multimodal AI Tutor Evaluation');
  });

  it('selects a fresh high-signal tech paper', () => {
    const now = new Date('2026-06-02T00:00:00Z');
    const candidates = [
      {
        id: 'old',
        title: 'Generic Neural Network',
        summary: 'A generic model.',
        categories: ['cs.LG'],
        publishedAt: '2026-05-20T00:00:00Z',
      },
      {
        id: 'signal',
        title: 'RAG Agent Evaluation for AI Tutors',
        summary: 'Retrieval and agent evaluation for feedback and education.',
        categories: ['cs.AI', 'cs.HC'],
        publishedAt: '2026-06-01T00:00:00Z',
      },
    ];

    expect(selectWeeklyTechPaper(candidates, [], now).id).toBe('signal');
    expect(selectWeeklyTechPaper(candidates, ['signal'], now).id).toBe('old');
  });
});
