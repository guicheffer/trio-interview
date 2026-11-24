import type { FastifyReply, FastifyRequest } from 'fastify';
import { roleForRequest } from '../routes/presence.js';

const LOCAL_ORIGINS = new Set([
  'http://localhost:3000', 'http://localhost:3001',
  'http://127.0.0.1:3000', 'http://127.0.0.1:3001',
]);

/**
 * A request that reaches the interviewer side (localhost) must come from the app itself. A web page open in the
 * interviewer's browser can still send requests to localhost, and WebSockets ignore CORS, so a different Origin
 * or a cross-site fetch is refused. Scripts and curl send neither header and are not affected.
 */
export function isForeignOrigin(request: Pick<FastifyRequest, 'headers'>): boolean {
  const origin = request.headers.origin;
  if (typeof origin === 'string' && origin !== 'null' && LOCAL_ORIGINS.has(origin.toLowerCase())) return false;
  if (typeof origin === 'string') return true;
  // The app only ever calls itself. Another origin on the same machine (the candidate's preview) is same-site, not same-origin.
  const site = request.headers['sec-fetch-site'];
  return typeof site === 'string' && site !== 'same-origin' && site !== 'none';
}

export async function originGuard(request: FastifyRequest, reply: FastifyReply) {
  if (roleForRequest(request) !== 'interviewer') return;
  if (isForeignOrigin(request)) return reply.status(403).send({ error: 'Cross-site request refused' });
}
