import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { FileSandbox, SecurityError } from '../lib/file-sandbox.js';
import { getActiveSession, getWorkPath } from '../lib/active-candidate.js';
import { hiddenFilePath, hiddenNow, mergeHidden } from '../lib/visibility.js';
import { roleForRequest } from './presence.js';
import { isLockedPath } from '../../shared/locks.js';
import { readExerciseConfig } from '../lib/exercise-config.js';
import { trimTrailingSlashes } from '../lib/shell-command.js';
import { dirname, resolve as resolvePath } from 'path';
import { readAiFiles, renameAiFiles } from '../lib/ai-files.js';
import { changedSinceStart } from '../lib/changed-files.js';
import { readFile as readFsFile, writeFile as writeFsFile } from 'fs/promises';
import { currentExerciseId, currentExercisePath } from '../lib/default-exercise.js';

async function lockedPatterns(): Promise<string[]> {
  const session = getActiveSession();
  const config = readExerciseConfig(session?.templatePath ?? process.env.EXERCISE_PATH);
  // Files the exercise withholds are read only for the candidate too, so none can be planted in their place
  return [...config.lockedFiles, ...config.hidden];
}

async function rejectIfLocked(request: FastifyRequest, reply: FastifyReply, ...paths: string[]): Promise<boolean> {
  if (roleForRequest(request) === 'interviewer') return false;
  const patterns = await lockedPatterns();
  if (paths.some(p => isLockedPath(p, patterns))) {
    reply.status(403).send({ error: 'This file is read-only' });
    return true;
  }
  return false;
}

function getSandbox() {
  return new FileSandbox(getWorkPath());
}

