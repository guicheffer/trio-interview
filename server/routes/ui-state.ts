import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

const SAFE_NAME = /^[A-Za-z0-9_-]{1,64}$/;

function statePath(candidate: string): string {
  return join(resolve(process.cwd(), '.solutions'), candidate, 'state.json');
}

function readState(candidate: string): Record<string, any> {
  const p = statePath(candidate);
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return {}; }
}

function writeState(candidate: string, state: Record<string, any>): void {
  const p = statePath(candidate);
  mkdirSync(join(p, '..'), { recursive: true });
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8');
  renameSync(tmp, p);
}

interface PutBody {
  candidate: string;
  exercise: string;
  updatedAt: number;
  keys: Record<string, string>;
  structured?: Record<string, unknown>;
}

export async function registerUiStateRoutes(server: FastifyInstance) {
  server.get('/api/ui-state', async (request: FastifyRequest, reply: FastifyReply) => {
    const { candidate, exercise } = request.query as { candidate?: string; exercise?: string };
    if (!candidate || !exercise || !SAFE_NAME.test(candidate) || !SAFE_NAME.test(exercise)) {
      return reply.status(400).send({ error: 'invalid candidate or exercise' });
    }
    const ui = readState(candidate).ui?.[exercise];
    return reply.send(ui ? { updatedAt: ui.updatedAt, keys: ui.keys } : {});
  });

  const save = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as PutBody;
    if (!body || !SAFE_NAME.test(body.candidate ?? '') || !SAFE_NAME.test(body.exercise ?? '') || typeof body.keys !== 'object') {
      return reply.status(400).send({ error: 'invalid body' });
    }
    const state = readState(body.candidate);
    state.ui = state.ui ?? {};
    const keys = Object.fromEntries(
      Object.entries(body.keys).filter(([key, value]) => key.startsWith('trio_cc_') && key.length <= 300 && typeof value === 'string'),
    );
    state.ui[body.exercise] = { ...(body.structured ?? {}), updatedAt: Number(body.updatedAt) || Date.now(), keys };
    writeState(body.candidate, state);
    return reply.send({ ok: true });
  };

  const opts = { bodyLimit: 8 * 1024 * 1024 };
  server.put('/api/ui-state', opts, save);
  server.post('/api/ui-state', opts, save);
}
