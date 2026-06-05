import { describe, expect, it } from 'vitest';
import {
  vectorizeText, cosine, methodologyDistribution, cfpReadiness,
  rankSubmissionFit, formatScorecard,
} from '../src/submission-fit.js';

// Minimal injected fingerprints (shape mirrors semantic_profiles.json).
const PROFILES = {
  'Journal of Learning Analytics': {
    vector: {
      'learning analytics': 5, 'predictive model': 3, 'clustering': 2, 'engagement': 3,
      'self-regulated learning': 3, 'dashboard': 2, 'machine learning': 2,
    },
  },
  'Journal of the Learning Sciences': {
    vector: {
      'epistemic performance': 5, argumentation: 3, sensemaking: 3, 'collaborative learning': 3,
      discourse: 2, 'knowledge construction': 3,
    },
  },
};

describe('vectorize + cosine + methodology', () => {
  it('vectorizes and scores methodology', () => {
    expect(vectorizeText('learning analytics dashboard')['learning analytics']).toBe(1);
    expect(cosine({ a: 1 }, { a: 1 })).toBeCloseTo(1, 5);
    const dist = methodologyDistribution(vectorizeText('machine learning predictive clustering analytics'));
    expect(Object.entries(dist).sort((a, b) => b[1] - a[1])[0][0]).toBe('Data & AI');
  });
  it('cfpReadiness decays with time', () => {
    expect(cfpReadiness(7)).toBeGreaterThan(cfpReadiness(120));
  });
});

describe('rankSubmissionFit (injected profiles)', () => {
  const venues = [
    { name: 'Journal of Learning Analytics', type: 'Journal' },
    { name: 'Journal of the Learning Sciences', type: 'Journal' },
  ];

  it('ranks the analytics venue top for an analytics abstract', () => {
    const abstract = 'We use learning analytics and a predictive model with clustering of engagement and self-regulated learning.';
    const ranked = rankSubmissionFit(abstract, venues, PROFILES);
    expect(ranked[0].name).toBe('Journal of Learning Analytics');
    expect(ranked[0].overall).toBeGreaterThanOrEqual(ranked[ranked.length - 1].overall);
  });

  it('ranks the LS venue top for an argumentation abstract', () => {
    const abstract = 'This study examines epistemic performance and argumentation during collaborative knowledge construction and sensemaking discourse.';
    const ranked = rankSubmissionFit(abstract, venues, PROFILES);
    expect(ranked[0].name).toBe('Journal of the Learning Sciences');
  });

  it('returns [] with no signal or no profiles', () => {
    expect(rankSubmissionFit('a an the', venues, PROFILES)).toEqual([]);
    expect(rankSubmissionFit('learning analytics', venues, {})).toEqual([]);
  });
});

describe('formatScorecard', () => {
  it('renders ranked lines with why', () => {
    const abstract = 'learning analytics predictive model engagement self-regulated learning clustering';
    const ranked = rankSubmissionFit(abstract, [{ name: 'Journal of Learning Analytics', type: 'Journal' }], PROFILES);
    const text = formatScorecard(ranked);
    expect(text).toContain('Journal of Learning Analytics');
    expect(text).toContain('적합도');
  });
  it('handles empty', () => {
    expect(formatScorecard([])).toContain('찾지 못');
  });
});
