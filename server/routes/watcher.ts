import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getFileWatcher } from '../lib/file-watcher.js';
import { getActiveSession } from '../lib/active-candidate.js';
import { isSafeCandidateName } from '../lib/candidate-name.js';
import { roleForRequest } from './presence.js';

export async function registerWatcherRoutes(server: FastifyInstance) {
  // Get watcher status
  server.get('/api/watcher/status', async (_request: FastifyRequest, reply: FastifyReply) => {
    const watcher = getFileWatcher();

    if (!watcher) {
      return reply.send({
        success: false,
        message: 'File watcher not initialized',
      });
    }

    const status = watcher.getStatus();
    reply.send({
      success: true,
      status,
    });
  });

  // Update candidate name in watcher
  server.post('/api/watcher/set-candidate', async (request: FastifyRequest, reply: FastifyReply) => {
    const { candidateName } = (request.body ?? {}) as { candidateName?: string };
    if (typeof candidateName !== 'string' || !isSafeCandidateName(candidateName)) {
      return reply.status(400).send({ success: false, message: 'Invalid name format' });
    }
    // The candidate screen can only point the autosave mirror at its own workspace
    const active = getActiveSession()?.candidateName;
    if (roleForRequest(request) !== 'interviewer' && active && active !== candidateName) {
      return reply.status(403).send({ success: false, message: 'This name belongs to another session' });
    }
    const watcher = getFileWatcher();

    if (!watcher) {
      return reply.status(500).send({
        success: false,
        message: 'File watcher not initialized',
      });
    }

    watcher.setCandidateName(candidateName);

    reply.send({
      success: true,
      message: `Watcher now tracking changes for: ${candidateName}`,
    });
  });
}
