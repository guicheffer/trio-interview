import { completeLine } from './tab-complete.js';
import { ALLOWED_COMMANDS } from './command-policy.js';
import { createRequire } from 'module';
import type { IPty } from 'node-pty';

// Loaded when a command first runs, not when this file is imported: other modules (the assistant proxy reads terminals)
// import this one, and CI installs without building the native module, so a top level import would break their tests
const nodeRequire = createRequire(import.meta.url);
export const loadPty = (): typeof import('node-pty') => nodeRequire('node-pty');
import { chmodSync, existsSync, statSync } from 'fs';
import { join, relative, resolve, sep } from 'path';
import { isPlainCd } from './shell-command.js';

const MAX_SCROLLBACK = 300_000;
export const ORIGIN_TOKEN = '{{TRIO_ORIGIN}}';

// node-pty ships spawn-helper without the executable bit on some installs
export function ensurePtyHelperExecutable(): void {
  for (const arch of ['darwin-arm64', 'darwin-x64']) {
    const helper = join(process.cwd(), 'node_modules', 'node-pty', 'prebuilds', arch, 'spawn-helper');
    try { if (existsSync(helper)) chmodSync(helper, 0o755); } catch {}
  }
}

export interface TerminalClient {
  origin: string;
  send(frame: Record<string, unknown>): void;
}

export interface SessionOptions {
  key: string;
  candidate: string;
  exercise: string;
  exercisePath: string;
  shell: string;
  env: Record<string, string | undefined>;
  checkCommand: (cmd: string) => { ok: boolean; reason?: string; cmd?: string };
  prepareCommand: (cmd: string) => string;
  onOutput: (session: TerminalSession, text: string) => void;
  onTrackPid: (pid: number) => void;
  onUntrackPid: (pid: number) => void;
}

const sessions = new Map<string, TerminalSession>();

export function getTerminalSession(key: string): TerminalSession | undefined {
  return sessions.get(key);
}

export function getOrCreateTerminalSession(key: string, make: () => SessionOptions): TerminalSession {
  let session = sessions.get(key);
  if (!session) {
    session = new TerminalSession(make());
    sessions.set(key, session);
  }
  return session;
}

export function stopAllTerminals(): number {
  let stopped = 0;
  for (const session of sessions.values()) if (session.stop()) stopped++;
  return stopped;
}

export class TerminalSession {
  readonly clients = new Set<TerminalClient>();
  scrollback = '';
  currentDir = '';
  commandsRun = 0;
  runningCommand: string | null = null;
  private child: IPty | null = null;
  private lineBuffer = '';
  private history: string[] = [];
  private historyIndex = -1;
  private cols = 120;
  private rows = 30;

  constructor(readonly opts: SessionOptions) {
    this.store(`\x1b[0;32m● ${opts.candidate} / ${opts.exercise}\x1b[0m\r\n\r\n${this.promptText()}`);
  }

  private promptText(): string {
    const dir = this.currentDir ? `/${this.currentDir}` : '';
    return `\x1b[0;32m${this.opts.candidate}/${this.opts.exercise}${dir}\x1b[0m $ `;
  }

  private store(data: string) {
    this.scrollback += data;
    if (this.scrollback.length > MAX_SCROLLBACK) {
      const cut = this.scrollback.length - MAX_SCROLLBACK;
      const nl = this.scrollback.indexOf('\n', cut);
      this.scrollback = this.scrollback.slice(nl === -1 ? cut : nl + 1);
    }
  }

  private forClient(text: string, client: TerminalClient): string {
    return text.split(ORIGIN_TOKEN).join(client.origin);
  }

  emit(data: string) {
    this.store(data);
    for (const client of this.clients) client.send({ type: 'output', data: this.forClient(data, client) });
  }

  private emitPrompt() {
    this.emit(`\r\n${this.promptText()}`);
  }

  private broadcastStatus() {
    const frame = { type: 'status', running: !!this.child, command: this.runningCommand, commandsRun: this.commandsRun };
    for (const client of this.clients) client.send(frame);
  }

  attach(client: TerminalClient) {
    this.clients.add(client);
    client.send({ type: 'replay', data: this.forClient(this.scrollback, client), fresh: this.commandsRun === 0 });
    client.send({ type: 'status', running: !!this.child, command: this.runningCommand, commandsRun: this.commandsRun });
  }

  detach(client: TerminalClient) {
    this.clients.delete(client);
  }

