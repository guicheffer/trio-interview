/**
 * Tracks the active candidate session.
 *
 * Each candidate works in their own copy: .solutions/<name>/<exerciseId>/
 * The exercise template at EXERCISE_PATH is NEVER modified.
 * Candidates edit files in their working directory only.
 */

import { cpSync, existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'fs';
import { resolve, relative, join } from 'path';
import { execFileSync } from 'child_process';
import { assertSafeCandidateName } from './candidate-name.js';
import { BIN } from './binaries.js';
import { CONFIG_FILE } from './exercise-config.js';

/** Copy clean template files from git HEAD into destDir */
function copyFromGit(exerciseRelPath: string, destDir: string, cwd: string): boolean {
  try {
    const gitFiles = execFileSync(BIN.git, ['ls-files', '-z', '--', exerciseRelPath], { cwd })
      .toString().split('\0').filter(f => f.trim());
    if (gitFiles.length === 0) return false;

    for (const gitFile of gitFiles) {
      const fileName = gitFile.slice(exerciseRelPath.length + 1);
      if (!fileName) continue;
      // The config lists the hidden files, so it stays on the interviewer's side; the candidate's assistant could read it otherwise
      if (fileName === CONFIG_FILE) continue;
      const destPath = join(destDir, fileName);
      const destParent = destPath.substring(0, destPath.lastIndexOf('/'));
      if (destParent && destParent !== destDir) mkdirSync(destParent, { recursive: true });
      const content = execFileSync(BIN.git, ['show', `HEAD:${gitFile}`], { cwd });
      writeFileSync(destPath, content);
    }
    console.log(`[ActiveCandidate] Copied ${gitFiles.length} files from git`);
    return true;
  } catch (err) {
    console.warn('[ActiveCandidate] Git copy failed:', (err as Error).message);
    return false;
  }
}

function cloneNodeModules(templatePath: string, workPath: string, relPath: string): void {
  const dest = resolve(workPath, relPath);
  if (existsSync(dest)) return;
  try {
    mkdirSync(resolve(dest, '..'), { recursive: true });
    const source = resolve(templatePath, relPath);
    try { execFileSync(BIN.cp, ['-cR', source, dest], { stdio: 'ignore' }); }
    catch { execFileSync(BIN.cp, ['-R', source, dest], { stdio: 'ignore' }); }
    console.log(`[ActiveCandidate] Cloned ${relPath}`);
  } catch (err) {
    console.warn('[ActiveCandidate] Could not clone', relPath, (err as Error).message);
  }
}

function listDirectory(path: string): string[] {
  try { return readdirSync(path); } catch { return []; }
}

/** Dependencies installed once in the template at `make start` are cloned (copy on write on macOS) into the candidate's copy */
function cloneInstalledDependencies(templatePath: string, workPath: string, rel = '', depth = 0): void {
  for (const name of listDirectory(resolve(templatePath, rel))) {
    const relPath = rel ? `${rel}/${name}` : name;
    if (name === 'node_modules') cloneNodeModules(templatePath, workPath, relPath);
    else if (depth < 2 && !name.startsWith('.')) cloneInstalledDependencies(templatePath, workPath, relPath, depth + 1);
  }
}

interface ActiveSession {
  candidateName: string;
  templatePath: string;  // exercises/fibonacci/ (read-only template)
  workPath: string;      // .solutions/name/fibonacci/ (candidate's working copy)
  exerciseId: string;
}

let active: ActiveSession | null = null;

/** Returns the candidate's working path (or template path as fallback) */
export function getWorkPath(): string {
  if (active) return active.workPath;
  return process.env.EXERCISE_PATH || resolve(process.cwd(), 'exercises', 'fibonacci');
}

/** Forgets the active candidate (used by tests) */
export function clearActiveSession(): void {
  active = null;
}

/** A candidate who is the active one changed their name: the folder moved, so the session follows it */
export function renameActiveSession(oldName: string, newName: string): boolean {
  if (!active || active.candidateName !== oldName) return false;
  assertSafeCandidateName(newName);
  active = { ...active, candidateName: newName, workPath: resolve(process.cwd(), '.solutions', newName, active.exerciseId) };
  return true;
}

export function getActiveSession(): ActiveSession | null {
  return active;
}

function copyFile(from: string, to: string): void {
  writeFileSync(to, readFileSync(from));
}

/** First time (or after a reset): restore the template from git and copy it into the candidate's folder */
function initializeWorkDirectory(templatePath: string, workPath: string, exerciseRelPath: string, cwd: string): void {
  mkdirSync(workPath, { recursive: true });

  // Restore the template from git first, this removes changes a previous session made to exercises/ directly
  try {
    execFileSync(BIN.git, ['checkout', 'HEAD', '--', exerciseRelPath], { cwd, stdio: 'ignore' });
  } catch {
    // Not in a git repo or files not committed, skip
  }

  if (!copyFromGit(exerciseRelPath, workPath, cwd)) {
    // Fallback: copy from the filesystem (the template may be clean or changed)
    cpSync(templatePath, workPath, {
      recursive: true, force: true,
      filter: (src) => {
        const name = src.split('/').pop() ?? '';
        return name !== CONFIG_FILE && !name.startsWith('.');
      },
    });
  }

  // An exercise package.json (often empty) forces CJS for .js files and overrides the root "type":"module"
  const pkgSrc = resolve(templatePath, 'package.json');
  if (existsSync(pkgSrc)) copyFile(pkgSrc, resolve(workPath, 'package.json'));
}

/** Files the platform owns are refreshed on every activation, so existing sessions pick up changes */
function refreshPlatformFiles(templatePath: string, workPath: string): void {
  for (const name of ['AGENTS.md', 'CLAUDE.md']) {
    const src = resolve(process.cwd(), 'exercises', name);
    if (existsSync(src)) copyFile(src, resolve(workPath, name));
  }

  // vite.config.ts carries the VITE_BASE support the preview needs
  const viteSrc = resolve(templatePath, 'codebase', 'vite.config.ts');
  const viteDest = resolve(workPath, 'codebase', 'vite.config.ts');
  if (existsSync(viteSrc) && existsSync(viteDest)) copyFile(viteSrc, viteDest);
}

/** Project level settings override the interviewer's global ones, so no MCP server reaches the candidate's assistant */
function disableMcpServers(workPath: string): void {
  try {
    const claudeDir = resolve(workPath, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    const settingsPath = resolve(claudeDir, 'settings.json');
    if (!existsSync(settingsPath)) {
      writeFileSync(settingsPath, JSON.stringify({ mcpServers: {}, enableAllProjectMcpServers: false }, null, 2));
    }
  } catch {
    // Not fatal, the assistant is also started with --strict-mcp-config
  }
}

/**
 * Initialise a candidate's working directory from the exercise template.
 * If the directory already exists (returning candidate), leaves files intact.
 * Returns the working path.
 */
export function activateCandidate(
  candidateName: string,
  templatePath: string,
  exerciseId: string,
  /** Wipe and recreate the candidate directory (use for fresh re-test) */
  forceReset = false,
): string {
  assertSafeCandidateName(candidateName);
  assertSafeCandidateName(exerciseId);
  const workPath = resolve(process.cwd(), '.solutions', candidateName, exerciseId);
  const cwd = process.cwd();
  const exerciseRelPath = relative(cwd, templatePath).replace(/\\/g, '/');

  if (forceReset && existsSync(workPath)) {
    rmSync(workPath, { recursive: true, force: true });
    console.log(`[ActiveCandidate] Reset working dir for ${candidateName}`);
  }
  if (!existsSync(workPath)) {
    initializeWorkDirectory(templatePath, workPath, exerciseRelPath, cwd);
    console.log(`[ActiveCandidate] ${forceReset ? 'Reset' : 'Initialised'} ${candidateName}/${exerciseId}`);
  }

  cloneInstalledDependencies(templatePath, workPath);
  refreshPlatformFiles(templatePath, workPath);
  disableMcpServers(workPath);

  active = { candidateName, templatePath, workPath, exerciseId };
  return workPath;
}
