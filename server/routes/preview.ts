import http from 'http';
import net from 'net';
import { existsSync, readFileSync } from 'fs';
import { basename, extname, resolve } from 'path';
import WebSocket from 'ws';
import type { FastifyInstance, FastifyReply, FastifyRequest, RouteShorthandOptions } from 'fastify';
import { getAllPorts, getBasePath, getPort, getServerPort, registerPort } from '../lib/port-registry.js';
import { readConfigForExercise } from '../lib/exercise-config.js';
import { isSafeCandidateName } from '../lib/candidate-name.js';
import { roleForRequest } from './presence.js';
import { rewriteForTunnel, toRequestPayload, waitingPage } from '../lib/preview-html.js';

// Ports the platform and the tunnel use, never a preview target
const RESERVED_PORTS = new Set([3000, 3001, 3099, 4040]);
const PREVIEW_BLOCKED = new Set([
  'index.js', 'state.json', 'AGENTS.md', 'CLAUDE.md',
  'package.json', 'package-lock.json', 'exercise.json', '.claude.json',
]);

const PREVIEW_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

const VITE_INTERNAL_PREFIXES = ['@vite/', '@react-refresh', '@fs/', '__vite', 'node_modules/'];
const BACKEND_PREFIXES = ['api/', 'auth/'];
const PROXY_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'] as const;

type Params = Record<string, string>;

const safeIdentifiers = (params: Params) => isSafeCandidateName(params.candidate) && isSafeCandidateName(params.exercise);
const queryOf = (url: string) => (url.includes('?') ? url.slice(url.indexOf('?')) : '');
const startsWithAny = (value: string, prefixes: string[]) => prefixes.some(prefix => value.startsWith(prefix));

function closeQuietly(target: { close: () => void }) {
  try { target.close(); } catch { /* already closed */ }
}

// Vite's hot reload socket goes through the same preview path. Without it the client falls back to
// ws://localhost:5173, which also makes Chrome ask candidates for access to their local network.
export function proxyPreviewSocket(socket: WebSocket, request: FastifyRequest) {
  const params = request.params as Params;
  const port = safeIdentifiers(params) ? getPort(params.candidate, params.exercise) : null;
  if (!port) {
    try { socket.close(1013, 'app not running'); } catch { /* already closed */ }
    return;
  }
  const protocols = String(request.headers['sec-websocket-protocol'] || '').split(',').map(p => p.trim()).filter(Boolean);
  // Next.js drops the trailing slash; Vite only accepts its socket on the base path, which ends with one
  const [rawPath, rawQuery] = String(request.url).split('?');
  const bareBase = /^\/preview\/[^/]+\/[^/]+$/.test(rawPath);
  const upstreamPath = (bareBase ? rawPath + '/' : rawPath) + (rawQuery ? '?' + rawQuery : '');
  const upstream = new WebSocket(`ws://127.0.0.1:${port}${upstreamPath}`, protocols);

  const pending: Array<{ data: WebSocket.RawData; isBinary: boolean }> = [];
  upstream.on('open', () => {
    for (const message of pending) upstream.send(message.data, { binary: message.isBinary });
    pending.length = 0;
  });
  upstream.on('message', (data, isBinary) => { try { socket.send(data, { binary: isBinary }); } catch { /* client gone */ } });
  upstream.on('close', () => closeQuietly(socket));
  upstream.on('error', () => closeQuietly(socket));
  socket.on('message', (data, isBinary) => {
    if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
    else pending.push({ data, isBinary });
  });
  socket.on('close', () => closeQuietly(upstream));
  socket.on('error', () => closeQuietly(upstream));
}

function fetchHtml(port: number, path: string, redirectsLeft: number): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      const location = res.headers.location;
      const status = res.statusCode ?? 0;
      if (location && status >= 300 && status < 400 && redirectsLeft > 0) {
        res.resume();
        const next = new URL(location, `http://127.0.0.1:${port}`);
        resolvePromise(fetchHtml(port, next.pathname + next.search, redirectsLeft - 1));
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolvePromise(data));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

function isLocalHost(request: FastifyRequest): boolean {
  const forwarded = (request.headers['x-forwarded-host'] as string) || '';
  const host = forwarded || request.headers.host || '';
  return host.startsWith('localhost') || host.startsWith('127.0.0.1');
}

interface Upstream {
  port: number;
  path: string;
  label: string;
  unreachable: string;
}