  resize(cols: number, rows: number) {
    if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols < 10 || rows < 3) return;
    this.cols = Math.floor(cols);
    this.rows = Math.floor(rows);
    try { this.child?.resize(this.cols, this.rows); } catch {}
  }

  clear() {
    this.scrollback = '';
    for (const client of this.clients) client.send({ type: 'clear' });
    this.store(this.promptText());
    for (const client of this.clients) client.send({ type: 'output', data: this.promptText() });
  }

  stop(): boolean {
    const child = this.child;
    if (!child) return false;
    try { process.kill(-child.pid, 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch {} }
    setTimeout(() => {
      if (this.child === child) {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch {} }
      }
    }, 2000);
    return true;
  }

  dispose() {
    this.stop();
    sessions.delete(this.opts.key);
  }

  /** The Run button: type the command and press Enter, exactly like a person would */
  run(command: string) {
    const start = () => {
      this.lineBuffer = command;
      this.emit(command);
      this.submit();
    };
    if (this.child) {
      this.child.write('\x03');
      this.stop();
      setTimeout(start, 900);
    } else {
      start();
    }
  }

  private currentChild(): IPty | null {
    return this.child;
  }

  handleInput(data: string) {
    if (this.child) {
      this.child.write(data);
      return;
    }

    if (data.startsWith('\x1b')) {
      this.handleEscape(data);
      return;
    }

    for (const ch of data) {
      // A command submitted by this very input starts a process, the rest of the input belongs to it
      const child = this.currentChild();
      if (child) child.write(ch);
      else this.handleLineChar(ch);
    }
  }

  private handleEscape(data: string) {
    if (data === '\x1b[A') this.recall(-1);
    else if (data === '\x1b[B') this.recall(1);
  }

  private handleLineChar(ch: string) {
    if (ch === '\r' || ch === '\n') this.submit();
    else if (ch === '\x7f' || ch === '\x08') this.eraseChar();
    else if (ch === '\x03') this.cancelLine();
    else if (ch === '\x0c') this.clear();
    else if (ch === '\t') this.complete();
    else if (ch >= ' ') {
      this.lineBuffer += ch;
      this.emit(ch);
    }
  }

  /** Tab: finish the word at the end of the line, or list what it could be */
  private complete() {
    const { add, options } = completeLine(this.lineBuffer, {
      root: this.opts.exercisePath,
      cwd: join(this.opts.exercisePath, this.currentDir),
      commands: [...ALLOWED_COMMANDS],
    });
    if (add) {
      this.lineBuffer += add;
      this.emit(add);
    } else if (options.length > 1) {
      this.emit(`\r\n${options.join('  ')}\r\n${this.promptText()}${this.lineBuffer}`);
    }
  }

  private eraseChar() {
    if (this.lineBuffer.length === 0) return;
    this.lineBuffer = this.lineBuffer.slice(0, -1);
    this.emit('\x08 \x08');
  }

  private cancelLine() {
    this.lineBuffer = '';
    this.emit('^C');
    this.emitPrompt();
  }

  private recall(direction: -1 | 1) {
    if (this.history.length === 0) return;
    const next = this.historyIndex === -1 && direction === -1
      ? this.history.length - 1
      : this.historyIndex + direction;
    if (next < 0 || next >= this.history.length) {
      if (next >= this.history.length) {
        this.historyIndex = -1;
        this.replaceLine('');
      }
      return;
    }
    this.historyIndex = next;
    this.replaceLine(this.history[next]);
  }

  private replaceLine(text: string) {
    this.lineBuffer = text;
    this.emit(`\r\x1b[K${this.promptText()}${text}`);
  }

  private submit() {
    const cmd = this.lineBuffer.trim();
    this.lineBuffer = '';
    this.historyIndex = -1;
    this.emit('\r\n');

    if (!cmd) {
      this.emit(this.promptText());
      return;
    }
    if (this.history[this.history.length - 1] !== cmd) this.history.push(cmd);
    this.commandsRun++;

    const check = this.opts.checkCommand(cmd);
    if (!check.ok) {
      this.emit(`\x1b[31m${check.reason}\x1b[0m`);
      this.emitPrompt();
      this.broadcastStatus();
      return;
    }
    const normalized = check.cmd ?? cmd;

    if (normalized === 'clear') {
      this.clear();
      return;
    }

    if (isPlainCd(normalized)) {
      this.changeDirectory(normalized.replace(/^cd\s*/, '').trim());
      this.broadcastStatus();
      return;
    }

    this.execute(this.opts.prepareCommand(normalized), normalized);
  }

  private changeDirectory(target: string) {
    const root = this.opts.exercisePath;
    if (!target) {
      this.currentDir = '';
    } else {
      const resolved = resolve(root, this.currentDir, target);
      const inside = resolved === root || resolved.startsWith(root + sep);
      if (target === '~' || target === '$HOME' || !inside) {
        this.emit('\x1b[33mCannot leave the challenge directory\x1b[0m');
      } else if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
        this.emit(`\x1b[31mcd: no such directory: ${target}\x1b[0m`);
      } else {
        this.currentDir = relative(root, resolved);
      }
    }
    this.emitPrompt();
  }

  private execute(finalCmd: string, displayCmd: string) {
    const cwd = join(this.opts.exercisePath, this.currentDir);
    let child: IPty;
    try {
      child = loadPty().spawn(this.opts.shell, ['-c', finalCmd], {
        name: 'xterm-256color',
        cols: this.cols,
        rows: this.rows,
        cwd,
        env: { ...this.opts.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' } as Record<string, string>,
      });
    } catch (err) {
      this.emit(`\x1b[31mCould not start the command: ${err instanceof Error ? err.message : String(err)}\x1b[0m`);
      this.emitPrompt();
      return;
    }

    this.child = child;
    this.runningCommand = displayCmd;
    this.opts.onTrackPid(child.pid);
    this.broadcastStatus();

    child.onData((chunk: string) => {
      this.emit(chunk);
      this.opts.onOutput(this, chunk);
    });

    child.onExit(({ exitCode }) => {
      this.opts.onUntrackPid(child.pid);
      if (this.child !== child) return;
      this.child = null;
      this.runningCommand = null;
      if (exitCode !== 0 && exitCode !== null) this.emit(`\r\n\x1b[2mexit ${exitCode}\x1b[0m`);
      this.emitPrompt();
      this.broadcastStatus();
    });
  }
}
