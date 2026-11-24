import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { changedSinceStart } from '../changed-files.js';
import { markAiFile, readAiFiles } from '../ai-files.js';

let root: string;
let template: string;
let work: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'trio-changed-'));
  template = join(root, 'template');
  work = join(root, 'maria', 'demo');
  mkdirSync(template, { recursive: true });
  mkdirSync(work, { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('changedSinceStart', () => {
  test('lists edited and new files, not the ones that match the template', () => {
    writeFileSync(join(template, 'same.js'), 'a');
    writeFileSync(join(template, 'edited.js'), 'a');
    writeFileSync(join(work, 'same.js'), 'a');
    writeFileSync(join(work, 'edited.js'), 'b');
    writeFileSync(join(work, 'new.js'), 'c');
    expect(changedSinceStart(work, [template], ['same.js', 'edited.js', 'new.js']).sort()).toEqual(['edited.js', 'new.js']);
  });

  test('a file the platform adds to every folder counts as original', () => {
    const platform = join(root, 'platform');
    mkdirSync(platform);
    writeFileSync(join(platform, 'AGENTS.md'), 'rules');
    writeFileSync(join(work, 'AGENTS.md'), 'rules');
    expect(changedSinceStart(work, [template, platform], ['AGENTS.md'])).toEqual([]);
    writeFileSync(join(work, 'AGENTS.md'), 'rules changed');
    expect(changedSinceStart(work, [template, platform], ['AGENTS.md'])).toEqual(['AGENTS.md']);
  });

  test('a file that vanished does not break the list', () => {
    expect(changedSinceStart(work, [template], ['gone.js'])).toEqual([]);
  });
});

describe('ai files', () => {
  test('remembers each file once and keeps it for the next time', () => {
    markAiFile(work, 'a.js');
    markAiFile(work, 'a.js');
    markAiFile(work, 'src/b.js');
    expect(readAiFiles(work)).toEqual(['a.js', 'src/b.js']);
  });

  test('nothing recorded yet reads as empty', () => {
    expect(readAiFiles(work)).toEqual([]);
  });
});