/** Streams the request to a candidate's dev server or API and streams the answer back */
function pipeRequest(server: FastifyInstance, request: FastifyRequest, reply: FastifyReply, target: Upstream) {
  reply.hijack();
  server.log.info(`[${target.label}] ${request.method} ${request.url} -> localhost:${target.port}${target.path}`);
  const proxyReq = http.request(
    { hostname: '127.0.0.1', port: target.port, path: target.path, method: request.method, headers: request.headers },
    (proxyRes) => {
      reply.raw.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
      proxyRes.pipe(reply.raw);
    },
  );
  proxyReq.on('error', (err) => {
    server.log.error(`[${target.label}] ${err.message}`);
    reply.raw.writeHead(502);
    reply.raw.end(target.unreachable);
  });
  request.raw.pipe(proxyReq);
}

/** Fastify already parsed the body of a write request, so it is sent again instead of piping the raw stream */
function sendParsedRequest(server: FastifyInstance, request: FastifyRequest, reply: FastifyReply, target: Upstream) {
  reply.hijack();
  server.log.info(`[${target.label}] ${request.method} ${request.url} -> localhost:${target.port}${target.path}`);
  const payload = toRequestPayload(request.body);
  const headers = { ...request.headers } as http.OutgoingHttpHeaders;
  if (payload !== undefined) headers['content-length'] = Buffer.byteLength(payload);
  else delete headers['content-length'];
  const proxyReq = http.request(
    { hostname: '127.0.0.1', port: target.port, path: target.path, method: request.method, headers },
    (proxyRes) => {
      reply.raw.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
      proxyRes.pipe(reply.raw);
    },
  );
  proxyReq.on('error', (err) => {
    server.log.error(`[${target.label}] ${err.message}`);
    reply.raw.writeHead(502);
    reply.raw.end(target.unreachable);
  });
  proxyReq.end(payload);
}

async function serveIndex(server: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { candidate, exercise } = request.params as Params;
  const port = getPort(candidate, exercise);

  if (port) {
    try {
      // A Vite started with a base path redirects / to its base, so follow one redirect
      const html = await fetchHtml(port, '/', 1);
      // Vite started with a tunnel base already emits correct prefixed paths and needs its preamble
      const needsRewrite = !isLocalHost(request) && getBasePath(candidate, exercise) === '/';
      const body = needsRewrite ? rewriteForTunnel(html, `/preview/${candidate}/${exercise}`) : html;
      return reply.type('text/html; charset=utf-8').send(body);
    } catch (err) {
      server.log.error({ err }, '[Preview] Failed to proxy index.html');
      return reply.status(502).send('Dev server unreachable');
    }
  }

  const exerciseRoot = resolve(process.cwd(), '.solutions', candidate, exercise);
  if (existsSync(resolve(exerciseRoot, 'index.html'))) {
    return reply.type('text/html; charset=utf-8').send(readFileSync(resolve(exerciseRoot, 'index.html')));
  }
  if (readConfigForExercise(exercise).run.start) {
    return reply.type('text/html; charset=utf-8').send(waitingPage(candidate, exercise));
  }
  return reply.status(404).send('Preview not available for this exercise');
}

function serveStatic(request: FastifyRequest, reply: FastifyReply, filePath: string) {
  const { candidate, exercise } = request.params as Params;
  if (PREVIEW_BLOCKED.has(basename(filePath))) return reply.status(404).send('Not found');
  const fullPath = resolve(process.cwd(), '.solutions', candidate, exercise, filePath);
  if (!existsSync(fullPath)) return reply.status(404).send('Not found');
  const mime = PREVIEW_MIME[extname(filePath).toLowerCase()] ?? 'text/plain';
  return reply.type(mime).send(readFileSync(fullPath));
}

function serveAsset(server: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { candidate, exercise } = request.params as Params;
  const filePath = ((request.params as Params)['*'] as string) || 'index.html';
  const query = queryOf(request.url);

  const isViteInternal = startsWithAny(filePath, VITE_INTERNAL_PREFIXES);
  if (!isViteInternal && startsWithAny(filePath, BACKEND_PREFIXES)) {
    const serverPort = getServerPort(candidate, exercise);
    if (serverPort) {
      return pipeRequest(server, request, reply, { port: serverPort, path: `/${filePath}${query}`, label: 'Proxy Backend', unreachable: 'Backend API server unreachable.' });
    }
  }

  const port = getPort(candidate, exercise);
  if (port) {
    const path = `${getBasePath(candidate, exercise)}${filePath}${query}`;
    return pipeRequest(server, request, reply, { port, path, label: 'Proxy', unreachable: 'Dev server unreachable. Try running your server again.' });
  }
  return serveStatic(request, reply, filePath);
}

