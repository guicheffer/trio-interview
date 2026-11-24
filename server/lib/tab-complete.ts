import { readdirSync, statSync } from 'fs';
import { join, relative, resolve, sep } from 'path';

export interface Completion {
  /** The text to add to the line (may be empty) */
  add: string;
  /** Every candidate, when there is more than one and nothing more can be added */
  options: string[];
}

function commonPrefix(words: string[]): string {
  if (words.length === 0) return '';
  let prefix = words[0];
  for (const w of words) while (!w.startsWith(prefix)) prefix = prefix.slice(0, -1);
  return prefix;
}

function entriesFor(root: string, cwd: string, token: string): string[] {
  const slash = token.lastIndexOf('/');
  const dirPart = slash >= 0 ? token.slice(0, slash + 1) : '';
  const base = slash >= 0 ? token.slice(slash + 1) : token;
  const dir = resolve(cwd, dirPart || '.');
  // Never list anything outside the exercise folder
  const rel = relative(root, dir);
  if (rel.startsWith('..') || rel.split(sep).includes('..')) return [];
  let names: string[] = [];
  try { names = readdirSync(dir); } catch { return []; }
  return names
    .filter(n => n.startsWith(base) && (base.startsWith('.') || !n.startsWith('.')))
    .sort()
    .map(n => {
      let isDir = false;
      try { isDir = statSync(join(dir, n)).isDirectory(); } catch {}
      return dirPart + n + (isDir ? '/' : '');
    });
}

/** Tab completion for the terminal line: command names for the first word, files and folders for the rest */
export function completeLine(line: string, opts: { root: string; cwd: string; commands: string[] }): Completion {
  const lastSpace = line.lastIndexOf(' ');
  const token = line.slice(lastSpace + 1);
  const firstWord = lastSpace < 0;
  const candidates = firstWord && !token.includes('/') && !token.startsWith('.')
    ? opts.commands.filter(c => c.startsWith(token)).sort()
    : entriesFor(opts.root, opts.cwd, token);
  if (candidates.length === 0) return { add: '', options: [] };
  if (candidates.length === 1) {
    const only = candidates[0];
    return { add: only.slice(token.length) + (only.endsWith('/') ? '' : ' '), options: [] };
  }
  const shared = commonPrefix(candidates);
  const add = shared.slice(token.length);
  return { add, options: add ? [] : candidates };
}
