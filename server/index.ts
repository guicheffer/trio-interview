import { createServer } from 'node:http';
import { getPlatformUrl, setPlatformUrl } from './lib/platform-url.js';
import { PREVIEW_PORT } from '../shared/preview-origin.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { registerChatRoutes } from './routes/chat.js';
import { registerStreamRoutes } from './routes/stream.js';
import { registerExerciseRoutes } from './routes/exercise.js';
import { registerFileRoutes } from './routes/files.js';
import { registerCandidateRoutes } from './routes/candidate.js';
import { registerWatcherRoutes } from './routes/watcher.js';
import { registerTerminalRoutes } from './routes/terminal.js';
import { registerAgentRoutes } from './routes/agent.js';
import { checkAll } from './lib/agent-mode.js';
import { registerUiStateRoutes } from './routes/ui-state.js';
import { registerPresenceRoutes, roleForRequest } from './routes/presence.js';
import { registerInterviewerRoutes } from './routes/interviewer.js';
import { runAiHealthCheck } from './lib/ai-healthcheck.js';
import { registerAiStatusRoutes } from './routes/ai-status.js';
import { originGuard } from './lib/origin-guard.js';
import { accessGate, registerAccessRoutes } from './lib/access-gate.js';
import { registerDatabaseRoutes } from './routes/database.js';
import { registerPreviewRoutes } from './routes/preview.js';
import { setupErrorHandler } from './lib/error-handler.js';
import { createFileWatcher } from './lib/file-watcher.js';

const server = Fastify({
  logger: {
    level: 'info',
  },
  trustProxy: true, // for tunnel forwarding (Phase 3)
});

// Setup global error handler (prevents crashes during interviews)
setupErrorHandler(server);

// Register WebSocket plugin (must be before CORS)
await server.register(websocket);

// Refuse requests to the interviewer side that come from another site (including WebSockets, which ignore CORS)
server.addHook('onRequest', originGuard);

// A candidate gets an answer only with the secret from this interview's link (see access-gate.ts)
server.addHook('onRequest', accessGate);

// The browser only talks to port 3000, which proxies here, so only the app itself needs CORS
await server.register(cors, {
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
});

// Register API routes
await server.register(registerAccessRoutes);
await server.register(registerChatRoutes);
await server.register(registerStreamRoutes);
await server.register(registerExerciseRoutes);
await server.register(registerFileRoutes);
await server.register(registerCandidateRoutes);
await server.register(registerWatcherRoutes);
await server.register(registerUiStateRoutes);
await server.register(registerPresenceRoutes);
await server.register(registerInterviewerRoutes);
await server.register(registerTerminalRoutes);
await server.register(registerAgentRoutes);
await server.register(registerDatabaseRoutes);
await server.register(registerPreviewRoutes);

// Health check endpoint
server.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// The tunnel address, set by make start (the interviewer's machine only)
server.post('/api/platform-url', async (request, reply) => {
  if (roleForRequest(request) !== 'interviewer') return reply.status(403).send({ error: 'Interviewer only' });
  const { url } = (request.body ?? {}) as { url?: unknown };
  if (url !== undefined && !setPlatformUrl(url)) return reply.status(400).send({ error: 'url must be a web address' });
  if (url) server.log.info(`[Platform URL] Updated to: ${getPlatformUrl()}`);
  reply.send({ url: getPlatformUrl() });
});

server.get('/api/platform-url', async (_request, reply) => {
  reply.send({ url: getPlatformUrl() });
});

await registerAiStatusRoutes(server);

// Start server
try {
  await server.listen({ port: 3001, host: 'localhost' });
  console.log('Server listening on http://localhost:3001');

  // A second port for the candidate's app, so it is another origin than the interviewer's page (see shared/preview-origin.ts)
  const previewServer = createServer();
  for (const event of ['request', 'upgrade'] as const) {
    for (const listener of server.server.listeners(event)) previewServer.on(event, listener as (...args: unknown[]) => void);
  }
  previewServer.on('error', (err) => console.error(`Preview port ${PREVIEW_PORT} unavailable, the preview will not load:`, err.message));
  previewServer.listen(PREVIEW_PORT, '127.0.0.1');
  console.log('Exercise path:', process.env.EXERCISE_PATH || 'exercises/fibonacci');

  // Tell the interviewer right away if the assistant will not answer the candidate's messages
  runAiHealthCheck().then(() => checkAll()).catch(() => undefined);

  // Start file watcher for auto-save
  const exercisePath = process.env.EXERCISE_PATH || 'exercises/fibonacci';
  const exerciseId = process.env.EXERCISE_ID || 'fibonacci';
  const candidateName = process.env.CANDIDATE_NAME || null;

  const watcher = createFileWatcher({
    exercisePath,
    exerciseId,
    candidateName,
    debounceMs: 120000, // 2 minutes (120 seconds)
  });

  watcher.start();

  // Log auto-save events
  watcher.on('fileChange', ({ event, filePath, changeCount }) => {
    server.log.info(`[AutoSave] File ${event}: ${filePath} (${changeCount} changes pending)`);
  });

  watcher.on('saving', ({ changeCount }) => {
    server.log.info(`[AutoSave] Saving ${changeCount} changes...`);
  });

  watcher.on('saved', ({ changeCount }) => {
    server.log.info(`[AutoSave] Saved ${changeCount} changes`);
  });

  watcher.on('saveError', ({ error }) => {
    server.log.error('[AutoSave] Save failed:', error);
  });

  console.log('\nAuto-save enabled: Files will be saved 2 minutes after last change\n');
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
