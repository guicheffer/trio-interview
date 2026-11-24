import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { LOCAL, TUNNEL, buildApp } from './harness.js';

const failing = { ok: false, message: 'Your daily AI budget is used up.', model: 'claude-x', checkedAt: 1 };
const working = { ok: true, message: 'OK', model: 'claude-x', checkedAt: 2 };

vi.mock('../../lib/ai-healthcheck.js', () => ({
  getAiStatus: vi.fn(() => failing),
  runAiHealthCheck: vi.fn(async () => working),
}));

describe('ai status routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { registerAiStatusRoutes } = await import('../ai-status.js');
    app = await buildApp(registerAiStatusRoutes);
  });

  afterAll(() => app.close());

  test('the interviewer sees why the assistant is not working', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/ai-status', headers: LOCAL });
    expect(res.json()).toEqual(failing);
  });

  test('a candidate only learns that it is not working', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/ai-status', headers: TUNNEL });
    expect(res.json()).toEqual({ ok: false, message: '', model: '', checkedAt: 1 });
  });

  test('only the interviewer can run the check again', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/ai-status/recheck', headers: TUNNEL })).statusCode).toBe(403);
    const res = await app.inject({ method: 'POST', url: '/api/ai-status/recheck', headers: LOCAL });
    expect(res.json()).toEqual(working);
  });
});
