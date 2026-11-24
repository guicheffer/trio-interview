import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { isCommandAllowed } from '../command-policy.js';
import { prepareTsxCommand } from '../tsx-command.js';

describe('isCommandAllowed', () => {
  let dir: string;
  let previousCwd: string;

  beforeAll(() => {
    previousCwd = process.cwd();
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'policy-')));
    mkdirSync(join(root, 'exercises', 'demo'), { recursive: true });
    writeFileSync(join(root, 'exercises', 'demo', 'exercise.json'), JSON.stringify({ lockedFiles: ['description.md', 'phases/'] }));
    dir = join(root, '.solutions', 'ana', 'demo');
    mkdirSync(dir, { recursive: true });
    process.chdir(root);
  });

  afterAll(() => {
    process.chdir(previousCwd);
    rmSync(join(dir, '..', '..', '..'), { recursive: true, force: true });
  });

  test('allows an empty line and the listed programs', () => {
    expect(isCommandAllowed('', dir)).toEqual({ ok: true });
    expect(isCommandAllowed('npm test', dir)).toMatchObject({ ok: true, cmd: 'npm test' });
    expect(isCommandAllowed('LS -la', dir).ok).toBe(true);
  });

  test('a leading slash is the slash command form', () => {
    expect(isCommandAllowed('/clear', dir)).toMatchObject({ ok: true, cmd: 'clear' });
    expect(isCommandAllowed('//etc/passwd', dir).ok).toBe(false);
  });

  test('refuses programs that are not listed', () => {
    expect(isCommandAllowed('curl http://example.com', dir)).toEqual({ ok: false, reason: 'Command not allowed: curl' });
    expect(isCommandAllowed('sudo ls', dir).ok).toBe(false);
    expect(isCommandAllowed('bash', dir).ok).toBe(false);
  });

  test('refuses .. anywhere', () => {
    expect(isCommandAllowed('cat ../secret', dir).reason).toMatch(/\.\./);
    expect(isCommandAllowed('ls src/../../', dir).ok).toBe(false);
  });

  test('refuses home, variables and absolute paths outside the exercise', () => {
    expect(isCommandAllowed('cat ~/.ssh/id_rsa', dir).ok).toBe(false);
    expect(isCommandAllowed('cat ~', dir).ok).toBe(false);
    expect(isCommandAllowed('echo $HOME', dir).reason).toMatch(/Variable/);
    expect(isCommandAllowed('cat /etc/passwd', dir).ok).toBe(false);
  });

  test('allows absolute paths inside the exercise, flags and operators', () => {
    expect(isCommandAllowed(`cat ${dir}/src/a.ts`, dir).ok).toBe(true);
    expect(isCommandAllowed('ls -la', dir).ok).toBe(true);
    expect(isCommandAllowed('echo hi > out.txt', dir).ok).toBe(true);
  });

  test('protects locked files and folders from rm, mv and cp', () => {
    expect(isCommandAllowed('rm description.md', dir).reason).toMatch(/locked file: description.md/);
    expect(isCommandAllowed('mv phases/phase-1.md old.md', dir).ok).toBe(false);
    expect(isCommandAllowed('cp -r phases/ copy', dir).ok).toBe(false);
    expect(isCommandAllowed('rm src/app.ts', dir).ok).toBe(true);
    expect(isCommandAllowed('cat description.md', dir).ok).toBe(true);
  });

  test('without locked files nothing is protected', () => {
    const open = realpathSync(mkdtempSync(join(tmpdir(), 'policy-open-')));
    try {
      expect(isCommandAllowed('rm description.md', open).ok).toBe(true);
    } finally {
      rmSync(open, { recursive: true, force: true });
    }
  });
});

describe('prepareTsxCommand', () => {
  let dir: string;

  beforeAll(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'tsx-')));
    writeFileSync(join(dir, 'plain.ts'), 'console.log(1);');
    writeFileSync(join(dir, 'module.ts'), 'export const a = 1;');
    mkdirSync(join(dir, 'sub'));
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test('points a plain script at a temporary module copy', () => {
    const out = prepareTsxCommand('tsx plain.ts --flag', dir);
    expect(out).toBe(`tsx ${join(dir, 'plain.temp.mts')} --flag`);
  });

  test('leaves modules, other commands and missing files alone', () => {
    expect(prepareTsxCommand('tsx module.ts', dir)).toBe('tsx module.ts');
    expect(prepareTsxCommand('node plain.ts', dir)).toBe('node plain.ts');
    expect(prepareTsxCommand('tsx missing.ts', dir)).toBe('tsx missing.ts');
    expect(prepareTsxCommand('tsx plain.js', dir)).toBe('tsx plain.js');
  });
});
