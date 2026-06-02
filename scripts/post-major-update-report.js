import 'dotenv/config';
import { Client, Events, GatewayIntentBits } from 'discord.js';

const CHANNEL_ID = '1511354243687252028';

const message = [
  '**KELS Curator Bot 메이저 업데이트 리포트**',
  '',
  '1. `#academic-resources` 자동 큐레이션이 강화되었습니다.',
  '- 주간 추천 페이퍼는 기존처럼 JLS, IJCSCL, ETR&D, Instructional Science, Cognition and Instruction 중 한 편만 공개 게시합니다.',
  '- 기존 `한국어 3줄 요약`은 제거하고, `이 논문이 던지는 문제`, `핵심 기여`, `방법론 포인트`, `KELS 연구 적용 아이디어`, `읽으면서 볼 쟁점`, `이슈테이킹 토픽`, `토론 질문` 중심의 읽기 가이드로 바꿨습니다.',
  '- 이미 테스트로 올라간 추천 페이퍼 thread도 새 포맷으로 업데이트했습니다.',
  '',
  '2. `KELS Tech Signal`이 추가되었습니다.',
  '- 최근 arXiv AI/ML/HCI tech paper 중 한 편을 골라 `#academic-resources`에 공유합니다.',
  '- 단순 링크 공유가 아니라, 왜 지금 볼 만한지, 교육공학 적용 가능성, Learning Sciences 적용 가능성, 이슈테이킹 토픽과 토론 질문을 함께 정리합니다.',
  '- 테스트 게시도 완료했습니다.',
  '',
  '3. `#announcement` 이벤트 리마인더가 추가되었습니다.',
  '- 시간 정보가 포함된 이벤트 공고는 시작 1시간 전에 다시 리마인드됩니다.',
  '- 리마인더에는 `@everyone`이 붙습니다.',
  '- 이미 시작 시간이 지난 이벤트와 시간 정보가 없는 공고는 자동 제외됩니다.',
  '',
  '4. 온보딩과 운영 보조 기능도 적용되어 있습니다.',
  '- `#introduction` 자기소개 글에서 본명을 추출해 `Full Name 님` 형식의 스레드를 자동 생성합니다.',
  '- 명백한 스팸은 자동 삭제됩니다.',
  '- role 자동태깅은 Admin & Facilitator, CommunicationOfficer, admin/communication 계열 role을 자동 생성/부여하지 않도록 차단되어 있습니다.',
  '',
  '5. slash command 응답 범위',
  '- 일반 slash command 응답은 실행한 사람에게만 보입니다.',
  '- 공개 게시가 필요한 자동 큐레이션, 리마인더, 운영자 지정 게시만 채널에 공개됩니다.',
].join('\n');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

client.once(Events.ClientReady, async () => {
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    const sent = await channel.send(message);
    console.log(`Posted major update report ${sent.id} to #${channel.name}.`);
  } finally {
    client.destroy();
  }
});

await client.login(process.env.DISCORD_TOKEN);
