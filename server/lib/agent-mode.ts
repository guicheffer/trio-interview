import { spawn } from 'child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { tmpdir } from 'os';
import { BIN } from './binaries.js';
import { sanitizeEnvironment } from './sanitize-env.js';
import { getAiStatus } from './ai-healthcheck.js';
import { TOOLS, type Tool } from '../../shared/interview-config.js';
import { readOpencodeLogin } from './opencode-pty.js';

export type AgentMode = Tool;

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
}

const NOT_CHECKED: ToolAvailability = { ok: null, message: 'not checked yet', version: '', checkedAt: null };
const cache: Record<'claude-code' | 'opencode', ToolAvailability> = { 'claude-code': NOT_CHECKED, opencode: NOT_CHECKED };

export function cachedAvailability(): Record<'claude-code' | 'opencode', ToolAvailability> {
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

/**
 * Whether Claude Code can be opened in a terminal: the program starts, and the check the chat uses has not failed
 * (no login, no budget left), because the terminal uses the same account.
 */
export async function checkClaudeCode(): Promise<ToolAvailability> {
  const found = await readVersion(BIN.claude);
  let result: ToolAvailability;
  if (!found.ok) {
    result = { ok: false, message: found.error || 'the claude command was not found. Install it with: npm install -g @anthropic-ai/claude-code', version: '', checkedAt: Date.now() };
  } else if (getAiStatus().ok === false) {
    result = { ok: false, message: getAiStatus().message || 'the assistant did not answer', version: found.version, checkedAt: Date.now() };
  } else {
    result = { ok: true, message: 'OK', version: found.version, checkedAt: Date.now() };
  }
  cache['claude-code'] = result;
  return result;
}

/** The first version number in the text, for example 2 in "opencode v2.3.0" and 1 in "1.2.3". 0 when there is none. */
export function majorVersion(text: string): number {
  const match = /(\d+)\.\d+/.exec(text);
  return match ? Number(match[1]) : 0;
}

/** OpenCode needs the program and a provider login it can copy into its private home */
export async function checkOpencode(): Promise<ToolAvailability> {
  const found = await readVersion(BIN.opencode);
  let result: ToolAvailability;
  if (!found.ok) {
    result = { ok: false, message: found.error || 'the opencode command was not found. Install it from https://opencode.ai', version: '', checkedAt: Date.now() };
  } else if (majorVersion(found.version) < 2) {
    result = { ok: false, message: `OpenCode 2 is needed (found "${found.version}"). Install it with: brew install anomalyco/tap/opencode-v2`, version: found.version, checkedAt: Date.now() };
  } else if (!readOpencodeLogin()) {
    result = { ok: false, message: 'OpenCode is installed but there is no login to copy. Sign in to a provider in OpenCode and pick a default model, or set TRIO_OPENCODE_API_KEY.', version: found.version, checkedAt: Date.now() };
  } else {
    result = { ok: true, message: 'OK', version: found.version, checkedAt: Date.now() };
  }
  cache.opencode = result;
  return result;
}

export async function checkAll(): Promise<void> {
  await Promise.all([checkClaudeCode(), checkOpencode()]);
}
