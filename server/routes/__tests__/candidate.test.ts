import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import type { FastifyInstance } from 'fastify';
import { LOCAL, TUNNEL, buildApp, makeWorkspace, type Workspace } from './harness.js';

describe('candidate routes', () => {
  let ws: Workspace;
  let app: FastifyInstance;

  beforeAll(async () => {
    ws = makeWorkspace();
    const { registerCandidateRoutes } = await import('../candidate.js');
    app = await buildApp(registerCandidateRoutes);
  });

  afterAll(async () => {
    await app.close();
    ws.restore();
  });

  test('creates a candidate and refuses a duplicate', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/candidate/create', payload: { name: 'maria', exerciseId: 'demo' } });
    expect(created.statusCode).toBe(200);
    expect(created.json().state.name).toBe('maria');

    const again = await app.inject({ method: 'POST', url: '/api/candidate/create', payload: { name: 'maria', exerciseId: 'demo' } });
    expect(again.statusCode).toBe(409);
  });

  test('validates the create payload', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/candidate/create', payload: { name: 'not valid!', exerciseId: 'demo' } });
    expect(res.statusCode).toBe(400);
  });

  test('reports whether a candidate exists', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/candidate/exists?name=maria' })).json()).toEqual({ exists: true });
    expect((await app.inject({ method: 'GET', url: '/api/candidate/exists?name=nobody' })).json()).toEqual({ exists: false });
    expect((await app.inject({ method: 'GET', url: '/api/candidate/exists' })).statusCode).toBe(400);
  });

  test('activating copies the template, keeps the hidden file out and writes the state', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/candidate/activate', payload: { name: 'ana' } });
    expect(res.statusCode).toBe(200);

    const work = join(ws.root, '.solutions', 'ana', 'demo');
    expect(res.json()).toMatchObject({ ok: true, exerciseId: 'demo', workPath: work });
    expect(existsSync(join(work, 'src', 'index.ts'))).toBe(true);
    expect(existsSync(join(work, 'phases', 'phase-1.md'))).toBe(true);
    expect(existsSync(join(work, 'phases', 'phase-2-hidden.md'))).toBe(false);
    expect(existsSync(join(work, 'exercise.json'))).toBe(false);
    expect(existsSync(join(ws.root, '.solutions', 'ana', 'state.json'))).toBe(true);
  });

  test('a candidate screen cannot switch the interview to a folder that belongs to someone else', async () => {
    await app.inject({ method: 'POST', url: '/api/candidate/activate', headers: LOCAL, payload: { name: 'ana' } });
    const other = await app.inject({ method: 'POST', url: '/api/candidate/activate', headers: TUNNEL, payload: { name: 'maria' } });
    expect(other.statusCode).toBe(403);
    // its own name, a new name and the interviewer all still work
    expect((await app.inject({ method: 'POST', url: '/api/candidate/activate', headers: TUNNEL, payload: { name: 'ana' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/candidate/activate', headers: TUNNEL, payload: { name: 'brand-new' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/candidate/activate', headers: LOCAL, payload: { name: 'maria' } })).statusCode).toBe(200);
  });

  test('a forged x-forwarded-host does not make a visitor the interviewer', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/candidate/activate', headers: { ...TUNNEL, 'x-forwarded-host': `localhost:3000, ${TUNNEL.host}` }, payload: { name: 'ana', forceReset: true } });
    expect(res.statusCode).toBe(403);
  });

  test('activating refuses names that would leave the solutions folder', async () => {
    for (const name of ['../escape', '..', 'a/b', '.hidden']) {
      const res = await app.inject({ method: 'POST', url: '/api/candidate/activate', payload: { name, forceReset: true } });
      expect(res.statusCode, name).toBe(400);
    }
    expect((await app.inject({ method: 'POST', url: '/api/candidate/activate', payload: { name: ' ' } })).statusCode).toBe(400);
  });

  test('reads the state and the completed exercises', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/candidate/maria' })).json().state.currentExercise).toBe('demo');
    expect((await app.inject({ method: 'GET', url: '/api/candidate/nobody' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/candidate/maria/exercises' })).json()).toMatchObject({ exercises: [], current: 'demo' });
    expect((await app.inject({ method: 'GET', url: '/api/candidate/nobody/exercises' })).statusCode).toBe(404);
  });

  test('a path like value is never a candidate', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/candidate/..' });
    expect(res.statusCode).toBe(404);
  });

  test('updates preferences and rejects bad values', async () => {
    const ok = await app.inject({ method: 'PATCH', url: '/api/candidate/maria/preferences', payload: { theme: 'dark', preferences: { a: 1 } } });
    expect(ok.json().state.theme).toBe('dark');

    expect((await app.inject({ method: 'PATCH', url: '/api/candidate/maria/preferences', payload: { theme: 'pink' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: '/api/candidate/nobody/preferences', payload: { theme: 'dark' } })).statusCode).toBe(404);
  });

  test('manual save marks the exercise as completed once', async () => {
    await app.inject({ method: 'POST', url: '/api/candidate/maria/save', payload: { exerciseId: 'demo' } });
    await app.inject({ method: 'POST', url: '/api/candidate/maria/save', payload: { exerciseId: 'demo' } });
    const res = await app.inject({ method: 'GET', url: '/api/candidate/maria/exercises' });
    expect(res.json().exercises).toEqual(['demo']);

    expect((await app.inject({ method: 'POST', url: '/api/candidate/nobody/save', payload: { exerciseId: 'demo' } })).statusCode).toBe(404);
  });

  test('renames a candidate, with the rules', async () => {
    await app.inject({ method: 'POST', url: '/api/candidate/create', payload: { name: 'before', exerciseId: 'demo' } });

    const asInterviewer = await app.inject({ method: 'PATCH', url: '/api/candidate/rename', headers: LOCAL, payload: { oldName: 'before', newName: 'after' } });
    expect(asInterviewer.statusCode).toBe(403);

    expect((await app.inject({ method: 'PATCH', url: '/api/candidate/rename', headers: TUNNEL, payload: { oldName: 'before' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: '/api/candidate/rename', headers: TUNNEL, payload: { oldName: 'before', newName: 'bad name' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: '/api/candidate/rename', headers: TUNNEL, payload: { oldName: '../ana', newName: 'stolen' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: '/api/candidate/rename', headers: TUNNEL, payload: { oldName: 'before', newName: 'maria' } })).statusCode).toBe(409);

    const ok = await app.inject({ method: 'PATCH', url: '/api/candidate/rename', headers: TUNNEL, payload: { oldName: 'before', newName: 'after' } });
    expect(ok.json()).toEqual({ ok: true, newName: 'after' });
    expect(existsSync(join(ws.root, '.solutions', 'after'))).toBe(true);
    expect(existsSync(join(ws.root, '.solutions', 'before'))).toBe(false);
  });

  test('a candidate who is the active one can rename and keep working: the session follows the folder', async () => {
    const { getActiveSession } = await import('../../lib/active-candidate.js');
    expect((await app.inject({ method: 'POST', url: '/api/candidate/activate', headers: TUNNEL, payload: { name: 'first-name' } })).statusCode).toBe(200);
    const renamed = await app.inject({ method: 'PATCH', url: '/api/candidate/rename', headers: TUNNEL, payload: { oldName: 'first-name', newName: 'second-name' } });
    expect(renamed.statusCode).toBe(200);
    expect(getActiveSession()?.candidateName).toBe('second-name');
    expect(getActiveSession()?.workPath).toBe(join(ws.root, '.solutions', 'second-name', 'demo'));
    expect(existsSync(getActiveSession()!.workPath)).toBe(true);
    // the page then activates the new name, which must not be refused
    expect((await app.inject({ method: 'POST', url: '/api/candidate/activate', headers: TUNNEL, payload: { name: 'second-name' } })).statusCode).toBe(200);
  });

  test('lists candidates, for the interviewer only', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/candidates', headers: LOCAL });
    expect(res.json().candidates).toEqual(expect.arrayContaining(['maria', 'ana', 'after']));
    expect((await app.inject({ method: 'GET', url: '/api/candidates', headers: TUNNEL })).statusCode).toBe(403);
  });

  test('only the interviewer can reset a workspace', async () => {
    const asCandidate = await app.inject({ method: 'POST', url: '/api/candidate/activate', headers: TUNNEL, payload: { name: 'maria', forceReset: true } });
    expect(asCandidate.statusCode).toBe(403);
    const asInterviewer = await app.inject({ method: 'POST', url: '/api/candidate/activate', headers: LOCAL, payload: { name: 'maria', forceReset: true } });
    expect(asInterviewer.statusCode).toBe(200);
  });
});
