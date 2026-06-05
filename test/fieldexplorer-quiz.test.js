import { describe, expect, it } from 'vitest';
import {
  gradeQuiz, formatQuizQuestion, formatQuizFeedback, formatLearnModules, LEARN_MODULES,
} from '../src/fieldexplorer-quiz.js';

const PROFILES = {
  'Journal of Learning Analytics': { vector: { 'learning analytics': 5, 'predictive model': 3, dashboard: 2, clickstream: 3 } },
  'European Journal of Teacher Education': { vector: { 'teacher education': 5, 'qualitative': 3, interview: 3, 'preservice teachers': 3 } },
};
const VENUES = [
  { name: 'Journal of Learning Analytics', type: 'Journal' },
  { name: 'European Journal of Teacher Education', type: 'Journal' },
];
const ITEM = {
  id: 'la1',
  abstract: 'learning analytics clickstream predictive model dashboard for online courses',
  options: ['Journal of Learning Analytics', 'European Journal of Teacher Education'],
  teaching_point: 'analytics 어휘가 신호',
};

describe('gradeQuiz', () => {
  it('ranks the matching venue first (it is the answer key)', () => {
    const ranked = gradeQuiz(ITEM, VENUES, PROFILES);
    expect(ranked[0].name).toBe('Journal of Learning Analytics');
  });
});

describe('formatQuizQuestion', () => {
  it('lists options A/B and includes the abstract', () => {
    const q = formatQuizQuestion(ITEM, { index: 0, total: 3 });
    expect(q).toContain('A)');
    expect(q).toContain('B)');
    expect(q).toContain('clickstream');
    expect(q).toContain('문제 1/3');
  });
});

describe('formatQuizFeedback', () => {
  it('marks correct/your pick and shows teaching point', () => {
    const ranked = gradeQuiz(ITEM, VENUES, PROFILES);
    const right = formatQuizFeedback(ITEM, 'Journal of Learning Analytics', ranked);
    expect(right).toContain('정답');
    expect(right).toContain('💡');
    const wrong = formatQuizFeedback(ITEM, 'European Journal of Teacher Education', ranked);
    expect(wrong).toContain('1순위');
    expect(wrong).toContain('Journal of Learning Analytics');
  });
});

describe('learn modules', () => {
  it('renders all modules with objectives', () => {
    expect(LEARN_MODULES.length).toBeGreaterThanOrEqual(4);
    const out = formatLearnModules();
    expect(out).toContain('학습 모듈');
    expect(out).toContain('M1.');
    expect(out).toContain('/quiz');
  });
});
