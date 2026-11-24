import { FastifyInstance, FastifyRequest } from 'fastify';
import { readFileSync, appendFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getWorkPath, getActiveSession } from '../lib/active-candidate.js';
import { readConfigForExercise } from '../lib/exercise-config.js';
import { isCommandAllowed } from '../lib/command-policy.js';
import { prepareTsxCommand } from '../lib/tsx-command.js';
import { detectPort, stripAnsi } from '../lib/output-parsing.js';
import { registerPort } from '../lib/port-registry.js';
import {
  ORIGIN_TOKEN,
  TerminalClient,
  TerminalSession,
  ensurePtyHelperExecutable,
  getOrCreateTerminalSession,
  getTerminalSession,
  stopAllTerminals,
} from '../lib/terminal-session.js';

// PID file for make stop to kill terminal shells
const PID_FILE = join(process.cwd(), '.logs', 'terminal-pids.txt');

function trackPid(pid: number): void {
  try { appendFileSync(PID_FILE, `${pid}\n`); } catch {}
}
function untrackPid(pid: number): void {
  try {
    const lines = readFileSync(PID_FILE, 'utf-8').split('\n').filter(l => l.trim() && l.trim() !== String(pid));
    writeFileSync(PID_FILE, lines.join('\n') + '\n');
  } catch {}
}

const SHELL_ENV_ALLOWLIST = [
  'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'TZ',
  'TMPDIR', 'TEMP', 'TMP', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'COLORTERM',
  'NVM_DIR', 'NVM_BIN', 'NVM_INC',
];

const COMMAND_GROUPS = [
  { name: 'Run code', commands: ['node', 'npm', 'npx', 'tsx', 'ts-node', 'python', 'python3', 'go', 'deno', 'bun', 'ruby', 'php', 'java'] },
  { name: 'Files', commands: ['ls', 'cat', 'head', 'tail', 'mkdir', 'touch', 'cp', 'mv', 'rm', 'find', 'grep', 'wc', 'sort', 'uniq', 'diff'] },
  { name: 'Shell', commands: ['cd', 'pwd', 'echo', 'clear', 'env', 'export', 'which', 'type', 'source'] },
  { name: 'Version managers', commands: ['nvm', 'pyenv', 'rbenv'] },
];

const COMMAND_NOTES = [
  'Only the commands above are available, the terminal is not a full shell.',
  'You stay inside the exercise folder: cd .. and paths outside it are blocked.',
  'Ctrl+C stops the running command. Up and down arrows recall earlier commands.',
];

const PREVIEW_READY_DELAY_MS = 1200;
const RESERVED_PORTS = new Set([3000, 3001, 3099]);

const cleanTab = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);

interface Context {
  candidateName: string;
  exerciseName: string;
  exercisePath: string;
  tab: string;
}

function currentContext(tab: string): Context {
  const active = getActiveSession();
  const exercisePath = getWorkPath();
  return {
    candidateName: active?.candidateName || 'candidate',
    exerciseName: active?.exerciseId || exercisePath.split('/').pop() || 'challenge',
    exercisePath,
    tab,
  };
}

const sessionKey = (ctx: Context) => `${ctx.candidateName}/${ctx.exerciseName}/${ctx.tab}`;

function readPorts(exerciseName: string): { expectedPort: number | null; serverPort: number | null } {
  const { port, serverPort } = readConfigForExercise(exerciseName).run;
  return { expectedPort: port, serverPort };
}

function shellEnvironment(ctx: Context, viteBase: string, serverPort: number | null): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const key of SHELL_ENV_ALLOWLIST) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return {
    ...env,
    PWD: ctx.exercisePath,
    CANDIDATE_NAME: ctx.candidateName,
    EXERCISE_ID: ctx.exerciseName,
    PLATFORM_URL: process.env.PLATFORM_URL || 'http://localhost:3000',
    VITE_BASE: viteBase,
    ...(serverPort ? { PORT: String(serverPort) } : {}),
  };
}

/** Registers the port a dev server announces and tells the terminal once per command that the preview is ready */
function previewWatcher(ctx: Context, viteBase: string, expectedPort: number | null, serverPort: number | null) {
  let announcedFor = -1;
  return (sess: TerminalSession, chunk: string) => {
    const port = detectPort(stripAnsi(chunk));
    if (!port || port <= 1024 || port >= 65535 || RESERVED_PORTS.has(port)) return;
    if (expectedPort && Math.abs(port - expectedPort) > 10) return;
    registerPort(ctx.candidateName, ctx.exerciseName, port, serverPort || undefined, viteBase);
    if (announcedFor === sess.commandsRun) return;
    announcedFor = sess.commandsRun;
    setTimeout(() => {
      sess.emit(`\r\n\x1b[0;32m> Preview ready: \x1b[4;34m${ORIGIN_TOKEN}${viteBase}\x1b[0m\r\n`);
    }, PREVIEW_READY_DELAY_MS);
  };
}

