import { afterEach, describe, expect, test } from 'vitest';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { chooseRouterModel, cleanBaseUrl, pickModels, readRouter, startRouterProxy, type RouterProxy } from '../router-proxy.js';

// Every address, key and model name here is made up. The real ones are read when the tool runs and are never written anywhere.
const REAL_KEY = 'fake-router-key-0123456789';

let servers: Server[] = [];
let proxies: RouterProxy[] = [];
afterEach(() => { for (const s of servers) { s.closeAllConnections?.(); s.close(); } for (const p of proxies) p.close(); servers = []; proxies = []; });

interface Seen { method?: string; url?: string; auth?: string; apiKey?: string; host?: string; body: string }

/** A pretend model router: lists two models, answers one of them and keeps what it was sent */
function fakeRouter(options: { answers?: string[] } = {}): Promise<{ url: string; seen: Seen[] }> {
  const seen: Seen[] = [];
  const answers = options.answers ?? ['Claude Sonnet 9.9'];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, auth: String(req.headers.authorization ?? ''), apiKey: String(req.headers['x-api-key'] ?? ''), host: req.headers.host, body });
      if (req.headers.authorization !== `Bearer ${REAL_KEY}`) { res.writeHead(401); res.end('{"error":"no"}'); return; }
      if (req.url?.endsWith('/v1/models')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: [
          { id: 'Claude Opus 9.9', created_at: '2026-01-01' },
          { id: 'Claude Sonnet 9.9 Elsewhere', created_at: '2026-02-01' },
          { id: 'Claude Sonnet 9.9', created_at: '2026-02-01' },
          { id: 'Claude Sonnet 8.0', created_at: '2025-01-01' },
          { id: 'Something Else', created_at: '2026-03-01' },
        ] }));
        return;
      }
      if (req.url?.endsWith('/v1/messages')) {
        const model = JSON.parse(body).model;
        if (!answers.includes(model)) { res.writeHead(400); res.end('{"error":{"message":"retired"}}'); return; }
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write('data: one\n\n');
        setTimeout(() => { res.end('data: two\n\n'); }, 30);
        return;
      }
      res.writeHead(404); res.end('{}');
    });
  });
  servers.push(server);
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen })));
}

describe('finding the router the way Claude Code does', () => {
  test('needs an address and a key, from the variables Claude Code reads', () => {
    expect(readRouter({ ANTHROPIC_BASE_URL: 'https://router.example/api', ANTHROPIC_AUTH_TOKEN: 'k' })).toEqual({ baseUrl: 'https://router.example/api', token: 'k' });
    expect(readRouter({ ANTHROPIC_BASE_URL: 'https://router.example', ANTHROPIC_API_KEY: 'k2' })?.token).toBe('k2');
    expect(readRouter({ ANTHROPIC_BASE_URL: 'https://router.example' })).toBeNull();
    expect(readRouter({ ANTHROPIC_AUTH_TOKEN: 'k' })).toBeNull();
    expect(readRouter({})).toBeNull();
  });

  test('an address with credentials, a query, a space or another scheme is refused', () => {
    expect(cleanBaseUrl('https://router.example/')).toBe('https://router.example');
    for (const bad of ['ftp://x.example', 'https://u:p@x.example', 'https://x.example?a=1', 'https://x.example#f', 'https://x .example', 'not a url', '', undefined]) expect(cleanBaseUrl(bad as string)).toBeNull();
  });
});

describe('choosing a model the router really serves', () => {
  test('the newest Sonnet comes first, vendor variants are never chosen, and a preferred name goes ahead of them', () => {
    const listed = [
      { id: 'Claude Opus 9.9', created_at: '2026-01-01' }, { id: 'Claude Sonnet 9.9 Elsewhere', created_at: '2026-02-01' },
      { id: 'Claude Sonnet 9.9', created_at: '2026-02-01' }, { id: 'Claude Sonnet 8.0', created_at: '2025-01-01' }, { id: 'Something Else' },
    ];
    expect(pickModels(listed)).toEqual(['Claude Sonnet 9.9', 'Claude Sonnet 8.0', 'Claude Opus 9.9']);
    expect(pickModels(listed, 'mine')[0]).toBe('mine');
  });

  test('confirms with one tiny request and skips a model that does not answer', async () => {
    const router = await fakeRouter({ answers: ['Claude Sonnet 8.0'] });
    const result = await chooseRouterModel({ baseUrl: router.url, token: REAL_KEY });
    expect(result).toEqual({ ok: true, model: 'Claude Sonnet 8.0', problem: '' });
    const asked = router.seen.filter(s => s.url === '/v1/messages').map(s => JSON.parse(s.body));
    expect(asked.map(a => a.model)).toEqual(['Claude Sonnet 9.9', 'Claude Sonnet 8.0']);
    // a few tokens only, so the check costs nothing
    for (const a of asked) expect(a.max_tokens).toBeLessThanOrEqual(8);
  });

  test('says why in one plain sentence, with no address and no key, when the router refuses or has nothing', async () => {
    const router = await fakeRouter();
    const wrong = await chooseRouterModel({ baseUrl: router.url, token: 'wrong' });
    expect(wrong).toMatchObject({ ok: false, problem: 'the model router did not accept the key' });
    const none = await chooseRouterModel({ baseUrl: router.url, token: REAL_KEY }, '');
    expect(none.ok).toBe(true);
    const nobody = await fakeRouter({ answers: [] });
    const failed = await chooseRouterModel({ baseUrl: nobody.url, token: REAL_KEY });
    expect(failed.ok).toBe(false);
    for (const r of [wrong, failed]) expect(JSON.stringify(r)).not.toMatch(/127\.0\.0\.1|fake-router-key/);
    const gone = await chooseRouterModel({ baseUrl: 'http://127.0.0.1:1', token: REAL_KEY });
    expect(gone.problem).toBe('the model router did not answer');
  });
});

