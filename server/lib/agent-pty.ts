import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { basename, dirname, join } from 'path';
import type { IPty } from 'node-pty';
import { sanitizeEnvironment } from './sanitize-env.js';
import { buildTerminalSystemPrompt } from './assistant-prompt.js';
import { BLOCKED_TOOLS, resolveModelId } from './claude-proxy.js';
import { loadPty } from './terminal-session.js';
import { BIN } from './binaries.js';
import { DEFAULT_MODEL } from '../../shared/models.js';
import { hasOpencodeHistory, opencodeArgs, opencodeEnvironment, opencodeHomeDir, seedOpencodeHome, writeOpencodeRules } from './opencode-pty.js';

export type TerminalTool = 'claude-code' | 'opencode';

const TOOL_NAMES: Record<TerminalTool, string> = { 'claude-code': 'Claude Code', opencode: 'OpenCode' };

const MAX_SCROLLBACK = 400_000;

/** What the interviewer's own settings give the terminal: the login and the model names it understands. Nothing else (no status line, hooks, plugins or MCP servers). */
const ROUTER_VARIABLES = [
  'ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY',
  'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'ANTHROPIC_SMALL_FAST_MODEL',
  'CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY',
];

/** The router variables, from the environment `make start` runs in or from the interviewer's ~/.claude/settings.json "env" */
export function routerEnvironment(): Record<string, string> {
  let fromSettings: Record<string, unknown> = {};
  try {
    const settings = JSON.parse(readFileSync(join(homedir(), '.claude', 'settings.json'), 'utf-8'));
    if (settings && typeof settings.env === 'object' && settings.env) fromSettings = settings.env;
  } catch {}
  const result: Record<string, string> = {};
  for (const key of ROUTER_VARIABLES) {
    const value = process.env[key] ?? fromSettings[key];
    if (typeof value === 'string' && value) result[key] = value;
  }
  return result;
}

/** One private Claude Code configuration per candidate and exercise, so none of the interviewer's own setup comes along */
export function agentConfigDir(workPath: string): string {
  return join(dirname(workPath), `.agent-claude-${basename(workPath)}`);
}

/** The config the terminal starts with: no status line, no hooks, no plugins, onboarding and the folder trust question already answered */
export function seedAgentConfig(configDir: string, workPath: string): void {
  mkdirSync(configDir, { recursive: true });
  const settingsPath = join(configDir, 'settings.json');
  // Always written, so a config seeded by an older version gets the same answers.
  // disableAutoMode (top level) is what stops the "make auto mode your default" offer; skipAutoPermissionPrompt does not,
  // because Claude Code removes it at startup whenever the default mode is not auto.
  writeFileSync(settingsPath, JSON.stringify({
    permissions: { defaultMode: 'bypassPermissions' },
    skipDangerousModePermissionPrompt: true,
    disableAutoMode: 'disable',
    theme: 'dark',
    autoUpdates: false,
  }, null, 2));
  const statePath = join(configDir, '.claude.json');
  // Claude Code keys its folder trust by the real path (on a Mac /tmp is /private/tmp), so seed both spellings
  let realPath = workPath;
  try { realPath = realpathSync(workPath); } catch {}
  const trusted = { hasTrustDialogAccepted: true, hasCompletedProjectOnboarding: true, allowedTools: [] };
  if (!existsSync(statePath)) {
    writeFileSync(statePath, JSON.stringify({
      hasCompletedOnboarding: true,
      theme: 'dark',
      bypassPermissionsModeAccepted: true,
      projects: { [workPath]: trusted, [realPath]: trusted },
    }, null, 2));
  }
}

export interface AgentClient {
  send(frame: Record<string, unknown>): void;
}

export interface AgentPtyOptions {
  key: string;
  tool: TerminalTool;
  workPath: string;
  assistantContext: string;
}

const sessions = new Map<string, AgentPtySession>();

export function getAgentSession(key: string): AgentPtySession | undefined {
  return sessions.get(key);
}

export function getOrCreateAgentSession(key: string, make: () => AgentPtyOptions): AgentPtySession {
  let session = sessions.get(key);
  if (!session) {
    session = new AgentPtySession(make());
    sessions.set(key, session);
  }
  return session;
}

export function stopAllAgentSessions(): void {
  for (const session of sessions.values()) session.dispose();
}

/** The arguments Claude Code starts with in the terminal: same limits as the chat, with its own question tool left on */
export function claudeArgs(assistantContext: string, resume: boolean): string[] {
  return [
    '--permission-mode=bypassPermissions',
    '--strict-mcp-config',
    '--no-chrome',
    '--setting-sources', 'user',
    '--disallowedTools', ...BLOCKED_TOOLS.filter(t => t !== 'AskUserQuestion'),
    '--append-system-prompt', buildTerminalSystemPrompt(assistantContext),
    '--model', resolveModelId(DEFAULT_MODEL),
    ...(resume ? ['--continue'] : []),
  ];
}

