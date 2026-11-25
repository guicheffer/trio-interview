import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { basename, dirname, join } from 'path';
import type { IPty } from 'node-pty';
import { sanitizeEnvironment } from './sanitize-env.js';
import { buildTerminalSystemPrompt } from './assistant-prompt.js';
import { BLOCKED_TOOLS, resolveModelId } from './claude-proxy.js';
import { assistantTmpDir, confinedSettings } from './confinement.js';
import { resolveProgram, sandboxed } from './os-sandbox.js';
export { sandboxed };
import { loadPty } from './terminal-session.js';
import { BIN } from './binaries.js';
import { DEFAULT_MODEL } from '../../shared/models.js';
import { choosePiSource, hasPiHistory, piArgs, piEnvironment, piHomeDir, piProgramFolders, PI_BLOCKED_ENVIRONMENT, readPiLogin, seedPiHome, seedPiRouterHome, writePiRules, type PiSource } from './pi-pty.js';
import { chooseRouterModel, readRouter, startRouterProxy, type RouterProxy } from './router-proxy.js';
import { readInterviewConfig } from './interview-config.js';
import { chooseOpencodeSource, hasOpencodeHistory, opencodeArgs, opencodeEnvironment, opencodeHomeDir, readOpencodeLogin, seedOpencodeHome, seedOpencodeRouterHome, writeOpencodeRules, type OpencodeSource } from './opencode-pty.js';

export type TerminalTool = 'claude-code' | 'opencode' | 'pi';

const TOOL_NAMES: Record<TerminalTool, string> = { 'claude-code': 'Claude Code', opencode: 'OpenCode', pi: 'Pi' };

const MAX_SCROLLBACK = 400_000;

/**
 * The folders Claude Code needs to be read to start: where the program really is (it is often a link into a versions folder under
 * the home) and the folder that holds the link. Nothing else of the home is opened.
 */
