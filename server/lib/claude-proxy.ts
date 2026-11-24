import { spawn, ChildProcess } from 'child_process';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { isAbsolute, resolve as resolvePath, relative } from 'path';
import { createInterface } from 'readline';
import { EventEmitter } from 'events';
import { sanitizeEnvironment } from './sanitize-env.js';
import { getActiveSession, getWorkPath } from './active-candidate.js';
import { buildSystemPrompt, openFileNote, PLAN_NOTE, mentionsTerminal, terminalNote } from './assistant-prompt.js';
import { readExerciseConfig } from './exercise-config.js';
import { DEFAULT_MODEL, getModelOption, type ModelKey } from '../../shared/models.js';
import { BIN } from './binaries.js';
import { markAiFile } from './ai-files.js';
import { getTerminalSession } from './terminal-session.js';
import { stripAnsi } from './output-parsing.js';

// TRIO_MODEL_<KEY> overrides the model id sent to the program, for a gateway or a cloud provider that names models differently
export function resolveModelId(key: string): string {
  const override = process.env[`TRIO_MODEL_${key.toUpperCase().replace(/-/g, '_')}`];
  return override || getModelOption(key).id;
}

// Tools that reach outside the exercise (the interviewer's machine, notifications, other sessions)
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

export const BLOCKED_TOOLS = [
  'AskUserQuestion', 'PushNotification', 'CronCreate', 'CronDelete', 'CronList', 'ScheduleWakeup',
  'DesignSync', 'EnterWorktree', 'ExitWorktree', 'ListAgents', 'SendMessage', 'Monitor', 'Workflow', 'ReportFindings',
];

/** The terminal tabs the page has open: the ids tell the server which sessions they are */
export interface TerminalTabs {
  tabs: Array<{ id: string; label: string }>;
  active?: string;
}

export interface ClaudeEvent {
  type: string;
  [key: string]: any;
}

/**
 * Wraps Claude Code CLI.
 *
 * Session continuity:
 *   - On first message: spawn without --resume
 *   - Capture session_id from the `result` event
 *   - All subsequent messages: spawn with --resume <session_id>
 *   - Calling resetSession() clears the session_id → fresh conversation
 *
 * Speed:
 *   - New message while processing cancels the current process (most-recent-wins)
 *   - MCPs disabled via .claude/settings.json in the working directory
 */
export class ClaudeProxy extends EventEmitter {
  private process: ChildProcess | null = null;
  private killed = false;
  private model: string;

  claudeSessionId: string | null = null;
  private messageQueue: string[] = [];
  private processing = false;
  private producedAnswer = false;
  private stderrBuffer: string[] = [];
  // Original content of every file the AI wrote to, per turn (null = did not exist). Powers /undo.
  private turns: Array<Map<string, string | null>> = [];
  // Events of the current (or last) turn, so a page that reloads mid answer can catch up
  private turnEvents: unknown[] = [];

  constructor(_sessionId: string, _exercisePath: string, modelShortname?: ModelKey) {
    super();

    this.model = resolveModelId(modelShortname || DEFAULT_MODEL);
  }

  /** Whether an answer is being produced right now */
  get isProcessing(): boolean {
    return this.processing;
  }

  /** The agent is answering and has already started writing files in this turn */
  get isWriting(): boolean {
    return this.processing && (this.turns[this.turns.length - 1]?.size ?? 0) > 0;
  }

  /** Everything the current or last turn emitted, in order */
  turnSnapshot(): unknown[] {
    return [...this.turnEvents];
  }

  override emit(eventName: string | symbol, ...args: any[]): boolean {
    if (eventName === 'event') {
      const event = args[0] as { type?: string } | undefined;
      if (event?.type === 'message_start') this.turnEvents = [];
      if (this.turnEvents.length < 20000) this.turnEvents.push(event);
    }
    return super.emit(eventName, ...args);
  }

  /** Change the model for subsequent messages */
  setModel(modelShortname: ModelKey): void {
    this.model = resolveModelId(modelShortname);
  }

  /** Clear conversation history, next message starts a fresh session */
  resetSession(): void {
    this.claudeSessionId = null;
    this.emit('session-reset');
  }

  /** Cancel current request and clear queue */
  cancelCurrent(): void {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
    this.processing = false;
    this.messageQueue = [];
    this.emit('event', { type: 'message_stop' });
  }

