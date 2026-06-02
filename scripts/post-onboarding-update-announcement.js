import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const CHANNEL_ID = '1511354243687252028';

const message = [
  '**KELS Curator Bot 추가 업데이트 안내**',
  '',
  '자기소개 온보딩 기능이 추가되었습니다. 이제 `#introduction`에 자기소개 글이 올라오면, 봇이 글 본문에서 full name을 추출해 `Full Name 님` 형식의 스레드를 자동으로 만듭니다. 예를 들어 자기소개에 “My name is Haeli Lee” 또는 “이름은 김영신입니다”라고 적혀 있으면 `Haeli Lee 님`, `김영신 님` 형태로 스레드가 생성됩니다.',
  '',
  '생성된 온보딩 스레드에는 Qwen 기반 follow-up 질문도 자동으로 달립니다. 연구 관심사, 찾고 있는 기회, 참여하고 싶은 활동을 자연스럽게 물어보도록 구성되어 있어, 새 회원이 KELS 안에서 더 쉽게 자기 관심사를 연결할 수 있습니다.',
  '',
  '새 slash command도 추가되었습니다. `/cfp-helper`는 CFP/RFP 링크나 공고 텍스트를 넣으면 scope, 마감, KELS fit, 준비 체크리스트를 요약합니다. `/topic-digest`는 AIED, CSCL, learning analytics, AI ethics 같은 특정 주제로 최근 KELS archive를 따로 요약해줍니다. 두 명령 모두 실행한 사람에게만 보입니다.',
  '',
  '운영 보조 기능도 보강되었습니다. 명백한 스팸, 예를 들어 무료 Nitro, 초대 링크 도배, 과도한 URL/멘션, 반복 도배 등은 자동 삭제됩니다. 또한 현재 role이 없던 회원들에게는 `KELS:OnboardingNeeded` role을 적용해, 이후 자기소개와 온보딩을 통해 더 적절한 관심분야 role로 이어질 수 있게 했습니다.',
].join('\n');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
await client.login(process.env.DISCORD_TOKEN);
const channel = await client.channels.fetch(CHANNEL_ID);
const sent = await channel.send(message);
console.log(`Posted onboarding update ${sent.id} to #${channel.name}.`);
client.destroy();
