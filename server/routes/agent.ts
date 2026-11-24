import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getActiveSession, getWorkPath } from '../lib/active-candidate.js';
import { readExerciseConfig } from '../lib/exercise-config.js';
import { cachedAvailability, checkClaudeCode, checkOpencode, clearAgentMode, isAgentMode, readAgentMode, writeAgentMode, type AgentMode } from '../lib/agent-mode.js';
import { getAgentSession, getOrCreateAgentSession, type AgentClient, type TerminalTool } from '../lib/agent-pty.js';
import { readInterviewConfig } from '../lib/interview-config.js';
import { toolAllowed } from '../../shared/interview-config.js';
import { roleForRequest } from './presence.js';

type Message = Record<string, any>;

function parseMessage(raw: Buffer): Message | null {
  try { return JSON.parse(raw.toString()); } catch { return null; }
}

/** The tool the candidate picked, but only while the interviewer's settings still allow it */
function currentMode(): AgentMode | null {
  const mode = readAgentMode(getWorkPath());
  return mode && toolAllowed(readInterviewConfig(), mode) ? mode : null;
}

function sessionKey(): string {
  const active = getActiveSession();
  return `${active?.candidateName ?? 'candidate'}/${active?.exerciseId ?? 'exercise'}`;
}

function attachSocket(socket: any) {
  // The terminal only exists for the tool the candidate chose, and only when the interviewer's settings allow it
  const mode = currentMode();
  if (mode !== 'claude-code' && mode !== 'opencode') {
    try { socket.close(4403, 'not enabled'); } catch {}
    return;
  }
  const tool: TerminalTool = mode;
  const workPath = getWorkPath();
  const session = getOrCreateAgentSession(`${sessionKey()}/${tool}`, () => ({
    key: `${sessionKey()}/${tool}`,
    tool,
    workPath,
    assistantContext: readExerciseConfig(getActiveSession()?.templatePath ?? process.env.EXERCISE_PATH).assistantContext,
  }));
  const client: AgentClient = { send: (frame) => { try { socket.send(JSON.stringify(frame)); } catch { /* client gone */ } } };
  session.attach(client);

  socket.on('message', (raw: Buffer) => {
    const msg = parseMessage(raw);
    if (!msg) return;
    if (msg.type === 'data' && typeof msg.data === 'string') session.handleInput(msg.data);
    else if (msg.type === 'resize') session.resize(Number(msg.cols), Number(msg.rows));
  });
  const gone = () => session.detach(client);
  socket.on('close', gone);
  socket.on('error', gone);
}

/** Stops every terminal assistant of the active candidate, so one that is no longer chosen does not keep running (and spending) unseen */
function stopTerminals(except?: AgentMode) {
  for (const tool of ['claude-code', 'opencode'] as const) {
    if (tool !== except) getAgentSession(`${sessionKey()}/${tool}`)?.dispose();
  }
}

function requireInterviewer(request: FastifyRequest, reply: FastifyReply): boolean {
  if (roleForRequest(request) === 'interviewer') return true;
  reply.status(403).send({ error: 'Interviewer only' });
  return false;
}

export async function registerAgentRoutes(server: FastifyInstance) {
  // Both screens read the same answer. The interviewer sees every option but cannot change it; why a tool cannot open is for the interviewer only.
  server.get('/api/agent-mode', async (request) => {
    const interviewer = roleForRequest(request) === 'interviewer';
    const config = readInterviewConfig();
    const availability = cachedAvailability();
    const tools = (['claude-code', 'opencode'] as const).map(tool => ({
      tool,
      allowed: toolAllowed(config, tool),
      ok: availability[tool].ok,
      message: interviewer ? availability[tool].message : '',
      version: interviewer ? availability[tool].version : '',
    }));
    return {
      mode: currentMode(),
      chosen: currentMode() !== null,
      // The candidate decides; the interviewer only watches
      canChoose: !interviewer,
      tools,
    };
  });

  server.post('/api/agent-mode', async (request, reply) => {
    if (roleForRequest(request) === 'interviewer') return reply.status(403).send({ error: 'The candidate chooses the assistant' });
    const { mode } = (request.body ?? {}) as { mode?: unknown };
    if (!isAgentMode(mode)) return reply.status(400).send({ error: 'unknown mode' });
    if (!toolAllowed(readInterviewConfig(), mode)) return reply.status(403).send({ error: 'The interviewer did not allow this assistant' });
    if (mode === 'claude-code' || mode === 'opencode') {
      const availability = mode === 'claude-code' ? await checkClaudeCode() : await checkOpencode();
      // The reason (budget, router, install) is for the interviewer, the candidate only learns it cannot be used
      if (!availability.ok) return reply.status(409).send({ error: 'This assistant is not available right now' });
    }
    stopTerminals(mode);
    writeAgentMode(getWorkPath(), mode);
    return reply.send({ mode });
  });

  // The candidate can go back to the picker and choose again. The terminal that was open stops.
  server.delete('/api/agent-mode', async (request, reply) => {
    if (roleForRequest(request) === 'interviewer') return reply.status(403).send({ error: 'The candidate chooses the assistant' });
    stopTerminals();
    clearAgentMode(getWorkPath());
    return reply.send({ mode: null });
  });

  server.post('/api/agent-mode/check', async (request, reply) => {
    if (!requireInterviewer(request, reply)) return;
    await Promise.all([checkClaudeCode(), checkOpencode()]);
    return reply.send(cachedAvailability());
  });

  server.post('/api/agent-terminal/restart', async (request, reply) => {
    if (!requireInterviewer(request, reply)) return;
    stopTerminals();
    return reply.send({ ok: true });
  });

  server.get('/api/agent-terminal', { websocket: true } as any, attachSocket);
}
