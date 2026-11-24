import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { sessionManager } from '../lib/session-manager.js';
import { MODELS, MODEL_KEYS } from '../../shared/models.js';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { resolveModelId } from '../lib/claude-proxy.js';
import { sanitizeEnvironment } from '../lib/sanitize-env.js';
import { BIN } from '../lib/binaries.js';
import { cleanTitle } from '../lib/output-parsing.js';
import { mergeChanges } from '../lib/ai-changes.js';

const chatSchema = z.object({
  message: z.string().min(1).max(10000),
  sessionId: z.string().min(1),
  claudeSessionId: z.string().optional(),
  model: z.enum(MODEL_KEYS).optional(),
  openFile: z.string().max(300).optional(),
  plan: z.boolean().optional(),
  terminals: z.object({
    tabs: z.array(z.object({ id: z.string().max(60), label: z.string().max(60) })).max(12),
    active: z.string().max(60).optional(),
  }).optional(),
});

export async function registerChatRoutes(server: FastifyInstance) {
  server.get('/api/models', async () => MODELS);

  server.post('/api/chat', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { message, sessionId, claudeSessionId, model, openFile, plan, terminals } = chatSchema.parse(request.body);

      // Get or create Claude process for this session
      const claudeProxy = sessionManager.getOrCreate(sessionId, model);

      // If we have a stored Claude session ID from the frontend, restore it for --resume
      if (claudeSessionId && !claudeProxy.claudeSessionId) {
        claudeProxy.claudeSessionId = claudeSessionId;
      }

      // Send message to Claude stdin
      claudeProxy.sendMessage(message, openFile, plan, terminals);

      reply.send({ status: 'sent' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.status(400).send({ error: 'Invalid request', details: error.issues });
      } else {
        // Log error but keep server running
        server.log.error({ err: error }, '[Chat Error]');
        reply.status(500).send({ error: 'Internal server error' });
      }
    }
  });

  // A short title for a chat, written by the fastest model whatever model the chat itself uses
  server.post('/api/chat/title', async (request: FastifyRequest, reply: FastifyReply) => {
    const { message } = request.body as { message?: string };
    if (!message?.trim()) return reply.status(400).send({ error: 'message required' });
    const prompt = `Write a title of 2 to 5 words for a chat that starts with the request below. Reply with the title only, no quotes, no punctuation at the end.\n\nRequest:\n${message.slice(0, 600)}`;
    const title = await new Promise<string>((resolve) => {
      const child = spawn(BIN.claude, ['-p', prompt, '--model', resolveModelId('haiku'), '--strict-mcp-config', '--no-chrome', '--disable-slash-commands', '--tools', ''], {
        cwd: tmpdir(),
        env: sanitizeEnvironment(tmpdir()) as NodeJS.ProcessEnv,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      let out = '';
      child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
      const timer = setTimeout(() => { child.kill('SIGTERM'); resolve(''); }, 25000);
      child.on('exit', (code) => { clearTimeout(timer); resolve(code === 0 ? out : ''); });
      child.on('error', () => { clearTimeout(timer); resolve(''); });
    });
    reply.send({ title: cleanTitle(title) });
  });

  // Slash commands that act on the session itself
  server.post('/api/chat/command', async (request: FastifyRequest, reply: FastifyReply) => {
    const { sessionId, command, claudeSessionId } = request.body as { sessionId: string; command: string; claudeSessionId?: string };
    if (!sessionId) return reply.status(400).send({ error: 'sessionId required' });
    const proxy = sessionManager.getOrCreate(sessionId);
    if (claudeSessionId && !proxy.claudeSessionId) proxy.claudeSessionId = claudeSessionId;
    if (command === 'undo') {
      const files = proxy.undoLastTurn();
      return reply.send({ ok: files.length > 0, files });
    }
    if (command === 'compact') {
      const ok = await proxy.compact();
      return reply.send({ ok });
    }
    reply.status(400).send({ error: 'Unknown command' });
  });

  // What the AI changed in its last turn, so the editor can offer to review and undo it
  server.get('/api/chat/changes', async (_request: FastifyRequest, reply: FastifyReply) => {
    // The interviewer's tab and the candidate's have a session each; both see what either one's AI changed
    reply.header('cache-control', 'no-store').send({ changes: mergeChanges(sessionManager.all()), writing: sessionManager.all().some(p => p.isWriting) });
  });

  // The person undid some or all of the AI's changes to a file; the AI is told with the next message, the chat never shows it
  server.post('/api/chat/review', async (request: FastifyRequest, reply: FastifyReply) => {
    const { sessionId, file, action } = (request.body ?? {}) as { sessionId?: unknown; file?: unknown; action?: unknown };
    const valid = typeof sessionId === 'string' && typeof file === 'string' && file.length > 0 && file.length <= 300
      && ![...file].some(ch => ch.charCodeAt(0) < 32) && (action === 'part' || action === 'all' || action === 'redo');
    if (!valid) return reply.status(400).send({ error: 'Invalid request' });
    // Whoever sends the next message tells the AI, whichever tab the change came from
    for (const proxy of sessionManager.all()) proxy.noteReview(file, action);
    reply.send({ ok: true });
  });

  // Stop current Claude request
  server.post('/api/chat/stop', async (request: FastifyRequest, reply: FastifyReply) => {
    const { sessionId } = request.body as { sessionId: string };
    if (sessionId) {
      const proxy = sessionManager.getOrCreate(sessionId);
      proxy.cancelCurrent();
    }
    reply.send({ status: 'stopped' });
  });

  // Cleanup endpoint
  server.post('/api/session/end', async (request: FastifyRequest, reply: FastifyReply) => {
    const { sessionId } = request.body as { sessionId: string };
    sessionManager.end(sessionId);
    reply.send({ status: 'ended' });
  });
}
