import { describe, expect, it } from 'vitest';
import worker from '../cloudflare/kels-bot-logs/src/worker.js';

describe('recent log page size', () => {
  it.each([
    ['', 25], ['?limit=10', 10], ['?limit=1000', 100],
    ['?limit=-1', 1], ['?limit=0', 25], ['?limit=invalid', 25],
  ])('bounds the database limit for %s', async (query, expected) => {
    let boundLimit;
    const env = {
      LOG_TOKEN: 'fixture-token',
      DB: { prepare: () => ({ bind: (limit) => {
        boundLimit = limit;
        return { all: async () => ({ results: [] }) };
      } }) },
    };
    const request = new Request(`https://fixture.invalid/logs/recent${query}`, {
      headers: { authorization: 'Bearer fixture-token' },
    });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(200);
    expect(boundLimit).toBe(expected);
  });

  it('does not query the database without authorization', async () => {
    const response = await worker.fetch(new Request('https://fixture.invalid/logs/recent'), {
      LOG_TOKEN: 'fixture-token',
      DB: { prepare: () => { throw new Error('unexpected database access'); } },
    });
    expect(response.status).toBe(401);
  });
});
