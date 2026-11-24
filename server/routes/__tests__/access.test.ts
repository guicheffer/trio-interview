import { randomBytes } from 'crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { LOCAL, TUNNEL, buildApp } from './harness.js';
import { ACCESS_COOKIE, accessCookie, accessGate, hasAccess, isValidToken, registerAccessRoutes } from '../../lib/access-gate.js';

// Made fresh for every run, the way make start makes it, so there is no fixed secret in the repository
const TOKEN = randomBytes(16).toString('hex');

describe('interview access link', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp(async (server) => {
      server.addHook('onRequest', accessGate);
      await registerAccessRoutes(server);
      server.get('/api/files', async () => ({ files: ['secret.md'] }));
      server.get('/preview/x/y/', async () => 'preview');
    });
  });

  afterAll(() => app.close());
  beforeEach(() => { process.env.TRIO_ACCESS_TOKEN = TOKEN; });
  afterEach(() => { delete process.env.TRIO_ACCESS_TOKEN; });

  const cookieFor = (token: string) => accessCookie(token, false).split(';')[0];

  test('a candidate without the cookie gets nothing', async () => {
    for (const url of ['/api/files', '/preview/x/y/']) {
      expect((await app.inject({ method: 'GET', url, headers: TUNNEL })).statusCode).toBe(401);
    }
  });

  test('the interviewer on localhost is not asked for anything', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/files', headers: LOCAL })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/access', headers: LOCAL })).json()).toEqual({ required: false, granted: true });
  });

  test('the page can ask whether the link is needed', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/access', headers: TUNNEL });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ required: true, granted: false });
  });

  test('the right secret trades for a cookie that opens everything', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/access', headers: TUNNEL, payload: { token: TOKEN } });
    expect(res.statusCode).toBe(200);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain(`${ACCESS_COOKIE}=`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain(TOKEN);

    const next = await app.inject({ method: 'GET', url: '/api/files', headers: { ...TUNNEL, cookie: cookie.split(';')[0] } });
    expect(next.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/access', headers: { ...TUNNEL, cookie: cookie.split(';')[0] } })).json()).toEqual({ required: true, granted: true });
  });

  test('a wrong or missing secret is refused and sets nothing', async () => {
    for (const payload of [{ token: 'nope' }, { token: '' }, {}, { token: 42 }]) {
      const res = await app.inject({ method: 'POST', url: '/api/access', headers: TUNNEL, payload });
      expect(res.statusCode).toBe(401);
      expect(res.headers['set-cookie']).toBeUndefined();
    }
  });

  test('a cookie from an earlier interview stops working when a new one starts', async () => {
    const old = cookieFor('0000000000000000000000000000ffff');
    expect((await app.inject({ method: 'GET', url: '/api/files', headers: { ...TUNNEL, cookie: old } })).statusCode).toBe(401);
  });

  test('a made up cookie is not enough', async () => {
    for (const value of ['x', 'z'.repeat(64), '0'.repeat(64)]) {
      const res = await app.inject({ method: 'GET', url: '/api/files', headers: { ...TUNNEL, cookie: `${ACCESS_COOKIE}=${value}` } });
      expect(res.statusCode).toBe(401);
    }
  });

  test('the cookie is marked Secure behind https', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/access', headers: { ...TUNNEL, 'x-forwarded-proto': 'https' }, payload: { token: TOKEN } });
    expect(String(res.headers['set-cookie'])).toContain('Secure');
  });

  test('without the variable, a candidate on a *.localhost address is let in for development', async () => {
    delete process.env.TRIO_ACCESS_TOKEN;
    const dev = { host: 'candidate.localhost:3000' };
    expect((await app.inject({ method: 'GET', url: '/api/files', headers: dev })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/access', headers: dev })).json()).toEqual({ required: false, granted: true });
  });

  test('without the variable, a tunnel opened by hand gets nothing', async () => {
    delete process.env.TRIO_ACCESS_TOKEN;
    expect((await app.inject({ method: 'GET', url: '/api/files', headers: TUNNEL })).statusCode).toBe(503);
    expect((await app.inject({ method: 'GET', url: '/preview/x/y/', headers: TUNNEL })).statusCode).toBe(503);
    expect((await app.inject({ method: 'GET', url: '/api/access', headers: TUNNEL })).json()).toEqual({ required: true, granted: false });
    expect((await app.inject({ method: 'GET', url: '/api/files', headers: LOCAL })).statusCode).toBe(200);
  });

  test('a secret that is too short is treated as not set', async () => {
    process.env.TRIO_ACCESS_TOKEN = 'short';
    expect(isValidToken('short')).toBe(false);
    expect(hasAccess({ headers: {} })).toBe(true);
    expect((await app.inject({ method: 'GET', url: '/api/files', headers: TUNNEL })).statusCode).toBe(503);
  });

  test('the preview port of the interviewer reaches the preview and nothing else', async () => {
    const preview = { host: 'localhost:3099' };
    expect((await app.inject({ method: 'GET', url: '/preview/x/y/', headers: preview })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/files', headers: preview })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/files', headers: { ...TUNNEL, 'x-forwarded-host': 'localhost:3099, ' + TUNNEL.host } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/preview/x/y/', headers: TUNNEL })).statusCode).toBe(401);
  });

  test('other cookies next to it are fine', async () => {
    const cookie = `theme=dark; ${cookieFor(TOKEN)}; other=1`;
    expect((await app.inject({ method: 'GET', url: '/api/files', headers: { ...TUNNEL, cookie } })).statusCode).toBe(200);
  });
});
