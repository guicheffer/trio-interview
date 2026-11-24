import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, makeWorkspace, type Workspace } from './harness.js';

describe('ui-state and exercise routes', () => {
  let ws: Workspace;
  let app: FastifyInstance;

  beforeAll(async () => {
    ws = makeWorkspace();
    const { registerUiStateRoutes } = await import('../ui-state.js');
    const { registerExerciseRoutes } = await import('../exercise.js');
    app = await buildApp(async (s) => { await registerUiStateRoutes(s); await registerExerciseRoutes(s); });
  });

  afterAll(async () => {
    await app.close();
    ws.restore();
  });

  test('serves the exercise title and description', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/exercise' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: 'demo', title: 'Demo', description: '# Demo\nDo the thing.' });
  });

  test('stores and returns ui state per candidate and exercise', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: '/api/ui-state',
      payload: { candidate: 'maria', exercise: 'demo', updatedAt: 42, keys: { trio_cc_tabs: '["a"]' } },
    });
    expect(put.json()).toEqual({ ok: true });

    const get = await app.inject({ method: 'GET', url: '/api/ui-state?candidate=maria&exercise=demo' });
    expect(get.json()).toEqual({ updatedAt: 42, keys: { trio_cc_tabs: '["a"]' } });
  });

  test('returns an empty object when nothing is stored', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/ui-state?candidate=nobody&exercise=demo' });
    expect(res.json()).toEqual({});
  });

  test('rejects names that are not plain identifiers', async () => {
    const query = await app.inject({ method: 'GET', url: '/api/ui-state?candidate=..%2Fetc&exercise=demo' });
    expect(query.statusCode).toBe(400);

    const body = await app.inject({ method: 'POST', url: '/api/ui-state', payload: { candidate: '../x', exercise: 'demo', updatedAt: 1, keys: {} } });
    expect(body.statusCode).toBe(400);

    const missing = await app.inject({ method: 'POST', url: '/api/ui-state', payload: { candidate: 'maria', exercise: 'demo', updatedAt: 1 } });
    expect(missing.statusCode).toBe(400);
  });
});
