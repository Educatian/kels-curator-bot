// Educational: venue-matching quiz + guided learning modules for Discord.
//
// The quiz reuses the submission-fit scorecard as the answer key (the venue it
// ranks highest among the 4 options is "correct"), framed as a mentor heuristic.
// Pure grading/formatting; index.js loads items/venues/profiles and wires buttons.

import { rankSubmissionFit } from './submission-fit.js';

/** Rank a quiz item's options with the scorecard. ranked[0] = correct answer. */
export function gradeQuiz(item, venueList, profiles) {
  const inputs = (item.options || []).map((name) => {
    const v = (venueList || []).find((x) => x.name === name);
    return { name, type: v?.type, impact: v?.impact, cfpDaysUntil: null, cfpVerified: false };
  });
  return rankSubmissionFit(item.abstract, inputs, profiles);
}

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

/** Question text listing the options as A/B/C/D. */
export function formatQuizQuestion(item, { index = null, total = null } = {}) {
  const head = (index !== null && total !== null) ? `문제 ${index + 1}/${total}\n` : '';
  const opts = (item.options || []).map((o, i) => `**${LETTERS[i]})** ${o}`).join('\n');
  return `${head}🎓 **투고처 매칭 연습**\n\n> ${item.abstract}\n\n이 초록은 어느 venue에 가장 잘 맞을까요?\n${opts}`;
}

/** Feedback after a pick: comparative scores + why-terms + teaching point. */
export function formatQuizFeedback(item, pickedName, ranked) {
  const correct = ranked[0]?.name;
  const right = pickedName === correct;
  const byName = {};
  ranked.forEach((r) => { byName[r.name] = r; });
  const lines = (item.options || []).map((o) => {
    const mark = o === correct ? '✅' : (o === pickedName ? '❌' : '•');
    const sc = byName[o] ? ` — ${byName[o].overall}` : '';
    return `${mark} ${o}${sc}`;
  });
  const why = ranked[0]?.sharedTerms?.length ? ranked[0].sharedTerms.slice(0, 5).join(', ') : '';
  const verdict = right
    ? '✅ **정답!**'
    : `🟡 스코어카드는 **${correct}**를 1순위로 봅니다.`;
  return [
    verdict,
    '',
    lines.join('\n'),
    why ? `\n왜: ${why}` : '',
    item.teaching_point ? `\n💡 ${item.teaching_point}` : '',
    '\n_스코어카드는 정답이 아니라 멘토 휴리스틱이에요. 주제·방법론·커뮤니티 적합을 따로 따져보세요._',
  ].filter((x) => x !== '').join('\n');
}

// Guided learning modules (academic publishing literacy / field enculturation).
export const LEARN_MODULES = [
  {
    title: '분야 지형 읽기',
    objective: '학습과학/EdTech의 주요 저널·학회가 어떻게 연결되는지 감 잡기',
    steps: [
      '`/field-map`에 관심 주제를 넣어 어느 카테고리에 가까운지 본다',
      '`/venue-scout`로 strong/adjacent/exploratory lane을 비교한다',
      '`🧪 방법론` 지형(웹앱)에서 연구 문화별 venue 묶음을 살핀다',
    ],
  },
  {
    title: '투고처 고르기',
    objective: '내 초록을 주제·방법론·CFP 준비도로 매칭하기',
    steps: [
      '`/venue-scout`에 초록을 붙여 적합도 스코어카드를 본다',
      '상위 후보의 "왜(why)" 용어로 주제/방법론 신호를 해석한다',
      '`/quiz`로 매칭 감각을 연습한다 (정답은 스코어카드)',
    ],
  },
  {
    title: 'CFP 해독 + 타임라인',
    objective: '마감·제출물·검증 출처를 읽고 투고 계획 세우기',
    steps: [
      '`/cfp-helper`에 CFP 본문/링크를 넣어 scope·마감·체크리스트를 정리한다',
      '검증된 CFP의 D-day와 공식 소스 링크를 확인한다',
      '`/watch`로 관심 분야 마감 알림을 받는다',
    ],
  },
  {
    title: '방법론 문화 구별',
    objective: '실험·질적·설계·데이터/AI·리뷰·이론 venue를 구별하기',
    steps: [
      '`🧪 방법론`(웹앱)에서 6개 연구 문화별 대표 venue를 본다',
      '`/quiz`의 방법론 대비 문항(질적 vs 분석)을 풀어본다',
      '같은 주제라도 방법론이 다르면 venue가 달라짐을 확인한다',
    ],
  },
];

export function formatLearnModules() {
  const blocks = LEARN_MODULES.map((m, i) => {
    const steps = m.steps.map((s, j) => `  ${j + 1}. ${s}`).join('\n');
    return `**M${i + 1}. ${m.title}**\n🎯 ${m.objective}\n${steps}`;
  });
  return `📚 **FieldExplorer 학습 모듈**\n출판 리터러시와 분야 입문을 단계별로 연습해요.\n\n${blocks.join('\n\n')}\n\n바로 연습: \`/quiz\` · 웹앱: https://fieldexplorer10.vercel.app`;
}
