import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { completeLine } from '../tab-complete.js';

describe('completeLine', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'tab-'));
    mkdirSync(join(root, 'src', 'server'), { recursive: true });
    mkdirSync(join(root, 'plans'));
    writeFileSync(join(root, 'fibonacci.js'), 'x');
    writeFileSync(join(root, 'fibonacci.test.js'), 'x');
    writeFileSync(join(root, 'package.json'), '{}');
    writeFileSync(join(root, '.env'), 'x');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  const run = (line: string) => completeLine(line, { root, cwd: root, commands: ['node', 'npm', 'npx', 'ls'] });

  test('completes a file name, with a space after a file and a slash after a folder', () => {
    expect(run('cat pack')).toEqual({ add: 'age.json ', options: [] });
    expect(run('ls sr')).toEqual({ add: 'c/', options: [] });
    expect(run('cat src/ser')).toEqual({ add: 'ver/', options: [] });
  });

  test('adds the shared start when several match, and lists them when nothing more can be added', () => {
    expect(run('node fib')).toEqual({ add: 'onacci.', options: [] });
    expect(run('node fibonacci.')).toEqual({ add: '', options: ['fibonacci.js', 'fibonacci.test.js'] });
  });

  test('completes command names for the first word', () => {
    expect(run('np')).toEqual({ add: '', options: ['npm', 'npx'] });
    expect(run('nod')).toEqual({ add: 'e ', options: [] });
  });

  test('hides dotfiles unless asked and never leaves the exercise folder', () => {
    expect(run('cat .e')).toEqual({ add: 'nv ', options: [] });
    expect(run('ls ../')).toEqual({ add: '', options: [] });
  });
});
