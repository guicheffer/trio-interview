import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { resolve } from 'path';
import { candidateManager } from '../lib/candidate-manager.js';
import { activateCandidate, getActiveSession, renameActiveSession } from '../lib/active-candidate.js';
import { applyVisibility } from '../lib/visibility.js';
import { isSafeCandidateName } from '../lib/candidate-name.js';
import { roleForRequest } from './presence.js';

function interviewerOnly(request: FastifyRequest, reply: FastifyReply): boolean {
  if (roleForRequest(request) === 'interviewer') return true;
  reply.status(403).send({ error: 'Interviewer only' });
  return false;
}

/** The interviewer may open any workspace. A candidate may open a new one, or the one that is already active. */
export function mayUseWorkspace(request: FastifyRequest, name: string, exists: boolean): boolean {
  if (roleForRequest(request) === 'interviewer') return true;
  const active = getActiveSession()?.candidateName;
  return !exists || !active || active === name;
}

const createCandidateSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9-_]+$/, 'Name must be alphanumeric with hyphens/underscores only'),
  exerciseId: z.string().min(1),
});

const updatePreferencesSchema = z.object({
  theme: z.enum(['light', 'dark']).optional(),
  currentExercise: z.string().optional(),
  preferences: z.record(z.string(), z.unknown()).optional(),
});