/**
 * The real Claude Code program in a real terminal, one per candidate and exercise.
 * Every browser attached (the candidate's and the interviewer's) sees the same screen and can type, and nobody is told who typed.
 */
export class AgentPtySession {
  readonly clients = new Set<AgentClient>();
  scrollback = '';
  private child: IPty | null = null;
  private cols = 100;
  private rows = 30;
  private disposed = false;

  constructor(private readonly opts: AgentPtyOptions) {}

  private store(data: string) {
    this.scrollback += data;
    if (this.scrollback.length > MAX_SCROLLBACK) this.scrollback = this.scrollback.slice(this.scrollback.length - MAX_SCROLLBACK);
  }

  private broadcast(frame: Record<string, unknown>) {
    for (const client of this.clients) client.send(frame);
  }

  get running(): boolean {
    return !!this.child;
  }

  attach(client: AgentClient) {
    this.clients.add(client);
    client.send({ type: 'replay', data: this.scrollback });
    client.send({ type: 'status', running: this.running });
    if (!this.child) this.start();
  }

  detach(client: AgentClient) {
    this.clients.delete(client);
  }

  /** What to run for the chosen tool: the program, its arguments and the environment it gets */
  private command(): { bin: string; args: string[]; env: Record<string, string | undefined> } | { error: string } {
    const { workPath, assistantContext, tool } = this.opts;
    const base = { TERM: 'xterm-256color', COLORTERM: 'truecolor' };
    if (tool === 'opencode') {
      const home = opencodeHomeDir(workPath);
      if (!seedOpencodeHome(home)) return { error: 'No OpenCode login was found to copy. Sign in to a provider in OpenCode and pick a default model, or set TRIO_OPENCODE_API_KEY.' };
      writeOpencodeRules(home, assistantContext);
      return {
        bin: BIN.opencode,
        args: opencodeArgs(hasOpencodeHistory(home)),
        env: { ...(sanitizeEnvironment(workPath) as Record<string, string | undefined>), ...opencodeEnvironment(home), ...base },
      };
    }
    const configDir = agentConfigDir(workPath);
    seedAgentConfig(configDir, workPath);
    return {
      bin: BIN.claude,
      args: claudeArgs(assistantContext, existsSync(join(configDir, 'projects'))),
      env: {
        ...(sanitizeEnvironment(workPath) as Record<string, string | undefined>),
        ...routerEnvironment(),
        CLAUDE_CONFIG_DIR: configDir,
        CLAUDE_CODE_SUBAGENT_MODEL: resolveModelId(DEFAULT_MODEL),
        DISABLE_AUTOUPDATER: '1',
        DISABLE_TELEMETRY: '1',
        ...base,
      },
    };
  }

  /** Starts the tool, continuing the conversation it had if the process ended earlier */
  start() {
    if (this.child || this.disposed) return;
    const { workPath, tool } = this.opts;
    const name = TOOL_NAMES[tool];
    const command = this.command();
    if ('error' in command) {
      const text = `\r\n\x1b[31mCould not start ${name}: ${command.error}\x1b[0m\r\n`;
      this.store(text);
      this.broadcast({ type: 'output', data: text });
      return;
    }
    try {
      this.child = loadPty().spawn(command.bin, command.args, {
        name: 'xterm-256color',
        cols: this.cols,
        rows: this.rows,
        cwd: workPath,
        env: command.env as Record<string, string>,
      });
    } catch (err) {
      const text = `\r\n\x1b[31mCould not start ${name}: ${err instanceof Error ? err.message : String(err)}\x1b[0m\r\n`;
      this.store(text);
      this.broadcast({ type: 'output', data: text });
      return;
    }
    const child = this.child;
    child.onData(data => {
      this.store(data);
      this.broadcast({ type: 'output', data });
    });
    child.onExit(({ exitCode }) => {
      if (this.child !== child) return;
      this.child = null;
      if (this.disposed) return;
      const text = `\r\n\x1b[2m--- ${name} ended (${exitCode}). Press Enter to start it again ---\x1b[0m\r\n`;
      this.store(text);
      this.broadcast({ type: 'output', data: text });
      this.broadcast({ type: 'status', running: false });
    });
    this.broadcast({ type: 'status', running: true });
  }

  handleInput(data: string) {
    if (this.child) {
      this.child.write(data);
    } else if (data.includes('\r')) {
      this.start();
    }
  }

  resize(cols: number, rows: number) {
    if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols < 20 || rows < 5) return;
    this.cols = Math.floor(cols);
    this.rows = Math.floor(rows);
    try { this.child?.resize(this.cols, this.rows); } catch {}
  }

  dispose() {
    this.disposed = true;
    const child = this.child;
    this.child = null;
    if (child) { try { child.kill(); } catch {} }
    sessions.delete(this.opts.key);
  }
}
