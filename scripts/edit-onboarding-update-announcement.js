import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const CHANNEL_ID = '1511354243687252028';
const MESSAGE_ID = '1511361233528557689';

const message = [
  '**KELS Curator Bot 업데이트사항**',
  '',
  '1. `#introduction` 자기소개 온보딩 자동화',
  '- 자기소개 글 본문에서 full name을 추출합니다.',
  '- 추출한 이름으로 `Full Name 님` 형식의 스레드를 자동 생성합니다.',
  '- 생성된 스레드에 연구 관심사, 찾고 있는 기회, 참여하고 싶은 활동을 묻는 follow-up 질문을 남깁니다.',
  '',
  '2. 새 slash command 추가',
  '- `/cfp-helper`: CFP/RFP 링크나 공고 텍스트를 넣으면 scope, 마감, KELS fit, 준비 체크리스트를 요약합니다.',
  '- `/topic-digest`: AIED, CSCL, learning analytics, AI ethics 등 특정 주제로 최근 KELS archive를 요약합니다.',
  '- 두 명령 모두 실행한 사람에게만 보입니다.',
  '',
  '3. 운영 보조 기능 보강',
  '- 무료 Nitro, 초대 링크 도배, 과도한 URL/멘션, 반복 도배 등 명백한 스팸은 자동 삭제됩니다.',
  '- 현재 role이 없던 회원들에게 `KELS:OnboardingNeeded` role을 적용했습니다.',
  '- 이후 자기소개와 온보딩을 통해 더 적절한 관심분야 role로 이어질 수 있습니다.',
  '',
  '4. 안전장치',
  '- Admin & Facilitator, CommunicationOfficer, admin/communication 계열 role은 자동 생성/부여되지 않습니다.',
].join('\n');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
await client.login(process.env.DISCORD_TOKEN);
const channel = await client.channels.fetch(CHANNEL_ID);
const discordMessage = await channel.messages.fetch(MESSAGE_ID);
await discordMessage.edit(message);
console.log(`Edited update message ${MESSAGE_ID} in #${channel.name}.`);
client.destroy();
