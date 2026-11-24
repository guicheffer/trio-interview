import type { FastifyInstance } from 'fastify';
import { getAiStatus, runAiHealthCheck } from '../lib/ai-healthcheck.js';
import { roleForRequest } from './presence.js';

export async function registerAiStatusRoutes(server: FastifyInstance) {
  // Candidates only learn whether the assistant works; the reason (budget, router) is for the interviewer
  server.get('/api/ai-status', async (request) => {
    const status = getAiStatus();
    if (roleForRequest(request) === 'interviewer') return status;
    return { ok: status.ok, message: '', model: '', checkedAt: status.checkedAt };
  });

  server.post('/api/ai-status/recheck', async (request, reply) => {
    if (roleForRequest(request) !== 'interviewer') return reply.status(403).send({ error: 'Interviewer only' });
    return runAiHealthCheck();
  });
}