export async function registerCandidateRoutes(server: FastifyInstance) {
  // Check if candidate exists
  server.get('/api/candidate/exists', async (request: FastifyRequest, reply: FastifyReply) => {
    const { name } = request.query as { name?: string };
    if (!name?.trim()) {
      return reply.status(400).send({ error: 'name required' });
    }
    const exists = candidateManager.candidateExists(name.trim());
    reply.send({ exists });
  });

  // Is this screen's candidate the one the platform is working on? The name of the active one is for the interviewer only.
  server.get('/api/session/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const { name } = request.query as { name?: string };
    const active = getActiveSession()?.candidateName ?? null;
    reply.header('cache-control', 'no-store').send({
      isActive: !!name && active === name,
      ...(roleForRequest(request) === 'interviewer' ? { active } : {}),
    });
  });

  // Activate candidate session, initialises working dir + ensures state.json exists
  server.post('/api/candidate/activate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { name, forceReset } = request.body as { name: string; forceReset?: boolean };
      if (!name?.trim()) return reply.status(400).send({ error: 'name required' });
      const n = name.trim();
      if (!isSafeCandidateName(n)) return reply.status(400).send({ error: 'Invalid name format' });
      // Wiping a workspace is an operator action, the candidate screens never send it
      if (forceReset && !interviewerOnly(request, reply)) return;
      // A candidate screen may start its own workspace, but not switch the interview to a folder that already belongs to someone else
      if (!mayUseWorkspace(request, n, candidateManager.candidateExists(n))) {
        return reply.status(403).send({ error: 'This name belongs to another session' });
      }
      const templatePath = process.env.EXERCISE_PATH || resolve(process.cwd(), 'exercises', 'fibonacci');
      const exerciseId = process.env.EXERCISE_ID || (templatePath.split('/').pop() ?? 'fibonacci');
      // 1. Initialise working directory from template
      const workPath = activateCandidate(n, templatePath, exerciseId, !!forceReset);
      // 2. Ensure state.json exists (so GET /api/candidate/:name works on reload)
      candidateManager.ensureCandidateState(n, exerciseId);
      // 3. Hide the files the exercise starts without (the interviewer can reveal them later)
      applyVisibility(templatePath, n, exerciseId);
      server.log.info(`[Candidate] Activated: ${n} → ${workPath}`);
      reply.send({ ok: true, workPath, exerciseId });
    } catch (err) {
      server.log.error({ err }, '[Candidate] Activate failed');
      reply.status(500).send({ error: (err as Error).message });
    }
  });

  // Rename candidate: .solutions/oldName → .solutions/newName
  server.patch('/api/candidate/rename', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (roleForRequest(request) === 'interviewer') {
        return reply.status(403).send({ error: 'Interviewers cannot rename candidates' });
      }
      const { oldName, newName } = request.body as { oldName: string; newName: string };
      if (!oldName?.trim() || !newName?.trim()) {
        return reply.status(400).send({ error: 'oldName and newName are required' });
      }
      if (!isSafeCandidateName(newName.trim()) || !isSafeCandidateName(oldName.trim())) {
        return reply.status(400).send({ error: 'Invalid name format' });
      }
      if (candidateManager.candidateExists(newName.trim())) {
        return reply.status(409).send({ error: `"${newName.trim()}" already exists, pick a different name` });
      }
      if (candidateManager.candidateExists(oldName.trim())) {
        candidateManager.renameCandidate(oldName.trim(), newName.trim());
        // The platform's working folder moved with it, so everything that reads the active session (files, terminal, assistant) must follow
        renameActiveSession(oldName.trim(), newName.trim());
      }
      // If old folder doesn't exist (candidate never saved anything), nothing to rename
      reply.send({ ok: true, newName: newName.trim() });
    } catch (err) {
      server.log.error({ err }, '[Candidate] Rename failed');
      reply.status(500).send({ error: (err as Error).message });
    }
  });

  // Create new candidate
  server.post('/api/candidate/create', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { name, exerciseId } = createCandidateSchema.parse(request.body);

      // Check if candidate already exists
      if (candidateManager.candidateExists(name)) {
        return reply.status(409).send({
          error: 'Candidate already exists',
          message: `A candidate with name "${name}" already exists. Use a different name or continue existing session.`,
        });
      }

      // Create candidate
      const state = candidateManager.createCandidate(name, exerciseId);

      server.log.info(`[Candidate] Created new candidate: ${name}`);

      reply.send({ success: true, state });
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400).send({ error: 'Invalid request', details: error.issues });
      } else if (error instanceof Error) {
        reply.status(500).send({ error: error.message });
      } else {
        server.log.error(error);
        reply.status(500).send({ error: 'Internal server error' });
      }
    }
  });

  // Get candidate state
  server.get('/api/candidate/:name', async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
    try {
      const { name } = request.params;

      const state = candidateManager.getState(name);

      if (!state) {
        return reply.status(404).send({
          error: 'Candidate not found',
          message: `No candidate found with name "${name}"`,
        });
      }

      reply.send({ success: true, state });
    } catch (error) {
      // Log error but keep server running
      server.log.error({ err: error }, '[Candidate API Error]');
      reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Update candidate preferences
  server.patch('/api/candidate/:name/preferences', async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
    try {
      const { name } = request.params;
      const updates = updatePreferencesSchema.parse(request.body);

      const state = candidateManager.updatePreferences(name, updates);

      server.log.info(`[Candidate] Updated preferences for: ${name}`);

      reply.send({ success: true, state });
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400).send({ error: 'Invalid request', details: error.issues });
      } else if (error instanceof Error) {
        if (error.message.includes('not found')) {
          reply.status(404).send({ error: error.message });
        } else if (error.message.startsWith('Invalid')) {
          reply.status(400).send({ error: error.message });
        } else {
          reply.status(500).send({ error: error.message });
        }
      } else {
        server.log.error(error);
        reply.status(500).send({ error: 'Internal server error' });
      }
    }
  });

  // Manual save trigger
  server.post('/api/candidate/:name/save', async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
    try {
      const { name } = request.params;
      const { exerciseId } = request.body as { exerciseId: string };

      if (!candidateManager.candidateExists(name)) {
        return reply.status(404).send({ error: `Candidate "${name}" not found` });
      }

      // The candidate's files already live in .solutions/<name>/<exercise> and are saved as they type,
      // so there is nothing to copy here (copying the template over them would wipe their work).

      // Update state with exerciseCompleted if not already there
      const state = candidateManager.getState(name);
      if (state && !state.exercisesCompleted.includes(exerciseId)) {
        candidateManager.updatePreferences(name, {
          exercisesCompleted: [...state.exercisesCompleted, exerciseId],
        });
      }

      server.log.info(`[Candidate] Manual save for: ${name}/${exerciseId}`);

      reply.send({ success: true, message: 'Files saved successfully' });
    } catch (error) {
      server.log.error(error);
      reply.status(500).send({ error: 'Failed to save files' });
    }
  });

  // Get completed exercises
  server.get('/api/candidate/:name/exercises', async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
    try {
      const { name } = request.params;

      const state = candidateManager.getState(name);

      if (!state) {
        return reply.status(404).send({ error: `Candidate "${name}" not found` });
      }

      reply.send({
        success: true,
        exercises: state.exercisesCompleted,
        current: state.currentExercise,
      });
    } catch (error) {
      // Log error but keep server running
      server.log.error({ err: error }, '[Candidate API Error]');
      reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // List all candidates (for debugging/admin)
  server.get('/api/candidates', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!interviewerOnly(request, reply)) return;
    try {
      const candidates = candidateManager.listCandidates();
      reply.send({ success: true, candidates });
    } catch (error) {
      // Log error but keep server running
      server.log.error({ err: error }, '[Candidate API Error]');
      reply.status(500).send({ error: 'Internal server error' });
    }
  });
}
