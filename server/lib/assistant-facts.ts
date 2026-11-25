import { readOpencodeLogin } from './opencode-pty.js';
import { PI_MIN_VERSION, readPiLogin } from './pi-pty.js';
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { realpathSync } from 'fs';
import { isAbsolute } from 'path';
import { resolveProgram, sandboxAvailable, sandboxMissing, wrapCommand } from './os-sandbox.js';
import { versionAtLeast, type ToolFacts } from '../../shared/assistant-status.js';

export type AssistantName = 'claude-code' | 'opencode' | 'pi';

export const ASSISTANT_NAMES: Record<AssistantName, string> = { 'claude-code': 'Claude Code', opencode: 'OpenCode', pi: 'Pi' };

export const INSTALL_HINT: Record<AssistantName, string> = {
  'claude-code': 'npm install -g @anthropic-ai/claude-code',
  opencode: 'brew install anomalyco/tap/opencode-v2   (OpenCode 2 is needed; see opencode.ai)',
  pi: 'npm install -g @mariozechner/pi-coding-agent   (Node 20.6 or later)',
};

let probed: string | null | undefined;

/** Why the sandbox cannot be used, or null when it can: the program exists and really runs a command under a profile (tried once) */
/** A program kept in a temporary folder cannot start inside the sandbox, which keeps those folders closed. Said before it fails. */
export function programPlaceProblem(bin: string, name: string): string | null {
  const full = resolveProgram(bin);
  if (!isAbsolute(full)) return null;
  let real = full;
  try { real = realpathSync(full); } catch {}
  return /^(\/private)?\/(tmp|var\/folders)\//.test(real) || /^(\/private)?\/(tmp|var\/folders)\//.test(full)
    ? `${name} is installed in a temporary folder (${real}), which the sandbox keeps closed, so it cannot start there. Install it somewhere permanent, for example under your home.`
    : null;
}

export function sandboxProblem(): string | null {
  if (!sandboxAvailable()) return sandboxMissing().error;
  if (probed !== undefined) return probed;
  const dir = mkdtempSync(join(tmpdir(), 'trio-sbx-probe-'));
  try {
    const profile = join(dir, 'probe.sb');
    writeFileSync(profile, '(version 1)\n(allow default)\n');
    const plan = wrapCommand(profile, '/usr/bin/true', []);
    const run = spawnSync(plan.bin, plan.args, { encoding: 'utf-8', timeout: 10000 });
    probed = run.status === 0 ? null : `the sandbox program is there but did not run a command (${(run.stderr || run.error?.message || `exit ${run.status}`).trim().split('\n')[0].slice(0, 120)}). Running this tool from inside another sandbox can cause it.`;
  } catch (err) {
    probed = `the sandbox could not be tried: ${err instanceof Error ? err.message : String(err)}`;
  } finally { rmSync(dir, { recursive: true, force: true }); }
  return probed;
}

const majorOf = (text: string): number => Number(/(\d+)\.\d+/.exec(text)?.[1] ?? 0);

/**
 * What is known about one terminal assistant, read from this machine: the program (as `<bin> --version` answered, null when it did not),
 * the login it would be given and the sandbox. Claude Code's login is only really proven by a test message, so the caller passes what it knows.
 */
export function assistantFacts(tool: AssistantName, version: string | null, error = '', claudeLogin: { login: string | null; problem: string } = { login: 'not tested here', problem: '' }, bin: string = process.env[`TRIO_${tool === 'claude-code' ? 'CLAUDE' : tool.toUpperCase()}_BIN`] || (tool === 'claude-code' ? 'claude' : tool)): ToolFacts {
  const installed = version !== null;
  // Claude Code is confined by its own settings and not by the sandbox profile, so only the other two need a place the sandbox can open
  const place = installed && tool !== 'claude-code' ? programPlaceProblem(bin, ASSISTANT_NAMES[tool]) : null;
  const base = { name: ASSISTANT_NAMES[tool], installed, version: version ?? '', installHint: INSTALL_HINT[tool], sandboxProblem: place ?? sandboxProblem() };
  if (tool === 'claude-code') {
    return { ...base, versionProblem: installed ? undefined : error || undefined, login: claudeLogin.login, loginProblem: claudeLogin.problem };
  }
  if (tool === 'opencode') {
    const login = installed ? readOpencodeLogin() : null;
    return {
      ...base,
      versionProblem: !installed ? error || undefined : majorOf(version) < 2 ? `OpenCode 2 is needed (found "${version}"). Install it with: brew install anomalyco/tap/opencode-v2` : undefined,
      login: login ? `${login.provider}, ${process.env.TRIO_OPENCODE_API_KEY ? 'from TRIO_OPENCODE_API_KEY' : 'from your own OpenCode setup'}` : null,
      loginProblem: 'OpenCode is installed but there is no login to copy. Sign in to a provider in OpenCode and pick a default model, or set TRIO_OPENCODE_API_KEY.',
    };
  }
  const found = installed ? readPiLogin() : { login: null, problem: '' };
  return {
    ...base,
    versionProblem: !installed ? error || undefined : !versionAtLeast(version, PI_MIN_VERSION.major, PI_MIN_VERSION.minor) ? `Pi ${PI_MIN_VERSION.major}.${PI_MIN_VERSION.minor} or later is needed (found "${version}"). Update it with: npm install -g @mariozechner/pi-coding-agent` : undefined,
    login: found.login ? `${found.login.provider}, from ${found.login.source}` : null,
    loginProblem: found.problem,
  };
}
