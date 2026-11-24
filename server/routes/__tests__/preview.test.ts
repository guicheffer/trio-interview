import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import type { FastifyInstance } from 'fastify';
import { LOCAL, TUNNEL, buildApp, makeWorkspace, put, type Workspace } from './harness.js';
import { join } from 'path';

function listen(handler: http.RequestListener): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as AddressInfo).port }));
  });
}

describe('preview routes', () => {
  let ws: Workspace;
  let app: FastifyInstance;
  let dev: { server: http.Server; port: number };
  let api: { server: http.Server; port: number };
  let registry: typeof import('../../lib/port-registry.js');

  beforeAll(async () => {
    ws = makeWorkspace();
    registry = await import('../../lib/port-registry.js');
    const { registerPreviewRoutes } = await import('../preview.js');
    app = await buildApp(registerPreviewRoutes);
    dev = await listen((req, res) => {
      if (req.url === '/') {
        res.setHeader('content-type', 'text/html');
        res.end('<script type="module" src="/@vite/client"></script><script type="module" src="/src/main.tsx"></script>');
      } else {
        res.end(`dev:${req.url}`);
      }
    });
    api = await listen((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => res.end(`api:${req.method}:${req.url}:${body}`));
    });
  });

  afterAll(async () => {
    await app.close();
    dev.server.close();
    api.server.close();
    ws.restore();
  });

  test('rejects path traversal and names that are not plain identifiers', async () => {
    expect((await app.inject({ method: 'GET', url: '/preview/maria/demo/..%2Fsecret', headers: LOCAL })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/preview/bad%20name/demo/', headers: LOCAL })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/preview/maria/bad%20name', headers: LOCAL })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/preview/..%2Fx/demo/api/a', headers: LOCAL, payload: {} })).statusCode).toBe(403);
  });

  test('has no preview when nothing is running or stored', async () => {
    const res = await app.inject({ method: 'GET', url: '/preview/maria/plain', headers: LOCAL });
    expect(res.statusCode).toBe(404);
  });

  test('serves a static index.html', async () => {
    put(join(ws.root, '.solutions', 'maria', 'demo', 'index.html'), '<h1>static</h1>');
    put(join(ws.root, '.solutions', 'maria', 'demo', 'app.js'), 'console.log(1)');
    put(join(ws.root, '.solutions', 'maria', 'demo', 'state.json'), '{}');

    expect((await app.inject({ method: 'GET', url: '/preview/maria/demo', headers: LOCAL })).body).toBe('<h1>static</h1>');
    const js = await app.inject({ method: 'GET', url: '/preview/maria/demo/app.js', headers: LOCAL });
    expect(js.headers['content-type']).toContain('application/javascript');
    expect((await app.inject({ method: 'GET', url: '/preview/maria/demo/state.json', headers: LOCAL })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/preview/maria/demo/missing.css', headers: LOCAL })).statusCode).toBe(404);
  });

  test('shows a waiting page for an exercise that needs its dev server', async () => {
    const res = await app.inject({ method: 'GET', url: '/preview/ana/demo', headers: LOCAL });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('/api/preview/detect');
  });

  test('proxies the dev server, and rewrites its html behind the tunnel', async () => {
    registry.registerPort('maria', 'demo', dev.port);

    const local = await app.inject({ method: 'GET', url: '/preview/maria/demo', headers: LOCAL });
    expect(local.body).toContain('/@vite/client');

    const tunnel = await app.inject({ method: 'GET', url: '/preview/maria/demo', headers: TUNNEL });
    expect(tunnel.body).not.toContain('@vite/client');
    expect(tunnel.body).toContain('src="/preview/maria/demo/src/main.tsx"');

    const asset = await app.inject({ method: 'GET', url: '/preview/maria/demo/src/app.ts?x=1', headers: LOCAL });
    expect(asset.body).toBe('dev:/src/app.ts?x=1');
  });

  test('answers 502 when the dev server went away', async () => {
    registry.registerPort('ghost', 'demo', 1);
    const res = await app.inject({ method: 'GET', url: '/preview/ghost/demo', headers: LOCAL });
    expect(res.statusCode).toBe(502);
    registry.clearPort('ghost', 'demo');
  });

  test('proxies api and auth calls to the exercise backend', async () => {
    registry.registerPort('maria', 'demo', dev.port, api.port);

    const get = await app.inject({ method: 'GET', url: '/preview/maria/demo/api/items?page=2', headers: LOCAL });
    expect(get.body).toBe('api:GET:/api/items?page=2:');

    const post = await app.inject({ method: 'POST', url: '/preview/maria/demo/api/items', headers: LOCAL, payload: { name: 'x' } });
    expect(post.body).toBe('api:POST:/api/items:{"name":"x"}');

    const auth = await app.inject({ method: 'DELETE', url: '/preview/maria/demo/auth/session', headers: LOCAL });
    expect(auth.body).toBe('api:DELETE:/auth/session:');
  });

  test('writes outside api and auth are not proxied, and need a backend', async () => {
    expect((await app.inject({ method: 'POST', url: '/preview/maria/demo/other', headers: LOCAL, payload: {} })).statusCode).toBe(404);

    registry.registerPort('solo', 'demo', dev.port);
    expect((await app.inject({ method: 'POST', url: '/preview/solo/demo/api/x', headers: LOCAL, payload: {} })).statusCode).toBe(502);
    registry.clearPort('solo', 'demo');
  });

  test('registers and lists ports, with validation', async () => {
    const register = (payload: object, headers = LOCAL) => app.inject({ method: 'POST', url: '/api/preview/register', headers, payload });
    expect((await register({ candidate: 'maria' })).statusCode).toBe(400);
    expect((await register({ candidate: '../x', exercise: 'demo', port: 5000 })).statusCode).toBe(400);
    for (const port of [80, 3000, 3001, 4040, 70000, 5055.5]) {
      expect((await register({ candidate: 'bob', exercise: 'demo', port })).statusCode, String(port)).toBe(400);
    }
    expect((await register({ candidate: 'bob', exercise: 'demo', port: 5055 }, TUNNEL)).statusCode).toBe(403);

    const ok = await register({ candidate: 'bob', exercise: 'demo', port: 5055 });
    expect(ok.json()).toEqual({ ok: true, previewUrl: '/preview/bob/demo/' });

    expect((await app.inject({ method: 'GET', url: '/api/preview/ports', headers: TUNNEL })).statusCode).toBe(403);
    const list = await app.inject({ method: 'GET', url: '/api/preview/ports', headers: LOCAL });
    expect(list.json().ports.map((p: { candidate: string }) => p.candidate)).toContain('bob');
  });

  const setRun = (run: unknown) => put(join(ws.exercise, 'exercise.json'), typeof run === 'string' ? run : JSON.stringify({ run }));

  test('detects a running app from the exercise config', async () => {
    setRun({ port: dev.port });
    const up = await app.inject({ method: 'POST', url: '/api/preview/detect', payload: { candidate: 'cy', exercise: 'demo' } });
    expect(up.json()).toMatchObject({ detected: true, port: dev.port, previewUrl: '/preview/cy/demo/' });
    expect(registry.getPort('cy', 'demo')).toBe(dev.port);

    setRun({ port: 1 });
    const down = await app.inject({ method: 'POST', url: '/api/preview/detect', payload: { candidate: 'di', exercise: 'demo' } });
    expect(down.json()).toMatchObject({ detected: false, port: 1 });
  });

  test('detect validates its input and config', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/preview/detect', payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/preview/detect', payload: { candidate: '../x', exercise: 'demo' } })).statusCode).toBe(400);

    setRun('{ not json');
    expect((await app.inject({ method: 'POST', url: '/api/preview/detect', payload: { candidate: 'ed', exercise: 'demo' } })).statusCode).toBe(400);

    setRun({ port: null });
    expect((await app.inject({ method: 'POST', url: '/api/preview/detect', payload: { candidate: 'fy', exercise: 'demo' } })).statusCode).toBe(400);
  });
});
