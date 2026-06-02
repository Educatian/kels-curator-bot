import 'dotenv/config';
import { Client, Events, GatewayIntentBits } from 'discord.js';

const CHANNEL_ID = '1511354243687252028';

const message = [
  '**KELS Curator Bot 고도화 업데이트**',
  '',
  '추천/큐레이션 기능을 보강했습니다. `KELS Tech Signal`은 이제 arXiv 논문만 보지 않고 GitHub repository 후보도 함께 수집해서, 이번 주에 더 볼 만한 항목 하나만 `#academic-resources`에 공유하도록 바뀌었습니다. 추천 근거는 `왜 지금 중요한가`, `교육공학 적용`, `Learning Sciences 적용`, `이슈테이킹 토픽`, `토론 질문` 형식으로 고정했습니다.',
  '',
  '월간 `Research Radar`는 `KELS Monthly Knowledge Flow`로 고도화했습니다. 이제 단순 카운트가 아니라 커뮤니티 pulse, emerging topics, cross-channel knowledge bridge, evidence trail, 참여 nudges를 함께 보여줍니다. 연구적으로는 KELS 안에서 어떤 주제가 형성되고 연결되는지 추적할 수 있는 learning analytics 기반이 됩니다.',
  '',
  '추천 페이퍼와 `KELS Tech Signal`에는 참여 프롬프트를 추가했습니다. 링크를 읽고 끝나는 대신, 회원들이 “내 연구/수업 맥락에서 어떻게 적용할 수 있는가”, “먼저 검증해야 할 한계는 무엇인가” 같은 낮은 문턱의 댓글을 남길 수 있게 설계했습니다.',
  '',
  '`#announcement` 이벤트 자동화도 확장했습니다. 공고에서 날짜, 시간, timezone을 읽고 Zoom/RSVP/Google Form 링크를 같이 감지합니다. 시작 1시간 전 `@everyone` 리마인더는 유지하고, D-1 리마인더 옵션과 이벤트 종료 후 “녹화/슬라이드/후속 자료가 있으면 공유해주세요” follow-up thread 생성도 추가했습니다. 이미 끝난 이벤트는 리마인더 대상에서 제외됩니다.',
  '',
  '온보딩은 자기소개 글에서 본명뿐 아니라 관심분야, 소속/단계, 찾는 정보를 추출해 `Full Name 님` thread에 맞춤 질문, 추천 채널, 추천 slash command를 붙입니다. role 자동태깅은 더 보수적으로 바꿔서 확실한 기존 role만 자동 부여하고, 애매한 후보나 새 role 생성 아이디어는 운영자 검토 흐름으로 보냅니다. Admin & Facilitator와 CommunicationOfficer 계열 role은 계속 자동 부여/생성 대상에서 제외됩니다.',
  '',
  '`/ask-kels`도 근거 중심으로 보강했습니다. “최근 CFP만”, “교수 채용만”, “AIED 관련만” 같은 필터를 더 잘 잡고, 답변에는 관련 원문 링크, 날짜, 채널, 관련도 정보를 붙입니다. 근거가 약하면 억지로 답하지 않고 `근거 부족`으로 표시하도록 했습니다.',
].join('\n');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

client.once(Events.ClientReady, async () => {
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    const sent = await channel.send(message);
    console.log(`Posted advanced curation update ${sent.id} to #${channel.name}.`);
  } finally {
    client.destroy();
  }
});

await client.login(process.env.DISCORD_TOKEN);
