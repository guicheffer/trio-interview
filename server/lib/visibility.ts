import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { readExerciseConfig } from './exercise-config.js';

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  hidden?: boolean;
}

export function loadHiddenPatterns(templatePath: string): string[] {
  return readExerciseConfig(templatePath).hidden;
}

function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\uE000')
    .replace(/\*/g, '[^/]*')
    .replace(/\uE000/g, '.*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${escaped}$`);
}

function walk(root: string, base = ''): string[] {
  const out: string[] = [];
  let entries;
  try { entries = readdirSync(join(root, base), { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(root, rel));
    else out.push(rel);
  }
  return out;
}

const solutionsRoot = () => resolve(process.cwd(), '.solutions');
export const hiddenRoot = (candidate: string, exercise: string) => join(solutionsRoot(), candidate, '.hidden', exercise);
const workRoot = (candidate: string, exercise: string) => join(solutionsRoot(), candidate, exercise);
const statePath = (candidate: string) => join(solutionsRoot(), candidate, 'state.json');

function readState(candidate: string): Record<string, any> {
  try { return JSON.parse(readFileSync(statePath(candidate), 'utf-8')); } catch { return {}; }
}

export function readRevealed(candidate: string, exercise: string): string[] {
  const list = readState(candidate).visibility?.[exercise]?.revealed;
  return Array.isArray(list) ? list : [];
}

export function writeRevealed(candidate: string, exercise: string, revealed: string[]): void {
  const state = readState(candidate);
  state.visibility = state.visibility ?? {};
  state.visibility[exercise] = { revealed: [...new Set(revealed)].sort() };
  mkdirSync(dirname(statePath(candidate)), { recursive: true });
  writeFileSync(statePath(candidate), JSON.stringify(state, null, 2), 'utf-8');
}

/** Every file, currently visible or not, that the exercise config manages. */
export function managedFiles(templatePath: string, candidate: string, exercise: string): string[] {
  const patterns = loadHiddenPatterns(templatePath).map(patternToRegExp);
  if (patterns.length === 0) return [];
  const all = new Set([...walk(workRoot(candidate, exercise)), ...walk(hiddenRoot(candidate, exercise))]);
  return [...all].filter(p => patterns.some(re => re.test(p))).sort();
}

export function hiddenNow(candidate: string, exercise: string): string[] {
  return walk(hiddenRoot(candidate, exercise)).sort();
}

function move(from: string, to: string) {
  mkdirSync(dirname(to), { recursive: true });
  renameSync(from, to);
}

function reveal(inWork: string, inHidden: string): void {
  if (!existsSync(inWork) && existsSync(inHidden)) move(inHidden, inWork);
}

function hide(inWork: string, inHidden: string): void {
  if (!existsSync(inWork)) return;
  if (existsSync(inHidden)) {
    // A copy may already be stored aside (for example after a server restart), keep the one being edited
    writeFileSync(inHidden, readFileSync(inWork));
    rmSync(inWork, { force: true });
  } else {
    move(inWork, inHidden);
  }
}

/**
 * Moves files between the candidate folder and a folder next to it, so a hidden file is really gone
 * for the candidate: the file tree, the terminal and the AI assistant can no longer read it.
 */
export function applyVisibility(templatePath: string, candidate: string, exercise: string): { hidden: string[]; visible: string[] } {
  const revealed = new Set(readRevealed(candidate, exercise));
  const hidden: string[] = [];
  const visible: string[] = [];
  restoreReference(candidate, exercise);

  for (const rel of managedFiles(templatePath, candidate, exercise)) {
    const inWork = join(workRoot(candidate, exercise), rel);
    const inHidden = join(hiddenRoot(candidate, exercise), rel);
    if (revealed.has(rel)) {
      reveal(inWork, inHidden);
      visible.push(rel);
    } else {
      hide(inWork, inHidden);
      hidden.push(rel);
    }
  }
  return { hidden, visible };
}

/** Path of a hidden file, for the interviewer to read and edit */
export function hiddenFilePath(candidate: string, exercise: string, rel: string): string | null {
  const root = hiddenRoot(candidate, exercise);
  const full = resolve(root, rel);
  if (!full.startsWith(root + '/')) return null;
  return existsSync(full) && statSync(full).isFile() ? full : null;
}

/** Adds the hidden files to a flat listing, marked as hidden, keeping folders and names in order */
export function mergeHidden(listing: FileEntry[], hiddenFiles: string[]): FileEntry[] {
  if (hiddenFiles.length === 0) return listing;
  const byPath = new Map<string, FileEntry>(listing.map(e => [e.path, e]));
  for (const rel of hiddenFiles) {
    const parts = rel.split('/');
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      if (!byPath.has(dir)) byPath.set(dir, { name: parts[i - 1], path: dir, type: 'directory' });
    }
    byPath.set(rel, { name: parts[parts.length - 1], path: rel, type: 'file', hidden: true });
  }

  const children = new Map<string, FileEntry[]>();
  for (const entry of byPath.values()) {
    const parent = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '';
    const list = children.get(parent) ?? [];
    list.push(entry);
    children.set(parent, list);
  }
  const out: FileEntry[] = [];
  const emit = (parent: string) => {
    const list = (children.get(parent) ?? []).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    for (const entry of list) {
      out.push(entry);
      if (entry.type === 'directory') emit(entry.path);
    }
  };
  emit('');
  return out;
}

/** Folders from a short lived version kept released phase briefs aside; they belong in the candidate folder */
function restoreReference(candidate: string, exercise: string): void {
  const aside = join(solutionsRoot(), candidate, '.reference', exercise);
  for (const rel of walk(aside)) {
    const target = join(workRoot(candidate, exercise), rel);
    if (!existsSync(target)) move(join(aside, rel), target);
  }
  rmSync(join(solutionsRoot(), candidate, '.reference'), { recursive: true, force: true });
}
