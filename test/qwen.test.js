import { describe, expect, it } from 'vitest';
import {
  createQwenClient,
  extractIntroFullNameWithQwen,
  inferMemberRolesWithQwen,
  parseJsonObject,
} from '../src/qwen.js';

describe('Qwen helpers', () => {
  it('parses JSON even when surrounded by model chatter', () => {
    expect(parseJsonObject('Here:\n{"ok":true}\nDone')).toEqual({ ok: true });
  });

  it('normalizes role inference results from Ollama JSON', async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        response: JSON.stringify({
          matches: [
            { role: '#LearningAnalytics/EDM', confidence: 0.91, reason: 'mentions LA', create: false },
          ],
        }),
      }),
    });
    const qwen = createQwenClient({
      qwenEnabled: true,
      qwenBaseUrl: 'http://localhost:11434',
      qwenModel: 'qwen2.5-coder:7b',
      qwenTimeoutMs: 1000,
    }, fetchImpl);

    await expect(inferMemberRolesWithQwen(qwen, {
      messageText: 'I work on learning analytics dashboards.',
      existingRoles: ['LearningAnalytics/EDM'],
      currentRoles: [],
    })).resolves.toEqual([
      {
        role: 'LearningAnalytics/EDM',
        confidence: 0.91,
        reason: 'mentions LA',
        create: false,
      },
    ]);
  });

  it('extracts a full name from self-introduction fallback patterns', async () => {
    const qwen = createQwenClient({ qwenEnabled: false });
    await expect(extractIntroFullNameWithQwen(qwen, '안녕하세요. 이름은 김영신입니다. 교육공학에 관심 있습니다.')).resolves.toMatchObject({
      fullName: '김영신',
    });
  });
});