  private spawnForMessage(message: string, openFile?: string | null, plan = false, terminals?: TerminalTabs): void {
    if (this.killed) return;

    this.producedAnswer = false;
    this.stderrBuffer = [];

    const args: string[] = [
      '--print',
      '--verbose',
      '--output-format=stream-json',
      '--permission-mode=bypassPermissions',
      '--include-partial-messages',
      '--strict-mcp-config',
      '--no-chrome',
      '--disable-slash-commands',
      '--disallowedTools', ...BLOCKED_TOOLS,
      '--append-system-prompt', buildSystemPrompt(readExerciseConfig(getActiveSession()?.templatePath ?? process.env.EXERCISE_PATH).assistantContext),
      '--model', this.model,
    ];

    // Reuse existing Claude session for conversation continuity
    if (this.claudeSessionId) {
      args.push('--resume', this.claudeSessionId);
    }

    // The open file changes between messages, so the note travels with each one; the chat on screen never shows it
    const note = [openFileNote(openFile), plan ? PLAN_NOTE : '', mentionsTerminal(message) ? this.terminalNoteFor(terminals) : '', this.takeReviewNotes()].filter(Boolean).join('\n\n');
    args.push(note ? `${note}\n\n${message}` : message);

    const cwd = getWorkPath();
    console.log('[ClaudeProxy] Spawning%s message:', this.claudeSessionId ? ' (resume)' : '', message.substring(0, 60));

    try {
      this.process = spawn(BIN.claude, args, {
        cwd,
        env: {
          ...(sanitizeEnvironment(cwd) as NodeJS.ProcessEnv),
          // Subagents (Task tool) use the model the candidate picked, so non-Claude models work too
          CLAUDE_CODE_SUBAGENT_MODEL: this.model,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      console.error('[ClaudeProxy] Failed to spawn:', error);
      this.processing = false;
      this.emit('event', {
        type: 'content_block_delta',
        delta: { text: `[Error: Could not start Claude, ${(error as Error).message}]` },
      });
      this.emit('event', { type: 'message_stop' });
      this.processNextQueued();
      return;
    }

    const rl = createInterface({ input: this.process.stdout! });

    rl.on('line', (line: string) => this.handleLine(line));
    this.process.stderr!.on('data', (data: Buffer) => this.handleStderr(data));

    this.process.on('error', (error: Error) => {
      console.error('[ClaudeProxy] Process error:', error);
      this.processing = false;
      this.processNextQueued();
    });

    this.process.on('exit', (code: number | null) => {
      console.log('[ClaudeProxy] Exited with code:', code);
      if (!this.producedAnswer && this.stderrBuffer.length > 0) {
        this.emit('event', { type: 'stderr', message: this.stderrBuffer.join('\n') });
      }
      this.process = null;
      this.processing = false;
      this.emit('event', { type: 'message_stop' });
      this.processNextQueued();
    });
  }

  private handleLine(line: string): void {
    if (!line.trim()) return;
    let event: ClaudeEvent;
    try {
      event = JSON.parse(line);
    } catch {
      console.error('[ClaudeProxy] Parse error:', line.substring(0, 120));
      return;
    }

    // Capture session_id for conversation continuity across messages
    if (event.session_id && !this.claudeSessionId) {
      this.claudeSessionId = event.session_id;
      this.emit('session-id', event.session_id);
      console.log('[ClaudeProxy] Session ID:', event.session_id);
    }

    const serialized = JSON.stringify(event);
    this.rememberWrites(event);
    if (event.type === 'result' || (event.type === 'assistant' && serialized.includes('"type":"text"'))) {
      this.producedAnswer = true;
    }

    this.emit('event', event);
  }

  /** Keeps the original of every file the assistant is about to change, so /undo can restore it */
  private rememberWrites(event: ClaudeEvent): void {
    if (event.type !== 'assistant' || !Array.isArray(event.message?.content) || event.parent_tool_use_id) return;
    for (const block of event.message.content) {
      if (block.type === 'tool_use' && WRITE_TOOLS.has(block.name) && typeof block.input?.file_path === 'string') {
        this.rememberOriginal(block.input.file_path);
      }
    }
  }

  // The CLI warns about model ids it does not know (all gateway models) and about empty stdin; neither is an error
  private handleStderr(data: Buffer): void {
    const harmless = /\[claude-code:unrecognized_model\]|no stdin data received/;
    for (const line of data.toString().split('\n')) {
      const msg = line.trim();
      if (!msg || harmless.test(msg)) continue;
      console.error('[ClaudeProxy] stderr:', msg);
      this.stderrBuffer.push(msg);
    }
  }

  private processNextQueued(): void {
    if (this.killed || this.messageQueue.length === 0) return;
    const next = this.messageQueue.shift()!;
    setTimeout(() => this.sendMessage(next), 100);
  }

  private rememberOriginal(filePath: string): void {
    const root = getWorkPath();
    const abs = isAbsolute(filePath) ? filePath : resolvePath(root, filePath);
    if (relative(root, abs).startsWith('..')) return;
    markAiFile(root, relative(root, abs));
    const turn = this.turns[this.turns.length - 1];
    if (!turn || turn.has(abs)) return;
    try {
      turn.set(abs, existsSync(abs) ? readFileSync(abs, 'utf-8') : null);
      this.changedAt = Date.now();
    } catch {}
  }

  /** When this session's assistant last wrote to a file for the first time in a turn */
  changedAt = 0;

  private terminalNoteFor(terminals?: TerminalTabs): string {
    const session = getActiveSession();
    if (!session || !terminals) return '';
    return terminalNote(terminals.tabs.map(tab => {
      const live = getTerminalSession(`${session.candidateName}/${session.exerciseId}/${tab.id}`);
      return {
        label: tab.label,
        active: tab.id === terminals.active,
        running: live?.runningCommand ?? null,
        output: stripAnsi(live?.scrollback ?? '').replace(/\{\{TRIO_ORIGIN\}\}/g, ''),
      };
    }));
  }

  // What the person did with the AI's changes since the last message (undone), told to the AI with the next one
  private reviewNotes = new Map<string, 'part' | 'all'>();

  /** The person put back some or all of the AI's changes to a file. Keeping them needs no note, that is what the AI assumes. */
  noteReview(file: string, action: 'part' | 'all' | 'redo'): void {
    // The person took the undo back: the AI's changes stand again and there is nothing to tell
    if (action === 'redo') { this.reviewNotes.delete(file); return; }
    if (this.reviewNotes.get(file) === 'all') return;
    this.reviewNotes.set(file, action);
    if (this.reviewNotes.size > 20) this.reviewNotes.delete(this.reviewNotes.keys().next().value!);
  }

  private takeReviewNotes(): string {
    const lines = [...this.reviewNotes].map(([file, action]) =>
      action === 'all'
        ? `The person undid all of your changes to ${file}. Read the file again before you change it.`
        : `The person undid part of your changes to ${file}. Read the file again before you change it.`);
    this.reviewNotes.clear();
    return lines.join('\n');
  }

  /** The files the AI wrote to in its last turn that wrote to any, with how each was before (null = it did not exist) */
  lastChanges(): Array<{ file: string; before: string | null }> {
    const root = getWorkPath();
    for (let i = this.turns.length - 1; i >= 0; i--) {
      const turn = this.turns[i];
      if (turn.size > 0) return [...turn].map(([abs, before]) => ({ file: relative(root, abs), before }));
    }
    return [];
  }

  /** Restore the files the AI changed in its last turn that changed anything. Returns the relative paths. */
  undoLastTurn(): string[] {
    const root = getWorkPath();
    while (this.turns.length > 0) {
      const turn = this.turns.pop()!;
      if (turn.size === 0) continue;
      const restored: string[] = [];
      for (const [abs, original] of turn) {
        try {
          if (original === null) rmSync(abs, { force: true });
          else writeFileSync(abs, original, 'utf-8');
          restored.push(relative(root, abs));
        } catch {}
      }
      return restored;
    }
    return [];
  }

  /** Summarise the conversation in place with the CLI's own /compact */
  compact(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.claudeSessionId || this.process) return resolve(false);
      const cwd = getWorkPath();
      const child = spawn(BIN.claude, ['--print', '--output-format=stream-json', '--verbose', '--permission-mode=bypassPermissions', '--model', this.model, '--resume', this.claudeSessionId, '/compact'], {
        cwd,
        env: { ...(sanitizeEnvironment(cwd) as NodeJS.ProcessEnv), CLAUDE_CODE_SUBAGENT_MODEL: this.model },
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      child.on('exit', (code) => resolve(code === 0));
      child.on('error', () => resolve(false));
    });
  }

  sendMessage(message: string, openFile?: string | null, plan = false, terminals?: TerminalTabs): void {
    if (this.killed) return;
    this.turns.push(new Map());
    if (this.turns.length > 20) this.turns.shift();

    if (this.processing) {
      // Cancel current and process new message immediately (most-recent-wins)
      if (this.process) { this.process.kill('SIGTERM'); this.process = null; }
      this.processing = false;
      this.messageQueue = [];
      this.emit('event', { type: 'message_stop' });
    }

    this.processing = true;
    this.emit('event', { type: 'message_start' });
    this.spawnForMessage(message, openFile, plan, terminals);
  }

  kill(): void {
    this.killed = true;
    this.messageQueue = [];
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
  }
}
