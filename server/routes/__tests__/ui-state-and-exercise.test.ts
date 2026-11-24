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

  test('the title is the first heading of the brief, and the id is only the fallback', async () => {
    const { writeFileSync } = await import('fs');
    const { join } = await import('path');
    const brief = join(ws.exercise, 'description.md');
    writeFileSync(brief, '# Fibonacci Sequence Generator\n\nBody.');
    expect((await app.inject({ method: 'GET', url: '/api/exercise' })).json().title).toBe('Fibonacci Sequence Generator');
    writeFileSync(brief, 'No heading here, only text.');
    expect((await app.inject({ method: 'GET', url: '/api/exercise' })).json().title).toBe('Demo');
    writeFileSync(brief, '## A second level heading is not the title\n\n# The real title\n');
    expect((await app.inject({ method: 'GET', url: '/api/exercise' })).json().title).toBe('The real title');
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

describe('titleFromBrief', () => {
  test('reads the first top level heading and ignores code blocks and deeper headings', async () => {
    const { titleFromBrief } = await import('../exercise.js');
    expect(titleFromBrief('# GearShare\n\ntext')).toBe('GearShare');
    expect(titleFromBrief('intro\n\n# Title with trailing marks ##\n')).toBe('Title with trailing marks');
    expect(titleFromBrief('```sh\n# a comment in a code block\n```\n# Real\n')).toBe('Real');
    expect(titleFromBrief('## Only a section\n### Another')).toBeNull();
    expect(titleFromBrief('#NoSpace is not a heading')).toBeNull();
    expect(titleFromBrief('')).toBeNull();
  });
});
