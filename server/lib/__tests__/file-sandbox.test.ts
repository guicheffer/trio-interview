import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { FileSandbox, SecurityError } from '../file-sandbox.js';
import { mkdtemp, writeFile, symlink, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('FileSandbox', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'test-sandbox-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('allows reading files within sandbox', async () => {
    await writeFile(join(tmpDir, 'test.txt'), 'hello world');

    const sandbox = new FileSandbox(tmpDir);
    const content = await sandbox.readFile('test.txt');

    expect(content).toBe('hello world');
  });

  test('allows writing files within sandbox', async () => {
    const sandbox = new FileSandbox(tmpDir);
    await sandbox.writeFile('output.txt', 'test content');

    const content = await sandbox.readFile('output.txt');
    expect(content).toBe('test content');
  });

  test('blocks path traversal with ../', async () => {
    const sandbox = new FileSandbox(tmpDir);

    await expect(
      sandbox.readFile('../../etc/passwd')
    ).rejects.toThrow(SecurityError);

    await expect(
      sandbox.readFile('../../etc/passwd')
    ).rejects.toThrow('Path outside sandbox');
  });

  test('blocks absolute paths', async () => {
    const sandbox = new FileSandbox(tmpDir);

    await expect(
      sandbox.readFile('/etc/passwd')
    ).rejects.toThrow(SecurityError);

    await expect(
      sandbox.readFile('/etc/passwd')
    ).rejects.toThrow('Path outside sandbox');
  });

  test('blocks symlink access', async () => {
    const linkPath = join(tmpDir, 'link');
    await writeFile(join(tmpdir(), 'target.txt'), 'secret');
    await symlink(join(tmpdir(), 'target.txt'), linkPath);

    const sandbox = new FileSandbox(tmpDir);

    await expect(
      sandbox.readFile('link')
    ).rejects.toThrow(SecurityError);

    await expect(
      sandbox.readFile('link')
    ).rejects.toThrow(/outside sandbox|Symlink access denied/);
  });

  test('lists files in sandbox', async () => {
    await writeFile(join(tmpDir, 'file1.txt'), 'content1');
    await writeFile(join(tmpDir, 'file2.txt'), 'content2');

    const sandbox = new FileSandbox(tmpDir);
    const files = await sandbox.listFiles();

    expect(files).toContain('file1.txt');
    expect(files).toContain('file2.txt');
  });
});

describe('FileSandbox listing and moving', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'test-sandbox-list-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('lists a tree and skips hidden and internal entries', async () => {
    const sandbox = new FileSandbox(dir);
    await sandbox.writeFile('src/app.ts', 'a');
    await sandbox.writeFile('src/deep/util.ts', 'b');
    await sandbox.writeFile('node_modules/dep/index.js', 'c');
    await sandbox.writeFile('.env', 'secret');
    await sandbox.writeFile('package.json', '{}');
    await sandbox.writeFile('solution/answer.ts', 'd');

    const tree = await sandbox.listFilesTree();

    expect(tree.map(e => e.path)).toEqual(['src', 'src/app.ts', 'src/deep', 'src/deep/util.ts']);
    expect(tree.find(e => e.path === 'src')?.type).toBe('directory');
  });

  test('lists one level', async () => {
    const sandbox = new FileSandbox(dir);
    await sandbox.writeFile('a.ts', '');
    await sandbox.writeFile('.hidden', '');
    await sandbox.writeFile('dist/out.js', '');

    expect(await sandbox.listFiles()).toEqual(['a.ts']);
  });

  test('renames a file but never into another folder', async () => {
    const sandbox = new FileSandbox(dir);
    await sandbox.writeFile('a.ts', 'x');

    await sandbox.renameFile('a.ts', 'b.ts');
    expect(await sandbox.readFile('b.ts')).toBe('x');
    await expect(sandbox.renameFile('b.ts', '../c.ts')).rejects.toBeInstanceOf(SecurityError);
    await expect(sandbox.renameFile('b.ts', 'sub/c.ts')).rejects.toBeInstanceOf(SecurityError);
  });

  test('moves a file, creating the target folder, and refuses targets outside', async () => {
    const sandbox = new FileSandbox(dir);
    await sandbox.createFile('a.ts', 'x');

    await sandbox.moveFile('a.ts', 'deep/er/a.ts');
    expect(await sandbox.readFile('deep/er/a.ts')).toBe('x');
    await expect(sandbox.moveFile('deep/er/a.ts', '../a.ts')).rejects.toBeInstanceOf(SecurityError);
  });

  test('exposes its root', () => {
    expect(new FileSandbox(dir).getRoot()).toBe(dir);
  });
});

describe('FileSandbox symlinks', () => {
  let dir: string;
  let outside: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'test-sandbox-link-'));
    outside = await mkdtemp(join(tmpdir(), 'test-outside-'));
    await writeFile(join(outside, 'secret.txt'), 'secret');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  test('does not write through a folder symlink that points outside', async () => {
    await symlink(outside, join(dir, 'escape'));
    const sandbox = new FileSandbox(dir);

    await expect(sandbox.writeFile('escape/pwned.txt', 'x')).rejects.toBeInstanceOf(SecurityError);
    await expect(sandbox.writeFile('escape/deeper/pwned.txt', 'x')).rejects.toBeInstanceOf(SecurityError);
  });

  test('does not read through a folder symlink that points outside', async () => {
    await symlink(outside, join(dir, 'escape'));
    const sandbox = new FileSandbox(dir);

    await expect(sandbox.readFile('escape/secret.txt')).rejects.toBeInstanceOf(SecurityError);
  });

  test('does not write through a dangling file symlink', async () => {
    await symlink(join(outside, 'not-yet.txt'), join(dir, 'link.txt'));
    const sandbox = new FileSandbox(dir);

    await expect(sandbox.writeFile('link.txt', 'x')).rejects.toBeInstanceOf(SecurityError);
  });

  test('does not move a file into a symlinked folder that points outside', async () => {
    await symlink(outside, join(dir, 'escape'));
    const sandbox = new FileSandbox(dir);
    await sandbox.writeFile('a.txt', 'x');

    await expect(sandbox.moveFile('a.txt', 'escape/a.txt')).rejects.toBeInstanceOf(SecurityError);
  });

  test('still allows symlinks that stay inside the folder', async () => {
    const sandbox = new FileSandbox(dir);
    await sandbox.writeFile('real/file.txt', 'inside');
    await symlink(join(dir, 'real'), join(dir, 'alias'));

    await sandbox.writeFile('alias/new.txt', 'ok');
    expect(await sandbox.readFile('real/new.txt')).toBe('ok');
  });
});