function sendToBackend(server: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { candidate, exercise } = request.params as Params;
  const filePath = ((request.params as Params)['*'] as string) || '';
  if (!startsWithAny(filePath, BACKEND_PREFIXES)) return reply.status(404).send('Not found');
  const serverPort = getServerPort(candidate, exercise);
  if (!serverPort) return reply.status(502).send('No backend server running');
  return sendParsedRequest(server, request, reply, { port: serverPort, path: `/${filePath}${queryOf(request.url)}`, label: 'Proxy Backend', unreachable: 'Backend API server unreachable.' });
}

function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const socket = new net.Socket();
    const done = (open: boolean) => { socket.destroy(); resolvePromise(open); };
    socket.setTimeout(1000);
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(false));
    socket.connect(port, '127.0.0.1', () => done(true));
  });
}

async function detectRunningApp(server: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { candidate, exercise } = (request.body ?? {}) as { candidate?: string; exercise?: string };
  if (!candidate || !exercise) return reply.status(400).send({ error: 'missing fields' });
  if (!safeIdentifiers({ candidate, exercise })) return reply.status(400).send({ error: 'invalid candidate or exercise' });

  const expectedPort = readConfigForExercise(exercise).run.port;
  if (!expectedPort) return reply.status(400).send({ error: 'No port specified in config' });

  if (!(await isPortOpen(expectedPort))) {
    return reply.send({ detected: false, port: expectedPort, message: 'Server not running on expected port' });
  }
  registerPort(candidate, exercise, expectedPort);
  server.log.info(`[Auto-detect] Registered ${candidate}/${exercise} -> localhost:${expectedPort}`);
  return reply.send({ detected: true, port: expectedPort, previewUrl: `/preview/${candidate}/${exercise}/` });
}

export async function registerPreviewRoutes(server: FastifyInstance) {
  // @fastify/websocket upgrades a GET route that carries a wsHandler
  const upgrade = { wsHandler: proxyPreviewSocket } as unknown as RouteShorthandOptions;
  const guard = (request: FastifyRequest, reply: FastifyReply): boolean => {
    const params = request.params as Params;
    const traversal = ((params['*'] as string) || '').includes('..');
    if (safeIdentifiers(params) && !traversal) return false;
    reply.status(403).send('Forbidden');
    return true;
  };

  // No trailing slash: serve index.html directly. A redirect loops, because Next.js strips the slash and Fastify adds it back.
  server.get('/preview/:candidate/:exercise', upgrade, async (request, reply) => {
    if (guard(request, reply)) return;
    return serveIndex(server, request, reply);
  });

  server.get('/preview/:candidate/:exercise/*', upgrade, async (request, reply) => {
    if (guard(request, reply)) return;
    return serveAsset(server, request, reply);
  });

  for (const method of PROXY_METHODS) {
    server.route({
      method,
      url: '/preview/:candidate/:exercise/*',
      handler: async (request, reply) => {
        if (guard(request, reply)) return;
        return sendToBackend(server, request, reply);
      },
    });
  }

  server.post('/api/preview/register', async (request, reply) => {
    if (roleForRequest(request) !== 'interviewer') return reply.status(403).send({ error: 'Interviewer only' });
    const { candidate, exercise, port } = (request.body ?? {}) as { candidate?: string; exercise?: string; port?: number };
    if (!candidate || !exercise || !port) return reply.status(400).send({ error: 'missing fields' });
    if (!safeIdentifiers({ candidate, exercise })) return reply.status(400).send({ error: 'invalid candidate or exercise' });
    if (!Number.isInteger(port) || port <= 1024 || port >= 65535 || RESERVED_PORTS.has(port)) return reply.status(400).send({ error: 'invalid port' });
    registerPort(candidate, exercise, port);
    return reply.send({ ok: true, previewUrl: `/preview/${candidate}/${exercise}/` });
  });

  server.get('/api/preview/ports', async (request, reply) => {
    if (roleForRequest(request) !== 'interviewer') return reply.status(403).send({ error: 'Interviewer only' });
    return reply.send({ ports: getAllPorts() });
  });

  server.post('/api/preview/detect', async (request, reply) => detectRunningApp(server, request, reply));
}
