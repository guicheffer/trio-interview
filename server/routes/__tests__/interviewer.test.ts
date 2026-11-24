import { randomBytes } from 'crypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import type { FastifyInstance } from 'fastify';
import { LOCAL, TUNNEL, buildApp, makeWorkspace, type Workspace } from './harness.js';

describe('interviewer routes', () => {
  let ws: Workspace;
  let app: FastifyInstance;

  beforeAll(async () => {
    ws = makeWorkspace();
    const { registerInterviewerRoutes } = await import('../interviewer.js');
    app = await buildApp(registerInterviewerRoutes);
  });

  afterAll(async () => {
    await app.close();
    ws.restore();
  });

  test('every route is for the interviewer only', async () => {
    for (const url of ['/api/interviewer/live', '/api/interviewer/visibility', '/api/interviewer/candidates', '/api/interviewer/share-link']) {
      const res = await app.inject({ method: 'GET', url, headers: TUNNEL });
      expect(res.statusCode, url).toBe(403);
    }
    const post = await app.inject({ method: 'POST', url: '/api/interviewer/visibility', headers: TUNNEL, payload: { action: 'reveal-all' } });
    expect(post.statusCode).toBe(403);
  });

  test('without an active candidate there is nothing to manage', async () => {
    const get = await app.inject({ method: 'GET', url: '/api/interviewer/visibility', headers: LOCAL });
    expect(get.json()).toEqual({ managed: [], hidden: [], revealed: [] });

    const post = await app.inject({ method: 'POST', url: '/api/interviewer/visibility', headers: LOCAL, payload: { action: 'reveal-all' } });
    expect(post.statusCode).toBe(409);
  });

  test('live rooms start empty', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/interviewer/live', headers: LOCAL });
    expect(res.json()).toEqual({ rooms: [] });
  });

  test('lists the candidates with the active one first in its state', async () => {
    const { activateCandidate } = await import('../../lib/active-candidate.js');
    const { candidateManager } = await import('../../lib/candidate-manager.js');
    const { applyVisibility } = await import('../../lib/visibility.js');
    activateCandidate('maria', ws.exercise, 'demo');
    candidateManager.ensureCandidateState('maria', 'demo');
    applyVisibility(ws.exercise, 'maria', 'demo');

    const res = await app.inject({ method: 'GET', url: '/api/interviewer/candidates', headers: LOCAL });
    expect(res.json().candidates).toEqual([expect.objectContaining({ name: 'maria', exercise: 'demo', active: true, connected: 0 })]);
  });

  test('reveals and hides files for the active candidate', async () => {
    const status = await app.inject({ method: 'GET', url: '/api/interviewer/visibility', headers: LOCAL });
    expect(status.json()).toMatchObject({ managed: ['phases/phase-2-hidden.md'], hidden: ['phases/phase-2-hidden.md'], revealed: [] });

    const revealed = await app.inject({ method: 'POST', url: '/api/interviewer/visibility', headers: LOCAL, payload: { action: 'reveal', paths: ['phases/phase-2-hidden.md'] } });
    expect(revealed.json().revealed).toEqual(['phases/phase-2-hidden.md']);
    expect(existsSync(join(ws.root, '.solutions', 'maria', 'demo', 'phases', 'phase-2-hidden.md'))).toBe(true);

    const hidden = await app.inject({ method: 'POST', url: '/api/interviewer/visibility', headers: LOCAL, payload: { action: 'hide-all' } });
    expect(hidden.json().hidden).toEqual(['phases/phase-2-hidden.md']);
    expect(existsSync(join(ws.root, '.solutions', 'maria', 'demo', 'phases', 'phase-2-hidden.md'))).toBe(false);
  });

  test('ignores paths the exercise does not manage and rejects unknown actions', async () => {
    const ignored = await app.inject({ method: 'POST', url: '/api/interviewer/visibility', headers: LOCAL, payload: { action: 'reveal', paths: ['src/index.ts'] } });
    expect(ignored.json().revealed).toEqual([]);

    const bad = await app.inject({ method: 'POST', url: '/api/interviewer/visibility', headers: LOCAL, payload: { action: 'delete' } });
    expect(bad.statusCode).toBe(400);
  });

  test('the share link is the tunnel address plus this interview\'s private code, for the interviewer only', async () => {
    const { setPlatformUrl } = await import('../../lib/platform-url.js');
    const token = randomBytes(16).toString('hex');
    process.env.TRIO_ACCESS_TOKEN = token;
    try {
      // no tunnel yet
      expect((await app.inject({ method: 'GET', url: '/api/interviewer/share-link', headers: LOCAL })).json()).toEqual({ url: null });
      expect(setPlatformUrl('https://jutta.ngrok-free.dev/some/path?x=1')).toBe(true);
      const res = await app.inject({ method: 'GET', url: '/api/interviewer/share-link', headers: LOCAL });
      expect(res.json()).toEqual({ url: `https://jutta.ngrok-free.dev/#k=${token}` });
      expect(res.headers['cache-control']).toBe('no-store');
      // a candidate never gets it, even with a forged header
      expect((await app.inject({ method: 'GET', url: '/api/interviewer/share-link', headers: { ...TUNNEL, 'x-forwarded-host': 'localhost:3000, ' + TUNNEL.host } })).statusCode).toBe(403);
      // without make start there is no code, so nothing to share
      delete process.env.TRIO_ACCESS_TOKEN;
      expect((await app.inject({ method: 'GET', url: '/api/interviewer/share-link', headers: LOCAL })).json()).toEqual({ url: null });
    } finally {
      delete process.env.TRIO_ACCESS_TOKEN;
      setPlatformUrl('http://localhost:3000');
    }
  });

  test('only a web address is accepted as the platform URL', async () => {
    const { setPlatformUrl, getPlatformUrl } = await import('../../lib/platform-url.js');
    for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'not a url', '', 42, null, 'x'.repeat(400)]) {
      expect(setPlatformUrl(bad), String(bad)).toBe(false);
    }
    expect(getPlatformUrl()).toBe('http://localhost:3000');
  });
});
