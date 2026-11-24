import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { getActiveSession } from '../lib/active-candidate.js';
import { candidateLink } from '../lib/platform-url.js';
import { connectedCandidates, liveRooms, roleForRequest } from './presence.js';
import { deleteCandidate } from '../lib/candidate-delete.js';
import { applyVisibility, hiddenNow, managedFiles, readRevealed, writeRevealed } from '../lib/visibility.js';

interface CandidateRow {
  name: string;
  exercise: string;
  lastActivity: number;
  active: boolean;
  connected: number;
}

function requireInterviewer(request: FastifyRequest, reply: FastifyReply): boolean {
  if (roleForRequest(request) === 'interviewer') return true;
  reply.status(403).send({ error: 'Interviewer only' });
  return false;
}

export function listCandidateRows(): CandidateRow[] {
  const root = resolve(process.cwd(), '.solutions');
  if (!existsSync(root)) return [];
  const online = connectedCandidates();
  const activeName = getActiveSession()?.candidateName;
  const rows: CandidateRow[] = [];

  for (const name of readdirSync(root)) {
    const dir = join(root, name);
    const statePath = join(dir, 'state.json');
    try {
      if (!statSync(dir).isDirectory() || !existsSync(statePath)) continue;
      const state = JSON.parse(readFileSync(statePath, 'utf-8'));
      const exercises = readdirSync(dir).filter(e => {
        try { return !e.startsWith('.') && statSync(join(dir, e)).isDirectory(); } catch { return false; }
      });
      const exercise: string = state.currentExercise || exercises[0] || '';
      if (!exercise) continue;
      const uiStamp = Number(state.ui?.[exercise]?.updatedAt) || 0;
      const lastActivity = Math.max(uiStamp, Date.parse(state.lastAccessed) || 0, statSync(statePath).mtimeMs);
      rows.push({
        name,
        exercise,
        lastActivity,
        active: name === activeName,
        connected: online[`${name}_${exercise}`] ?? 0,
      });
    } catch {}
  }
  return rows.sort((a, b) => b.connected - a.connected || b.lastActivity - a.lastActivity);
}

function activeContext(): { candidate: string; exercise: string; template: string } | null {
  const active = getActiveSession();
  if (!active) return null;
  return { candidate: active.candidateName, exercise: active.exerciseId, template: active.templatePath };
}

function visibilityStatus(ctx: { candidate: string; exercise: string; template: string }) {
  const managed = managedFiles(ctx.template, ctx.candidate, ctx.exercise);
  const hidden = hiddenNow(ctx.candidate, ctx.exercise);
  return { candidate: ctx.candidate, exercise: ctx.exercise, managed, hidden, revealed: managed.filter(p => !hidden.includes(p)) };
}

export async function registerInterviewerRoutes(server: FastifyInstance) {
  server.get('/api/interviewer/live', async (request, reply) => {
    if (!requireInterviewer(request, reply)) return;
    reply.send({ rooms: liveRooms() });
  });

  // The link to send the candidate. Asked for only when the interviewer opens the share box, never part of the page.
  server.get('/api/interviewer/share-link', async (request, reply) => {
    if (!requireInterviewer(request, reply)) return;
    reply.header('cache-control', 'no-store');
    return reply.send({ url: candidateLink() });
  });

  server.get('/api/interviewer/visibility', async (request, reply) => {
    if (!requireInterviewer(request, reply)) return;
    const ctx = activeContext();
    if (!ctx) return reply.send({ managed: [], hidden: [], revealed: [] });
    return reply.send(visibilityStatus(ctx));
  });

  // Reveal or hide files for the active candidate. Hidden files are moved out of the candidate's folder.
  server.post('/api/interviewer/visibility', async (request, reply) => {
    if (!requireInterviewer(request, reply)) return;
    const ctx = activeContext();
    if (!ctx) return reply.status(409).send({ error: 'No active candidate' });
    const { action, paths } = (request.body ?? {}) as { action?: string; paths?: string[] };

    const managed = managedFiles(ctx.template, ctx.candidate, ctx.exercise);
    let revealed = new Set(readRevealed(ctx.candidate, ctx.exercise));
    const targets = (paths?.length ? paths : managed).filter(p => managed.includes(p));

    if (action === 'reveal' || action === 'reveal-all') targets.forEach(p => revealed.add(p));
    else if (action === 'hide' || action === 'hide-all') targets.forEach(p => revealed.delete(p));
    else return reply.status(400).send({ error: 'action must be reveal, hide, reveal-all or hide-all' });

    writeRevealed(ctx.candidate, ctx.exercise, [...revealed]);
    applyVisibility(ctx.template, ctx.candidate, ctx.exercise);
    server.log.info(`[Visibility] ${action} ${targets.join(', ')} for ${ctx.candidate}`);
    return reply.send(visibilityStatus(ctx));
  });

  server.get('/api/interviewer/candidates', async (request, reply) => {
    if (!requireInterviewer(request, reply)) return;
    return reply.send({ candidates: listCandidateRows(), role: 'interviewer' });
  });

  // Removes a candidate and their exercise folders; never the active or a connected one
  server.delete('/api/interviewer/candidates/:name', async (request, reply) => {
    if (!requireInterviewer(request, reply)) return;
    const { name } = request.params as { name: string };
    const connected = listCandidateRows().find(r => r.name === name)?.connected ?? 0;
    const result = deleteCandidate(name, { activeName: getActiveSession()?.candidateName, connected });
    if (result === 'deleted') return reply.send({ ok: true });
    if (result === 'busy') return reply.status(409).send({ error: 'This candidate is connected or is the active session' });
    return reply.status(result === 'missing' ? 404 : 400).send({ error: result === 'missing' ? 'Candidate not found' : 'Invalid name' });
  });
}
