import { basename } from 'path';
import { readConfigForExercise } from './exercise-config.js';
import { isLockedPath } from '../../shared/locks.js';

/** Only these programs can start a command in the candidate's terminal. */
export const ALLOWED_COMMANDS = new Set([
  // Navigation, handled specially so it stays inside the exercise
  'cd',
  // Runtimes
  'node', 'npm', 'npx', 'python', 'python3', 'python2',
  'go', 'deno', 'bun', 'tsx', 'ts-node', 'ruby', 'php', 'java',
  // Basic shell utils
  'ls', 'cat', 'echo', 'pwd', 'mkdir', 'touch', 'mv', 'cp', 'rm',
  'head', 'tail', 'grep', 'find', 'wc', 'sort', 'uniq', 'diff',
  'clear', 'env', 'export', 'source', '.', 'which', 'type',
  // Version managers
  'nvm', 'pyenv', 'rbenv',
]);

const DESTRUCTIVE_COMMANDS = new Set(['rm', 'mv', 'cp']);

export interface CommandCheck {
  ok: boolean;
  reason?: string;
  cmd?: string;
}

function lockedPatterns(exercisePath: string): string[] {
  const config = readConfigForExercise(basename(exercisePath));
  return [...config.lockedFiles, ...config.hidden];
}

const isOperator = (token: string) => /^[&|;><]/.test(token);

function checkToken(token: string, exercisePath: string): string | null {
  if (token.startsWith('-') || isOperator(token)) return null;
  if (token.startsWith('~/') || token === '~') return 'Cannot access paths outside exercise directory';
  if (token.startsWith('$')) return 'Variable expansion not allowed in paths';
  if (token.startsWith('/') && !token.startsWith(exercisePath)) return 'Cannot access paths outside exercise directory';
  return null;
}

function checkLockedTargets(args: string[], exercisePath: string): string | null {
  const patterns = lockedPatterns(exercisePath);
  if (patterns.length === 0) return null;
  for (const arg of args) {
    if (arg.startsWith('-')) continue;
    if (isLockedPath(arg, patterns)) return `Cannot modify locked file: ${arg.split('/').pop() ?? arg}`;
  }
  return null;
}

/**
 * Decides whether a line typed in the candidate's terminal may run. It looks at the first word (allowlist),
 * blocks path escapes and variable expansion in every word, and protects locked files from rm, mv and cp.
 * It is a guard rail for an interview, not a sandbox: it does not parse pipes or command separators.
 */
export function isCommandAllowed(cmd: string, exercisePath: string): CommandCheck {
  if (!cmd) return { ok: true };

  const normalized = cmd.startsWith('/') && !cmd.startsWith('//') ? cmd.slice(1) : cmd;
  const parts = normalized.trim().split(/\s+/);
  const base = parts[0].toLowerCase();

  if (!ALLOWED_COMMANDS.has(base)) return { ok: false, reason: `Command not allowed: ${base}` };
  if (normalized.includes('..')) return { ok: false, reason: 'Paths with .. are not allowed' };

  for (const token of normalized.split(/\s+/)) {
    const reason = checkToken(token, exercisePath);
    if (reason) return { ok: false, reason };
  }

  if (DESTRUCTIVE_COMMANDS.has(base)) {
    const reason = checkLockedTargets(parts.slice(1), exercisePath);
    if (reason) return { ok: false, reason };
  }

  return { ok: true, cmd: normalized };
}
