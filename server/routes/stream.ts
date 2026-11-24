import { FastifyInstance, FastifyRequest } from 'fastify';
import { PassThrough } from 'stream';
import { sessionManager } from '../lib/session-manager.js';
import { getWorkPath } from '../lib/active-candidate.js';
import { editEventsFor } from '../lib/stream-events.js';

const PING_MS = 10000;

export async function registerStreamRoutes(server: FastifyInstance) {
  server.get('/api/stream', (request: FastifyRequest, reply) => {
    const sessionId = (request.query as { sessionId?: string }).sessionId;

    if (!sessionId) {
      reply.status(400).send({ error: 'sessionId required' });
      return;
    }

    // Use a PassThrough stream, Fastify-idiomatic SSE approach
    // reply.send(stream) keeps the HTTP response open until stream.end() is called
    const stream = new PassThrough({ encoding: 'utf8' });

    reply
      .type('text/event-stream')
      .header('Cache-Control', 'no-cache, no-transform')
      .header('Connection', 'keep-alive')
      .header('X-Accel-Buffering', 'no')
      .send(stream);

    const send = (event: string, data: unknown) => {
      try {
        stream.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      } catch {}
    };

    send('connection', { type: 'connected', sessionId });
    server.log.info(`[Stream] SSE open: ${sessionId}`);

    const claudeProxy = sessionManager.getOrCreate(sessionId);

    // A page that reloaded while an answer was coming asks for the turn again, so it can show it from the start
    if ((request.query as { replay?: string }).replay === '1') {
      const events = claudeProxy.turnSnapshot();
      send('replay-start', { busy: claudeProxy.isProcessing, count: events.length });
      for (const event of events) send('claude-response', event);
    }

    const eventHandler = (event: unknown) => {
      send('claude-response', event);
      for (const edit of editEventsFor(event, getWorkPath())) send(edit.name, edit.data);
    };
    claudeProxy.on('event', eventHandler);

    const sessionIdHandler = (sid: string) => send('session-id', sid);
    claudeProxy.on('session-id', sessionIdHandler);

    // A named event, not a comment: the page can see it, and treats a stream that went quiet as dead
    const keepAlive = setInterval(() => {
      try { stream.write(`event: ping\ndata: ${Date.now()}\n\n`); } catch { clearInterval(keepAlive); }
    }, PING_MS);

    const cleanup = () => {
      server.log.info(`[Stream] SSE closed: ${sessionId}`);
      clearInterval(keepAlive);
      claudeProxy.removeListener('event', eventHandler);
      claudeProxy.removeListener('session-id', sessionIdHandler);
      try { stream.end(); } catch {}
    };

    request.raw.once('close', cleanup);
    request.raw.once('error', cleanup);
  });
}