describe('the loopback proxy an assistant is given instead of the key', () => {
  const ask = async (proxy: RouterProxy, path: string, headers: Record<string, string>, body?: string) =>
    fetch(proxy.url + path, { method: body ? 'POST' : 'GET', headers, body });

  test('adds the real key itself, and the assistant only ever has a random one', async () => {
    const router = await fakeRouter();
    const proxy = await startRouterProxy({ baseUrl: router.url, token: REAL_KEY });
    proxies.push(proxy);
    expect(proxy.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(proxy.key).not.toContain(REAL_KEY);
    expect(proxy.key.length).toBeGreaterThanOrEqual(32);
    const res = await ask(proxy, '/v1/messages', { 'x-api-key': proxy.key, 'content-type': 'application/json' }, JSON.stringify({ model: 'Claude Sonnet 9.9', max_tokens: 4, messages: [] }));
    expect(res.status).toBe(200);
    const sent = router.seen.at(-1)!;
    expect(sent.auth).toBe(`Bearer ${REAL_KEY}`);
    expect(sent.apiKey).toBe(REAL_KEY);
    expect(sent.host).toBe(new URL(router.url).host);
    // the random key stays on this side: the router never sees it
    expect(JSON.stringify(sent)).not.toContain(proxy.key);
  });

  test('streams the answer as it arrives and gives back nothing that holds the real key', async () => {
    const router = await fakeRouter();
    const proxy = await startRouterProxy({ baseUrl: router.url, token: REAL_KEY });
    proxies.push(proxy);
    const res = await ask(proxy, '/v1/messages', { authorization: `Bearer ${proxy.key}`, 'content-type': 'application/json' }, JSON.stringify({ model: 'Claude Sonnet 9.9' }));
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    expect(await res.text()).toBe('data: one\n\ndata: two\n\n');
    const returned: string[] = [];
    res.headers.forEach((value, name) => returned.push(`${name}: ${value}`));
    expect(returned.join(' ')).not.toContain(REAL_KEY);
  });

  test('a call without the random key, or with the real key, is refused and never reaches the router', async () => {
    const router = await fakeRouter();
    const proxy = await startRouterProxy({ baseUrl: router.url, token: REAL_KEY });
    proxies.push(proxy);
    for (const headers of [{}, { 'x-api-key': 'guess' }, { 'x-api-key': REAL_KEY }, { authorization: 'Bearer ' }] as Array<Record<string, string>>) {
      expect((await ask(proxy, '/v1/models', headers)).status).toBe(401);
    }
    expect(router.seen).toHaveLength(0);
  });

  test('only the paths a model call needs are passed on', async () => {
    const router = await fakeRouter();
    const proxy = await startRouterProxy({ baseUrl: router.url, token: REAL_KEY });
    proxies.push(proxy);
    for (const path of ['/admin', '/v1/keys', '/v1/../admin', '/', '/v1/messages/../../x']) {
      expect((await ask(proxy, path, { 'x-api-key': proxy.key })).status, path).toBe(404);
    }
    expect(router.seen).toHaveLength(0);
    expect((await ask(proxy, '/v1/models', { 'x-api-key': proxy.key })).status).toBe(200);
  });

  test('answers the reachability check Claude Code makes at start itself, forwarding nothing and showing nothing', async () => {
    const router = await fakeRouter();
    const proxy = await startRouterProxy({ baseUrl: router.url, token: REAL_KEY });
    proxies.push(proxy);
    const res = await fetch(`${proxy.url}/api/hello`, { method: 'HEAD' });
    expect(res.status).toBe(200);
    // only that one check, and only as HEAD: the same path asked another way still needs the key and is not passed on
    expect((await fetch(`${proxy.url}/api/hello`)).status).toBe(401);
    expect((await fetch(`${proxy.url}/api/other`, { method: 'HEAD' })).status).toBe(401);
    expect(router.seen).toHaveLength(0);
  });

  test('says plainly when the router cannot be reached, without its address', async () => {
    const proxy = await startRouterProxy({ baseUrl: 'http://127.0.0.1:1', token: REAL_KEY });
    proxies.push(proxy);
    const res = await ask(proxy, '/v1/models', { 'x-api-key': proxy.key });
    expect(res.status).toBe(502);
    expect(await res.text()).not.toMatch(/127\.0\.0\.1:1|fake-router-key/);
  });

  test('each session gets its own key and its own port', async () => {
    const router = await fakeRouter();
    const a = await startRouterProxy({ baseUrl: router.url, token: REAL_KEY });
    const b = await startRouterProxy({ baseUrl: router.url, token: REAL_KEY });
    proxies.push(a, b);
    expect(a.key).not.toBe(b.key);
    expect(a.url).not.toBe(b.url);
    expect((await ask(a, '/v1/models', { 'x-api-key': b.key })).status).toBe(401);
  });
});
