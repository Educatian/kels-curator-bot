import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const CHANNEL_ID = '1511354243687252028';

const message = [
  '**KELS Curator Bot 업데이트 안내**',
  '',
  'KELS Curator Bot에 Qwen 기반 기능이 보강되었습니다. 이제 `/ask-kels` 명령으로 KELS 채널에 쌓인 기존 글을 바탕으로 질문할 수 있고, 봇은 관련 게시글 링크를 근거로 개인에게만 답변합니다. 예를 들어 최근 AIED 관련 CFP, learning sciences 채용, 특정 주제의 세미나/자료를 빠르게 찾아볼 수 있습니다.',
  '',
  '추천 페이퍼 기능도 강화되었습니다. 매주 `#academic-resources`에 올라가는 추천 논문에는 OpenAlex 정보뿐 아니라 핵심 주장, 방법론, KELS 회원에게 유용한 이유, 토론 질문이 함께 정리됩니다. 기존처럼 다섯 저널(JLS, IJCSCL, ETR&D, Instructional Science, Cognition and Instruction) 중 매주 한 편만 추천합니다.',
  '',
  '개인화 기능도 조금 더 똑똑해졌습니다. `/profile action:add topic:<관심주제>`로 관심 분야를 등록해두면, 관련 글이 올라왔을 때 왜 내 관심사와 맞는지 간단한 설명과 함께 DM 알림을 받을 수 있습니다. `/watch`는 정확한 키워드 알림, `/profile`은 연구 관심사 기반 추천으로 생각하시면 됩니다.',
  '',
  '포럼 운영 보조 기능도 추가되었습니다. 새 포럼 글이 올라오면 봇이 제목과 태그 후보를 운영자에게 제안합니다. 또한 공개 대화 내용을 바탕으로 관심분야 role을 추론할 수 있지만, Admin & Facilitator와 CommunicationOfficer 같은 운영 role은 자동 부여되지 않도록 차단되어 있습니다.',
].join('\n');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

await client.login(process.env.DISCORD_TOKEN);
const channel = await client.channels.fetch(CHANNEL_ID);
const recent = await channel.messages.fetch({ limit: 10 });
const brokenMessages = recent.filter((item) =>
  item.author.id === client.user.id
  && item.content.includes('KELS Curator Bot')
  && item.content.includes('????'),
);

for (const item of brokenMessages.values()) {
  await item.delete().catch(() => null);
}

const sent = await channel.send(message);
console.log(`Deleted ${brokenMessages.size} broken message(s). Posted ${sent.id} to #${channel.name}.`);
client.destroy();
