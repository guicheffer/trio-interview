import { spawn } from 'child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { tmpdir } from 'os';
import { BIN } from './binaries.js';
import { sanitizeEnvironment } from './sanitize-env.js';
import { getAiStatus } from './ai-healthcheck.js';
import { TOOLS, type Tool } from '../../shared/interview-config.js';
import { assistantFacts } from './assistant-facts.js';
import { describeTool, type ToolFacts } from '../../shared/assistant-status.js';
import { routerEnvironment } from './agent-pty.js';

export type AgentMode = Tool;

/** The assistants that run in a terminal. Codex is shown in the picker as coming soon and is not a mode. */
export type TerminalAssistant = 'claude-code' | 'opencode' | 'pi';
export const TERMINAL_ASSISTANTS: readonly TerminalAssistant[] = ['claude-code', 'opencode', 'pi'];

export function isAgentMode(value: unknown): value is AgentMode {
  return typeof value === 'string' && (TOOLS as readonly string[]).includes(value);
}

// The candidate's choice, kept next to the exercise folder so it survives restarts (same place as ai-files)
function storePath(workPath: string): string {
  return join(dirname(workPath), `agent-mode-${basename(workPath)}.json`);
}

export function readAgentMode(workPath: string): AgentMode | null {
  try {
    const parsed = JSON.parse(readFileSync(storePath(workPath), 'utf-8'));
    return isAgentMode(parsed?.mode) ? parsed.mode : null;
  } catch {
    return null;
  }
}

/** Forgets the choice, so the candidate sees the picker again */
export function clearAgentMode(workPath: string): void {
  try { rmSync(storePath(workPath), { force: true }); } catch {}
}

export function writeAgentMode(workPath: string, mode: AgentMode): void {
  mkdirSync(dirname(storePath(workPath)), { recursive: true });
  writeFileSync(storePath(workPath), JSON.stringify({ mode }), 'utf-8');
}

export interface ToolAvailability {
  ok: boolean | null;
  message: string;
  version: string;
  checkedAt: number | null;
  /** One plain line for the terminal: installed or not, version, login, sandbox, and ready or the reason */
  line: string;
}

const NOT_CHECKED: ToolAvailability = { ok: null, message: 'not checked yet', version: '', checkedAt: null, line: '' };
const cache: Record<TerminalAssistant, ToolAvailability> = { 'claude-code': NOT_CHECKED, opencode: NOT_CHECKED, pi: NOT_CHECKED };

export function cachedAvailability(): Record<TerminalAssistant, ToolAvailability> {
  return cache;
}

/** Runs `<bin> --version`: tells whether the program can be started at all on this machine */
function readVersion(bin: string): Promise<{ ok: boolean; version: string; error: string }> {
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let settled = false;
    const done = (value: { ok: boolean; version: string; error: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const child = spawn(bin, ['--version'], { cwd: tmpdir(), env: sanitizeEnvironment(tmpdir()) as NodeJS.ProcessEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { child.kill('SIGTERM'); done({ ok: false, version: '', error: 'it did not answer in 15 seconds' }); }, 15000);
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { err += d.toString(); });
    child.on('error', e => done({ ok: false, version: '', error: `could not start ${bin}: ${e.message}` }));
    child.on('exit', code => done({ ok: code === 0, version: out.trim().split('\n')[0] ?? '', error: err.trim().slice(0, 200) }));
  });
}

function finish(tool: TerminalAssistant, facts: ToolFacts): ToolAvailability {
  const report = describeTool(facts);
  const result: ToolAvailability = { ok: report.ok, message: report.message, version: facts.version, checkedAt: Date.now(), line: report.line };
  cache[tool] = result;
  return result;
}

/**
 * Whether Claude Code can be opened in a terminal: the program starts, and the check the chat uses has not failed
 * (no login, no budget left), because the terminal uses the same account.
 */
export async function checkClaudeCode(): Promise<ToolAvailability> {
  const found = await readVersion(BIN.claude);
  const ai = getAiStatus();
  const hasRouter = Object.keys(routerEnvironment()).length > 0;
  const login = ai.ok === false ? null : ai.ok === true ? 'answered a test message' : hasRouter ? 'router settings found, not tested yet' : 'not tested yet (its own sign in is used)';
  return finish('claude-code', assistantFacts('claude-code', found.ok ? found.version : null, found.error, { login, problem: ai.message || 'the assistant did not answer' }));
}

/** The first version number in the text, for example 2 in "opencode v2.3.0" and 1 in "1.2.3". 0 when there is none. */
export function majorVersion(text: string): number {
  const match = /(\d+)\.\d+/.exec(text);
  return match ? Number(match[1]) : 0;
}

/** OpenCode needs the program, version 2, a provider login it can copy into its private home, and the sandbox */
export async function checkOpencode(): Promise<ToolAvailability> {
  const found = await readVersion(BIN.opencode);
  return finish('opencode', assistantFacts('opencode', found.ok ? found.version : null, found.error));
}

/** Pi needs Node 20.6 or later, the program, a login it can copy into its private home (only from Pi's own setup), and the sandbox */
export async function checkPi(): Promise<ToolAvailability> {
  const found = await readVersion(BIN.pi);
  return finish('pi', assistantFacts('pi', found.ok ? found.version : null, found.error));
}

export async function checkAll(): Promise<void> {
  await Promise.all([checkClaudeCode(), checkOpencode(), checkPi()]);
}