export async function registerFileRoutes(server: FastifyInstance) {
  // The file routes work on the active candidate's folder; without one they must not fall back to the exercise template
  server.addHook('preHandler', async (request, reply) => {
    if (request.url.startsWith('/api/files') && !getActiveSession()) {
      return reply.status(409).send({ error: 'No active session' });
    }
  });

  // GET /api/files - List all files recursively (including nested)
  server.get('/api/files', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      let files = await getSandbox().listFilesTree();
      const active = getActiveSession();
      // Only the interviewer sees the files that are still hidden from the candidate
      if (active && roleForRequest(request) === 'interviewer') {
        files = mergeHidden(files, hiddenNow(active.candidateName, active.exerciseId));
      }
      reply.send({ files });
    } catch (error) {
      server.log.error(error);
      reply.status(500).send({ error: 'Failed to list files' });
    }
  });

  // Which files the AI wrote to and which differ from how the exercise started (for the icons in the file tree)
  server.get('/api/files-status', async (_request: FastifyRequest, reply: FastifyReply) => {
    const active = getActiveSession();
    const workPath = getWorkPath();
    const tree = await getSandbox().listFilesTree();
    const files = tree.filter(f => f.type === 'file').map(f => f.path);
    reply.header('cache-control', 'no-store').send({
      ai: readAiFiles(workPath),
      changed: active ? changedSinceStart(workPath, [active.templatePath, resolvePath(process.cwd(), 'exercises')], files) : [],
    });
  });

  // GET /api/files/:path - Read file content
  server.get('/api/files/:path', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { path } = request.params as { path: string };
      const active = getActiveSession();
      if (active && roleForRequest(request) === 'interviewer') {
        const aside = hiddenFilePath(active.candidateName, active.exerciseId, path);
        if (aside) return reply.send({ content: await readFsFile(aside, 'utf-8'), hidden: true });
      }
      const content = await getSandbox().readFile(path);
      reply.send({ content });
    } catch (error) {
      server.log.error(error);
      reply.status(500).send({ error: 'Failed to read file' });
    }
  });

  // POST /api/files - Create new file
  server.post('/api/files', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { path, content = '' } = request.body as { path: string; content?: string };
      if (!path) {
        return reply.status(400).send({ error: 'path is required' });
      }
      if (await rejectIfLocked(request, reply, path)) return;
      server.log.info(`[FileCreate] Creating ${path}`);
      await getSandbox().createFile(path, content);
      server.log.info(`[FileCreate] Created ${path}`);
      reply.status(201).send({ ok: true, path });
    } catch (error) {
      if (error instanceof SecurityError) {
        server.log.warn(`[FileCreate] Security error: ${(error as Error).message}`);
        return reply.status(403).send({ error: (error as Error).message });
      }
      server.log.error({ err: error }, '[FileCreate] Failed to create file');
      reply.status(500).send({ error: 'Failed to create file' });
    }
  });

  // PATCH /api/files/:path - Rename file
  server.patch('/api/files/:path', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { path } = request.params as { path: string };
      const { newName } = request.body as { newName: string };
      if (!newName) {
        return reply.status(400).send({ error: 'newName is required' });
      }
      const renamed = dirname(path) === '.' ? newName : `${dirname(path)}/${newName}`;
      if (await rejectIfLocked(request, reply, path, renamed)) return;
      await getSandbox().renameFile(path, newName);
      renameAiFiles(getWorkPath(), path, renamed);
      reply.send({ ok: true, newName });
    } catch (error) {
      if (error instanceof SecurityError) {
        return reply.status(403).send({ error: error.message });
      }
      server.log.error(error);
      reply.status(500).send({ error: 'Failed to rename file' });
    }
  });

  // POST /api/files-move - Move a file or folder into another folder ("" = root)
  server.post('/api/files-move', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { from, toDir } = request.body as { from: string; toDir: string };
      if (!from || toDir === undefined) return reply.status(400).send({ error: 'from and toDir are required' });
      const name = from.split('/').pop()!;
      const dest = toDir ? `${trimTrailingSlashes(toDir)}/${name}` : name;
      if (dest === from || dest.startsWith(from + '/')) return reply.status(400).send({ error: 'Cannot move a folder into itself' });
      if (await rejectIfLocked(request, reply, from, dest)) return;
      await getSandbox().moveFile(from, dest);
      renameAiFiles(getWorkPath(), from, dest);
      reply.send({ ok: true, path: dest });
    } catch (error) {
      if (error instanceof SecurityError) return reply.status(403).send({ error: (error as Error).message });
      server.log.error(error);
      reply.status(500).send({ error: 'Failed to move file' });
    }
  });

  // DELETE /api/files/:path - Delete a file, or a folder with what is in it
  server.delete('/api/files/:path', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { path } = request.params as { path: string };
      if (!path) return reply.status(400).send({ error: 'path is required' });
      if (roleForRequest(request) !== 'interviewer') {
        const patterns = await lockedPatterns();
        // A folder that holds a read only file cannot be deleted either, or its files would go with it
        const inside = (await getSandbox().listFilesTree()).map(f => f.path).filter(p => p === path || p.startsWith(trimTrailingSlashes(path) + '/'));
        if ([path, ...inside].some(p => isLockedPath(p, patterns))) {
          return reply.status(403).send({ error: 'This file is read-only' });
        }
      }
      const active = getActiveSession();
      if (active && roleForRequest(request) === 'interviewer') {
        // A file still hidden from the candidate lives aside; it is revealed before it can be deleted
        if (hiddenFilePath(active.candidateName, active.exerciseId, path)) {
          return reply.status(409).send({ error: 'Reveal the file to the candidate before deleting it' });
        }
      }
      server.log.info(`[FileDelete] Deleting ${path}`);
      await getSandbox().deletePath(path);
      reply.send({ ok: true });
    } catch (error) {
      if (error instanceof SecurityError) return reply.status(403).send({ error: (error as Error).message });
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return reply.status(404).send({ error: 'File not found' });
      server.log.error({ err: error }, '[FileDelete] Failed to delete');
      reply.status(500).send({ error: 'Failed to delete' });
    }
  });

  // PUT /api/files/:path - Save file content (from editable Monaco)
  server.put('/api/files/:path', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { path } = request.params as { path: string };
      const { content } = request.body as { content: string };
      if (content === undefined) {
        return reply.status(400).send({ error: 'content is required' });
      }
      if (await rejectIfLocked(request, reply, path)) return;
      const active = getActiveSession();
      if (active && roleForRequest(request) === 'interviewer') {
        const aside = hiddenFilePath(active.candidateName, active.exerciseId, path);
        if (aside) {
          await writeFsFile(aside, content, 'utf-8');
          return reply.send({ ok: true, hidden: true });
        }
      }
      server.log.info(`[FileSave] Saving ${path} (${content.length} chars)`);
      await getSandbox().writeFile(path, content);
      server.log.info(`[FileSave] Saved ${path}`);
      reply.send({ ok: true });
    } catch (error) {
      if (error instanceof SecurityError) {
        server.log.warn(`[FileSave] Security error: ${(error as Error).message}`);
        return reply.status(403).send({ error: (error as Error).message });
      }
      server.log.error({ err: error }, '[FileSave] Failed to save file');
      reply.status(500).send({ error: 'Failed to save file' });
    }
  });

  const activeTemplate = () => {
    const session = getActiveSession();
    const templatePath = session?.templatePath ?? currentExercisePath();
    return { templatePath, exerciseId: session?.exerciseId ?? currentExerciseId(templatePath) };
  };

  // GET /api/run-challenge - Returns the run settings of the current exercise
  server.get('/api/run-challenge', async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.send(readExerciseConfig(activeTemplate().templatePath).run);
  });

  // GET /api/tests-config - What the Run tests button needs: the command parts and the names the exercise lists. Null without a tests block
  server.get('/api/tests-config', async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.send({ tests: readExerciseConfig(activeTemplate().templatePath).tests });
  });

  // GET /api/challenge-meta - Returns lockedFiles, defaultFile and exerciseId; the hidden list stays on the server
  server.get('/api/challenge-meta', async (_request: FastifyRequest, reply: FastifyReply) => {
    const { templatePath, exerciseId } = activeTemplate();
    const { lockedFiles, defaultFile } = readExerciseConfig(templatePath);
    reply.send({ lockedFiles, defaultFile, exerciseId });
  });
}
