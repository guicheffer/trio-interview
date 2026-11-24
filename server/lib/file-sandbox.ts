import { resolve, relative, dirname, isAbsolute, sep } from 'path';
import { lstatSync, realpathSync } from 'fs';
import { readFile as fsReadFile, writeFile as fsWriteFile, readdir, lstat, mkdir, rename as fsRename } from 'fs/promises';

export class FileSandbox {
  private readonly exerciseRoot: string;

  constructor(exercisePath: string) {
    this.exerciseRoot = resolve(exercisePath);
  }

  /**
   * Validates that requested path is within sandbox.
   * Returns absolute path if valid, throws SecurityError if invalid.
   */
  private validatePath(requestedPath: string): string {
    // Resolve relative to exercise root
    const resolved = resolve(this.exerciseRoot, requestedPath);

    // Check if path escapes sandbox
    const rel = relative(this.exerciseRoot, resolved);
    if (rel.startsWith('..') || resolve(this.exerciseRoot, rel) !== resolved) {
      throw new SecurityError(`Path outside sandbox: ${requestedPath}`);
    }
    this.assertRealPathInside(resolved, requestedPath);

    return resolved;
  }

  /**
   * A symlink inside the folder can point anywhere, for example one made by the candidate's own code, and
   * writing through it would leave the sandbox. The deepest part of the path that exists is resolved to its
   * real location and must still be inside the real exercise folder. A dangling symlink is refused.
   */
  private assertRealPathInside(resolved: string, requestedPath: string): void {
    let root: string;
    try { root = realpathSync(this.exerciseRoot); } catch { return; }
    let probe = resolved;
    for (;;) {
      try { lstatSync(probe); break; } catch {
        const parent = dirname(probe);
        if (parent === probe) break;
        probe = parent;
      }
    }
    let real: string;
    try { real = realpathSync(probe); } catch { throw new SecurityError(`Path outside sandbox: ${requestedPath}`); }
    const rel = relative(root, real);
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new SecurityError(`Path outside sandbox: ${requestedPath}`);
    }
  }

  /**
   * Check if path is a symlink (block symlink access)
   */
  private async isSymlink(path: string): Promise<boolean> {
    try {
      const stats = await lstat(path);
      return stats.isSymbolicLink();
    } catch {
      return false;
    }
  }

  async readFile(path: string): Promise<string> {
    const safePath = this.validatePath(path);

    // Block symlinks
    if (await this.isSymlink(safePath)) {
      throw new SecurityError('Symlink access denied');
    }

    return fsReadFile(safePath, 'utf-8');
  }

  async writeFile(path: string, content: string): Promise<void> {
    const safePath = this.validatePath(path);

    // Ensure parent directory exists
    const dir = dirname(safePath);
    if (!dir.startsWith(this.exerciseRoot)) {
      throw new SecurityError('Cannot create directory outside sandbox');
    }

    await mkdir(dir, { recursive: true });
    return fsWriteFile(safePath, content, 'utf-8');
  }

  private static readonly HIDDEN = new Set([
    '.git', 'node_modules', '.DS_Store', '__pycache__',
    '.claude', '.claude.json', '.env', '.env.local',
    'dist', 'build', '.next', '.turbo', 'state.json',
    'package.json', 'package-lock.json', // exercise CJS override, internal
    'solution',  // interviewer solution, never shown to candidates
    'exercise.json', // interviewer config, lists the hidden files
  ]);

  /** Recursive listing returning {name, path, type} for all files in subdirs */
  async listFilesTree(dirPath: string = '.'): Promise<{ name: string; path: string; type: 'file' | 'directory' }[]> {
    const safePath = this.validatePath(dirPath);
    let entries;
    try {
      const { readdirSync } = await import('fs');
      entries = readdirSync(safePath, { withFileTypes: true });
    } catch { return []; }

    const result: { name: string; path: string; type: 'file' | 'directory' }[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.') || FileSandbox.HIDDEN.has(entry.name)) continue;
      const relPath = dirPath === '.' ? entry.name : `${dirPath}/${entry.name}`;
      if (entry.isDirectory()) {
        result.push({ name: entry.name, path: relPath, type: 'directory' });
        const children = await this.listFilesTree(relPath);
        result.push(...children);
      } else {
        result.push({ name: entry.name, path: relPath, type: 'file' });
      }
    }
    return result;
  }

  async listFiles(path: string = '.'): Promise<string[]> {
    const safePath = this.validatePath(path);
    const all = await readdir(safePath);
    return all.filter(name => !name.startsWith('.') && !FileSandbox.HIDDEN.has(name));
  }

  async renameFile(oldPath: string, newName: string): Promise<void> {
    const safeOldPath = this.validatePath(oldPath);
    // newName must be a filename (no slashes)
    if (newName.includes('/') || newName.includes('..')) {
      throw new SecurityError('Invalid file name');
    }
    const parentDir = dirname(safeOldPath);
    const safeNewPath = resolve(parentDir, newName);
    // Ensure new path stays in sandbox
    const rel = relative(this.exerciseRoot, safeNewPath);
    if (rel.startsWith('..')) {
      throw new SecurityError('Path outside sandbox');
    }
    await fsRename(safeOldPath, safeNewPath);
  }

  async moveFile(fromPath: string, toPath: string): Promise<void> {
    const safeFrom = this.validatePath(fromPath);
    const safeTo = this.validatePath(toPath);
    await mkdir(dirname(safeTo), { recursive: true });
    await fsRename(safeFrom, safeTo);
  }

  async createFile(path: string, content: string = ''): Promise<void> {
    await this.writeFile(path, content);
  }

  getRoot(): string {
    return this.exerciseRoot;
  }
}

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}