export function claudeProgramFolders(bin: string): string[] {
  const full = resolveProgram(bin);
  let real = full;
  try { real = realpathSync(full); } catch {}
  return [...new Set([dirname(real), dirname(full)].filter(path => path.startsWith('/')))];
}

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
  mkdirSync(assistantTmpDir(configDir), { recursive: true });
  const settingsPath = join(configDir, 'settings.json');
  // Always written, so a config seeded by an older version gets the same answers.
  // disableAutoMode (top level) is what stops the "make auto mode your default" offer; skipAutoPermissionPrompt does not,
  // because Claude Code removes it at startup whenever the default mode is not auto.
  writeFileSync(settingsPath, JSON.stringify({
    ...confinedSettings({ workPath, configDir }),
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
  private piSource: PiSource | null = null;
  private opencodeSource: OpencodeSource | null = null;
  private claudeBlocked = '';
  private routerProxy: RouterProxy | null = null;
  private routerModel = '';

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
      const source = this.opencodeSource;
      if (!source) return { error: 'OpenCode was not prepared.' };
      if (source.kind === 'none') return { error: source.problem };
      if (source.kind === 'own-login') {
        if (!seedOpencodeHome(home)) return { error: 'No OpenCode login was found to copy. Sign in to a provider in OpenCode and pick a default model, or set TRIO_OPENCODE_API_KEY.' };
      } else if (this.routerProxy && this.routerModel) {
        seedOpencodeRouterHome(home, this.routerProxy, this.routerModel);
      } else {
        return { error: 'The model router did not answer.' };
      }
      writeOpencodeRules(home, assistantContext);
      // OpenCode has no sandbox of its own, so the operating system's is put around the whole process. Without one the assistant is
      // not started at all: running it open is the thing this exists to prevent.
      const walled = sandboxed({ bin: BIN.opencode, args: opencodeArgs(hasOpencodeHistory(home)), workPath, configDir: home, writable: [workPath, home] });
      if ('error' in walled) return walled;
      return {
        bin: walled.bin,
        args: walled.args,
        env: this.withoutKeys({ ...(sanitizeEnvironment(workPath) as Record<string, string | undefined>), ...opencodeEnvironment(home), ...base }, source.kind === 'router'),
      };
    }
    if (tool === 'pi') {
      const home = piHomeDir(workPath);
      const source = this.piSource;
      if (!source) return { error: 'Pi was not prepared.' };
      if (source.kind === 'none') return { error: source.problem };
      if (source.kind === 'own-login') {
        const problem = seedPiHome(home, { login: source.login, problem: '' });
        if (problem) return { error: problem };
      } else if (this.routerProxy && this.routerModel) {
        seedPiRouterHome(home, this.routerProxy, this.routerModel);
      } else {
        return { error: 'The model router did not answer.' };
      }
      writePiRules(home, assistantContext);
      // Pi has no sandbox of its own either. It is not started without the operating system's.
      const walled = sandboxed({ bin: BIN.pi, args: piArgs(hasPiHistory(home)), workPath, configDir: home, writable: [workPath, home], programFolders: piProgramFolders(BIN.pi) });
      if ('error' in walled) return walled;
      const env: Record<string, string | undefined> = { ...(sanitizeEnvironment(workPath) as Record<string, string | undefined>), ...piEnvironment(home), ...base };
      // the login is the one copied into the private home, never a key another tool of the interviewer left in the environment
      for (const key of PI_BLOCKED_ENVIRONMENT) delete env[key];
      return { bin: walled.bin, args: walled.args, env };
    }
    if (this.claudeBlocked) return { error: this.claudeBlocked };
    const configDir = agentConfigDir(workPath);
    seedAgentConfig(configDir, workPath);
    // The router's address and key are replaced by the loopback forwarder's address and a random key. The model names stay as the
    // interviewer set them. Without a forwarder (no router, or only a key of its own) nothing changes from before.
    const login = this.routerProxy ? { ...routerEnvironment(), ANTHROPIC_BASE_URL: this.routerProxy.url, ANTHROPIC_AUTH_TOKEN: this.routerProxy.key } : routerEnvironment();
    if (this.routerProxy) delete login.ANTHROPIC_API_KEY;
    // Claude Code's own sandbox only covers the commands the model runs. What a person types after "!" in its terminal runs outside
    // it (measured: it read a file in the interviewer's home, the settings of the interview, another candidate and a hidden phase),
    // so the operating system's sandbox is put around the whole process, the same as for the other two.
    const walled = sandboxed({ bin: BIN.claude, args: claudeArgs(assistantContext, existsSync(join(configDir, 'projects'))), workPath, configDir, writable: [workPath, configDir], programFolders: claudeProgramFolders(BIN.claude) });
    if ('error' in walled) return walled;
    // the general sanitizer lets ANTHROPIC_API_KEY through for the chat, so with a forwarder it is taken out of the final environment too
    const inherited = sanitizeEnvironment(workPath) as Record<string, string | undefined>;
    if (this.routerProxy) { delete inherited.ANTHROPIC_API_KEY; delete inherited.CLAUDE_API_KEY; }
    return {
      bin: walled.bin,
      args: walled.args,
      env: {
        ...inherited,
        ...login,
        CLAUDE_CONFIG_DIR: configDir,
        CLAUDE_CODE_TMPDIR: assistantTmpDir(configDir),
        // every program the assistant runs writes its small files here, so it never needs the interviewer's temporary folders
        TMPDIR: assistantTmpDir(configDir),
        TEMP: assistantTmpDir(configDir),
        TMP: assistantTmpDir(configDir),
        CLAUDE_CODE_SUBAGENT_MODEL: resolveModelId(DEFAULT_MODEL),
        DISABLE_AUTOUPDATER: '1',
        DISABLE_TELEMETRY: '1',
        ...base,
      },
    };
  }

  /** Starts the tool, continuing the conversation it had if the process ended earlier */
  /**
   * Pi's and OpenCode's source is settled before they start: a login of their own, or the model router (asked once for a model that
   * answers, with the router's key staying in this process behind a loopback forwarder). Other assistants need nothing here.
   */
  private async prepareRouterTool(): Promise<void> {
    this.closeRouter();
    const settings = readInterviewConfig();
    const router = readRouter();
    if (this.opts.tool === 'claude-code') {
      // Claude Code keeps the model names the interviewer set, so there is nothing to ask the router: only the key is kept out of reach
      if (router) this.routerProxy = await startRouterProxy(router);
      return;
    }
    let wanted: PiSource | OpencodeSource;
    let preferred = '';
    if (this.opts.tool === 'pi') {
      wanted = this.piSource = choosePiSource(settings.pi, readPiLogin(), router);
      preferred = settings.pi.model;
    } else {
      wanted = this.opencodeSource = chooseOpencodeSource(settings.opencode.provider, readOpencodeLogin(), router);
      preferred = settings.opencode.model;
    }
    if (wanted.kind !== 'router' || !router) return;
    const chosen = await chooseRouterModel(router, preferred);
    if (!chosen.ok) {
      const none = { kind: 'none' as const, problem: `The model router is set up but ${chosen.problem}.` };
      if (this.opts.tool === 'pi') this.piSource = none; else this.opencodeSource = none;
      return;
    }
    this.routerProxy = await startRouterProxy(router);
    this.routerModel = chosen.model;
  }

  /** Every variable that carries a key or a router address is taken out, so the only login is the one this tool wrote into the private home */
  private withoutKeys(env: Record<string, string | undefined>, router: boolean): Record<string, string | undefined> {
    if (!router) return env;
    for (const key of PI_BLOCKED_ENVIRONMENT) delete env[key];
    return env;
  }

  private closeRouter() {
    this.routerProxy?.close();
    this.routerProxy = null;
    this.routerModel = '';
  }

  private starting = false;

  start() {
    if (this.child || this.disposed || this.starting) return;
    if (this.opts.tool === 'pi' || this.opts.tool === 'opencode' || this.opts.tool === 'claude-code') {
      this.starting = true;
      this.prepareRouterTool().catch(() => {
        const none = { kind: 'none' as const, problem: `${TOOL_NAMES[this.opts.tool]} could not be prepared.` };
        if (this.opts.tool === 'pi') this.piSource = none; else if (this.opts.tool === 'opencode') this.opencodeSource = none;
        // Claude Code without a forwarder would hand the key to the terminal, so it is not started
        else this.claudeBlocked = 'The model router could not be reached from here.';
      }).finally(() => { this.starting = false; this.launch(); });
      return;
    }
    this.launch();
  }

  private launch() {
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
      this.closeRouter();
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
    this.closeRouter();
    const child = this.child;
    this.child = null;
    if (child) { try { child.kill(); } catch {} }
    sessions.delete(this.opts.key);
  }
}
