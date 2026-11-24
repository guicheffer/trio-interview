import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { isPreviewHost } from '../../shared/preview-origin.js';
import { effectiveHost, roleForRequest } from '../routes/presence.js';

/**
 * Every interview gets its own secret, made by `make start`, kept only in the environment of the running servers.
 * The link the candidate receives carries it after a # (so it is never sent to a server or written to a log). The page
 * trades it once for a cookie, and from then on the server answers a candidate only when the cookie is there. A link
 * from an earlier interview, or an address somebody guessed, gets nothing. The interviewer (localhost) is not affected.
 * Without the variable (plain `npm run dev`, tests) a candidate on a *.localhost address is let in for development, but any
 * other address is refused: a tunnel opened by hand in front of servers started without `make start` gets nothing.
 */
export const ACCESS_COOKIE = 'trio_access';
const COOKIE_MAX_AGE = 12 * 60 * 60;
const MAX_FAILURES = 30;
const FAILURE_WINDOW_MS = 60_000;

const digest = (value: string) => createHash('sha256').update(value).digest();
const same = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

let failures: number[] = [];

export function accessToken(): string | null {
  const token = process.env.TRIO_ACCESS_TOKEN;
  return token && token.length >= 16 ? token : null;
}

export function isValidToken(candidate: unknown): boolean {
  const token = accessToken();
  return !!token && typeof candidate === 'string' && candidate.length > 0 && candidate.length <= 200 && same(digest(candidate), digest(token));
}

function readCookie(header: string | undefined, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

/** True when nothing is required, or the request carries the cookie made from this interview's secret */
export function hasAccess(request: Pick<FastifyRequest, 'headers'>): boolean {
  const token = accessToken();
  if (!token) return true;
  const value = readCookie(request.headers.cookie, ACCESS_COOKIE);
  return value !== null && /^[0-9a-f]{64}$/.test(value) && same(Buffer.from(value, 'hex'), digest(token));
}

export function accessCookie(token: string, secure: boolean): string {
  return `${ACCESS_COOKIE}=${digest(token).toString('hex')}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${secure ? '; Secure' : ''}`;
}

function tooManyFailures(now: number): boolean {
  failures = failures.filter(t => now - t < FAILURE_WINDOW_MS);
  return failures.length >= MAX_FAILURES;
}

const DEV_HOST = /^(.+\.)?localhost(:\d+)?$/i;

const hostOf = effectiveHost;

/**
 * The interviewer's browser shows the candidate's app from a port of its own (shared/preview-origin.ts), so what the
 * candidate wrote cannot reach the interviewer's origin. That port is only open on this machine and never holds the
 * link cookie, so it may reach the preview and nothing else.
 */
function isPreviewOrigin(request: FastifyRequest): boolean {
  if (!isPreviewHost(hostOf(request))) return false;
  const path = request.url.split('?')[0];
  return path.startsWith('/preview/') || path === '/api/preview/detect';
}

/** Runs before every route, WebSockets and the preview included */
export async function accessGate(request: FastifyRequest, reply: FastifyReply) {
  if (roleForRequest(request) !== 'candidate') return;
  // The page asks here whether it needs the link, and trades the secret here
  if (request.url.split('?')[0] === '/api/access') return;
  if (isPreviewOrigin(request)) return;
  if (!accessToken()) {
    if (DEV_HOST.test(hostOf(request))) return;
    return reply.status(503).send({ error: 'This interview was not started with make start, so there is no private link. Start it with make start.' });
  }
  if (hasAccess(request)) return;
  return reply.status(401).send({ error: 'Open the link your interviewer sent you' });
}

export async function registerAccessRoutes(server: FastifyInstance) {
  // Tells the page whether it needs the secret from the link, and whether it already has it
  server.get('/api/access', async (request) => {
    const candidate = roleForRequest(request) === 'candidate';
    const open = !candidate || (!accessToken() && DEV_HOST.test(hostOf(request)));
    return { required: candidate && !open, granted: open || (accessToken() !== null && hasAccess(request)) };
  });

  server.post('/api/access', async (request, reply) => {
    if (roleForRequest(request) !== 'candidate') return { granted: true };
    const now = Date.now();
    if (tooManyFailures(now)) return reply.status(429).send({ error: 'Too many tries, wait a minute' });
    const token = (request.body as { token?: unknown } | null)?.token;
    if (!isValidToken(token)) {
      failures.push(now);
      return reply.status(401).send({ error: 'This link is not valid anymore, ask your interviewer for the current one' });
    }
    const secure = String(request.headers['x-forwarded-proto'] ?? '').includes('https');
    reply.header('set-cookie', accessCookie(token as string, secure));
    return { granted: true };
  });
}
