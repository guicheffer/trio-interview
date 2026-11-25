import { createServer, request as httpRequest, type IncomingMessage, type Server } from 'http';
import { request as httpsRequest } from 'https';
import { randomBytes, timingSafeEqual } from 'crypto';
import { routerEnvironment } from './agent-pty.js';

/**
 * The model router the interviewer's Claude Code already talks to: an address and a key. Nothing about it is written in the code;
 * it is read when the tool runs, from the environment or from the interviewer's Claude settings, the same two places Claude Code
 * itself gets it from.
 */
export interface Router {
  baseUrl: string;
  /** The secret. It stays in this process: it is never written to a file, a log, a page, or the environment of an assistant. */
  token: string;
}

/** A base address is http or https, with no credentials, query or fragment in it, and no spaces */
export function cleanBaseUrl(value: string | undefined): string | null {
  if (!value || /\s/.test(value)) return null;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function readRouter(env: Record<string, string> = routerEnvironment()): Router | null {
  const baseUrl = cleanBaseUrl(env.ANTHROPIC_BASE_URL);
  const token = env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY;
  return baseUrl && token ? { baseUrl, token } : null;
}

/**
 * A model that is only a second way to reach another one, through some other vendor's account, which the router's own key does not
 * cover. A name with a word after the model's name and version ("Claude Sonnet 5 Somevendor") or one of the cloud names is skipped.
 * The caller still confirms the pick with a real request, so a variant this misses is only a wasted try, never a wrong answer.
 */
const VARIANT = /bedrock|vertex|azure|\b(sonnet|opus|haiku|fable)\b[\s\d.-]*[a-z]{3,}\s*$/i;

/**
 * Chooses a mid sized Claude model from the ones a router lists: the newest Sonnet, else the newest of any other kind that is not
 * a vendor variant. The caller still confirms it with one tiny request, because a list can name models that fail.
 */
export function pickModels(listed: Array<{ id: string; created_at?: string }>, preferred = ''): string[] {
  const claude = listed.filter(m => typeof m.id === 'string' && /claude/i.test(m.id) && !VARIANT.test(m.id));
  const newest = (a: { created_at?: string }, b: { created_at?: string }) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));
  const sonnet = claude.filter(m => /sonnet/i.test(m.id)).sort(newest);
  const haiku = claude.filter(m => /haiku/i.test(m.id)).sort(newest);
  const rest = claude.filter(m => !/sonnet|haiku/i.test(m.id)).sort(newest);
  const ids = [...sonnet, ...haiku, ...rest].map(m => m.id);
  return [...new Set([...(preferred ? [preferred] : []), ...ids])];
}

const authHeaders = (router: Router) => ({ authorization: `Bearer ${router.token}`, 'x-api-key': router.token, 'anthropic-version': '2023-06-01' });

async function call(router: Router, path: string, init: { method?: string; body?: string } = {}): Promise<{ status: number; json: any }> {
  const res = await fetch(`${router.baseUrl}${path}`, {
    method: init.method ?? 'GET',
    headers: { ...authHeaders(router), ...(init.body ? { 'content-type': 'application/json' } : {}) },
    body: init.body,
    signal: AbortSignal.timeout(20000),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

export interface RouterModel {
  ok: boolean;
  /** The model that answered a tiny request */
  model: string;
  /** Why not, in a sentence with no address and no key in it */
  problem: string;
}

/**
 * Asks the router which models it has and confirms one with a tiny request (a handful of tokens). `preferred` is tried first.
 * Nothing the router says is returned except the model name and a fixed sentence, so an address or a key can never come out.
 */
export async function chooseRouterModel(router: Router, preferred = ''): Promise<RouterModel> {
  let listed: Array<{ id: string; created_at?: string }> = [];
  try {
    const list = await call(router, '/v1/models');
    if (list.status === 401 || list.status === 403) return { ok: false, model: '', problem: 'the model router did not accept the key' };
    if (Array.isArray(list.json?.data)) listed = list.json.data;
  } catch {
    return { ok: false, model: '', problem: 'the model router did not answer' };
  }
  const candidates = pickModels(listed, preferred).slice(0, 4);
  for (const model of candidates) {
    try {
      const answer = await call(router, '/v1/messages', { method: 'POST', body: JSON.stringify({ model, max_tokens: 8, messages: [{ role: 'user', content: 'Say hi in one word.' }] }) });
      if (answer.status === 200) return { ok: true, model, problem: '' };
    } catch { /* try the next one */ }
  }
  return { ok: false, model: '', problem: candidates.length ? 'the model router listed models but none of them answered' : 'the model router has no Claude model to use' };
}

export interface RouterProxy {
  /** http://127.0.0.1:<port>, the only address an assistant is given */
  url: string;
  /** What the assistant sends as its key. Random, for this one session, and worth nothing anywhere else. */
  key: string;
  close(): void;
}

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Headers that belong to one hop and are not forwarded */
const HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade', 'host', 'content-length']);

/**
 * A small forwarder on this machine's loopback address. An assistant runs inside the operating system sandbox and can read its own
 * folder and its own environment, so a key put there would be readable by whoever types into its terminal. Instead the assistant is
 * given this address and a random key; this process adds the real key and passes the request on. The router's key never enters
 * the assistant's process, its folder or its environment. Only the paths a model call needs are passed on, and nothing is logged.
 */
export function startRouterProxy(router: Router): Promise<RouterProxy> {
  const key = randomBytes(24).toString('hex');
  const target = new URL(router.baseUrl);
  const send = target.protocol === 'https:' ? httpsRequest : httpRequest;
  const basePath = target.pathname.replace(/\/+$/, '');
  const server: Server = createServer((req: IncomingMessage, res) => {
    const given = String(req.headers['x-api-key'] ?? '') || String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    if (!same(given, key)) { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{"error":"unauthorized"}'); return; }
    const path = (req.url ?? '/').split('?')[0];
    if (!/^\/v1\/(messages|models|complete)(\/[A-Za-z0-9._:-]+)?$/.test(path)) { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"error":"not found"}'); return; }
    const headers: Record<string, string | string[]> = {};
    for (const [name, value] of Object.entries(req.headers)) {
      if (value === undefined || HOP.has(name) || name === 'x-api-key' || name === 'authorization') continue;
      headers[name] = value;
    }
    Object.assign(headers, { authorization: `Bearer ${router.token}`, 'x-api-key': router.token, host: target.host });
    const upstream = send({ protocol: target.protocol, hostname: target.hostname, port: target.port || undefined, method: req.method, path: `${basePath}${req.url}`, headers, timeout: 600000 }, (answer) => {
      const back: Record<string, string | string[]> = {};
      for (const [name, value] of Object.entries(answer.headers)) if (value !== undefined && !HOP.has(name)) back[name] = value;
      res.writeHead(answer.statusCode ?? 502, back);
      answer.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' }); res.end('{"error":"the model router could not be reached"}'); });
    upstream.on('timeout', () => upstream.destroy());
    res.on('close', () => upstream.destroy());
    req.pipe(upstream);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') { server.close(); reject(new Error('no port')); return; }
      resolve({ url: `http://127.0.0.1:${address.port}`, key, close: () => { try { server.close(); server.closeAllConnections?.(); } catch {} } });
    });
  });
}