function sessionOptions(ctx: Context) {
  const { expectedPort, serverPort } = readPorts(ctx.exerciseName);
  // The preview always goes through /preview/<candidate>/<exercise>/ so localhost and a tunnel see the same thing
  const viteBase = `/preview/${ctx.candidateName}/${ctx.exerciseName}/`;
  return {
    key: sessionKey(ctx),
    candidate: ctx.candidateName,
    exercise: ctx.exerciseName,
    exercisePath: ctx.exercisePath,
    shell: process.env.SHELL || '/bin/zsh',
    env: shellEnvironment(ctx, viteBase, serverPort),
    checkCommand: (cmd: string) => isCommandAllowed(cmd, ctx.exercisePath),
    prepareCommand: (cmd: string) => prepareTsxCommand(cmd, ctx.exercisePath),
    onTrackPid: trackPid,
    onUntrackPid: untrackPid,
    onOutput: previewWatcher(ctx, viteBase, expectedPort, serverPort),
  };
}

type Message = Record<string, any>;

const TERMINAL_MESSAGES: Record<string, (session: TerminalSession, msg: Message) => void> = {
  data: (session, msg) => { if (typeof msg.data === 'string') session.handleInput(msg.data); },
  run: (session, msg) => { if (typeof msg.command === 'string') session.run(msg.command); },
  resize: (session, msg) => session.resize(Number(msg.cols), Number(msg.rows)),
  clear: (session) => session.clear(),
  stop: (session) => session.stop(),
  close: (session) => session.dispose(),
};

function parseMessage(raw: Buffer): Message | null {
  try { return JSON.parse(raw.toString()); } catch { return null; }
}

const APP_AUTOSTART_DELAY_MS = 1500;
const autoStarted = new Set<string>();

/** A web exercise starts its app by itself, once, the first time a terminal of a fresh session is opened */
function autoStartApp(session: TerminalSession, ctx: Context) {
  const owner = `${ctx.candidateName}/${ctx.exerciseName}`;
  if (session.commandsRun > 0 || autoStarted.has(owner)) return;
  const { start, port } = readConfigForExercise(ctx.exerciseName).run;
  if (!start || !port) return;
  autoStarted.add(owner);
  // Give the page a moment to attach and draw the prompt, then type the command like the Run button does
  setTimeout(() => { if (session.commandsRun === 0) session.run(start); }, APP_AUTOSTART_DELAY_MS);
}

function attachSocket(socket: any, request: FastifyRequest) {
  const url = new URL(request.url, 'http://localhost');
  const ctx = currentContext(cleanTab(url.searchParams.get('tab') || 'main') || 'main');
  const clientOrigin = (request.headers.origin as string) || (request.headers.host ? `http://${request.headers.host}` : 'http://localhost:3000');

  const session = getOrCreateTerminalSession(sessionKey(ctx), () => sessionOptions(ctx));
  const client: TerminalClient = {
    origin: clientOrigin,
    send: (frame) => { try { socket.send(JSON.stringify(frame)); } catch { /* client gone */ } },
  };
  session.attach(client);
  autoStartApp(session, ctx);

  socket.on('message', (raw: Buffer) => {
    const msg = parseMessage(raw);
    if (typeof msg?.type === 'string' && Object.hasOwn(TERMINAL_MESSAGES, msg.type)) TERMINAL_MESSAGES[msg.type](session, msg);
  });
  const gone = () => session.detach(client);
  socket.on('close', gone);
  socket.on('error', gone);
}

/**
 * Terminal sessions live on the server, one per candidate, exercise and tab.
 * Browsers attach and detach (reload, second screen, interviewer view) without touching the
 * running process, and every attached browser sees the same output and can type.
 */
export async function registerTerminalRoutes(server: FastifyInstance) {
  ensurePtyHelperExecutable();

  server.get('/api/terminal/commands', async () => ({ groups: COMMAND_GROUPS, notes: COMMAND_NOTES }));

  server.post('/api/terminal/stop', async (_request, reply) => {
    const killed = stopAllTerminals();
    server.log.info(`[Terminal] Stop requested, ${killed} running commands`);
    return reply.send({ ok: true, killed });
  });

  server.post('/api/terminal/close', async (request, reply) => {
    const { tab } = (request.body ?? {}) as { tab?: string };
    const safeTab = cleanTab(String(tab ?? ''));
    if (!safeTab) return reply.status(400).send({ error: 'tab required' });
    getTerminalSession(sessionKey(currentContext(safeTab)))?.dispose();
    return reply.send({ ok: true });
  });

  server.get('/api/terminal', { websocket: true } as any, attachSocket);
}
