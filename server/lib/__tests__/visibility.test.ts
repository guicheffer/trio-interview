import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import {
  applyVisibility,
  hiddenFilePath,
  hiddenNow,
  loadHiddenPatterns,
  managedFiles,
  mergeHidden,
  readRevealed,
  writeRevealed,
} from '../visibility.js';

function put(path: string, content = 'x') {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

describe('visibility on disk', () => {
  let cwd: string;
  let root: string;
  let template: string;

  beforeEach(() => {
    cwd = process.cwd();
    root = mkdtempSync(join(tmpdir(), 'visibility-'));
    process.chdir(root);
    template = join(root, 'template');
    put(join(template, 'exercise.json'), JSON.stringify({ hidden: ['phases/phase-2-*.md', 'secret/**'] }));
    put(join(root, '.solutions', 'maria', 'ex', 'phases', 'phase-1.md'), 'one');
    put(join(root, '.solutions', 'maria', 'ex', 'phases', 'phase-2-bugs.md'), 'two');
    put(join(root, '.solutions', 'maria', 'ex', 'secret', 'deep', 'a.md'), 'deep');
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(root, { recursive: true, force: true });
  });

  test('loads the patterns from the template, and none when the file is missing', () => {
    expect(loadHiddenPatterns(template)).toHaveLength(2);
    expect(loadHiddenPatterns(join(root, 'nowhere'))).toEqual([]);
  });

  test('lists the files the config manages, by pattern', () => {
    expect(managedFiles(template, 'maria', 'ex')).toEqual(['phases/phase-2-bugs.md', 'secret/deep/a.md']);
    expect(managedFiles(join(root, 'nowhere'), 'maria', 'ex')).toEqual([]);
  });

  test('hides managed files by moving them out of the candidate folder', () => {
    const result = applyVisibility(template, 'maria', 'ex');

    expect(result.hidden).toEqual(['phases/phase-2-bugs.md', 'secret/deep/a.md']);
    expect(existsSync(join(root, '.solutions', 'maria', 'ex', 'phases', 'phase-2-bugs.md'))).toBe(false);
    expect(existsSync(join(root, '.solutions', 'maria', 'ex', 'phases', 'phase-1.md'))).toBe(true);
    expect(hiddenNow('maria', 'ex')).toEqual(['phases/phase-2-bugs.md', 'secret/deep/a.md']);
  });

  test('reveals a file and keeps the rest hidden', () => {
    applyVisibility(template, 'maria', 'ex');
    writeRevealed('maria', 'ex', ['phases/phase-2-bugs.md', 'phases/phase-2-bugs.md']);
    const result = applyVisibility(template, 'maria', 'ex');

    expect(readRevealed('maria', 'ex')).toEqual(['phases/phase-2-bugs.md']);
    expect(result.visible).toEqual(['phases/phase-2-bugs.md']);
    expect(result.hidden).toEqual(['secret/deep/a.md']);
    expect(readFileSync(join(root, '.solutions', 'maria', 'ex', 'phases', 'phase-2-bugs.md'), 'utf-8')).toBe('two');
  });

  test('keeps the edited copy when a stored copy already exists', () => {
    applyVisibility(template, 'maria', 'ex');
    put(join(root, '.solutions', 'maria', 'ex', 'phases', 'phase-2-bugs.md'), 'edited');
    applyVisibility(template, 'maria', 'ex');

    const stored = hiddenFilePath('maria', 'ex', 'phases/phase-2-bugs.md');
    expect(stored && readFileSync(stored, 'utf-8')).toBe('edited');
    expect(existsSync(join(root, '.solutions', 'maria', 'ex', 'phases', 'phase-2-bugs.md'))).toBe(false);
  });

  test('only serves hidden files from inside the hidden folder', () => {
    applyVisibility(template, 'maria', 'ex');

    expect(hiddenFilePath('maria', 'ex', 'phases/phase-2-bugs.md')).not.toBeNull();
    expect(hiddenFilePath('maria', 'ex', '../ex/phases/phase-1.md')).toBeNull();
    expect(hiddenFilePath('maria', 'ex', 'missing.md')).toBeNull();
  });

  test('reads no revealed files for a candidate without state', () => {
    expect(readRevealed('nobody', 'ex')).toEqual([]);
  });
});

describe('mergeHidden', () => {
  test('returns the listing untouched when nothing is hidden', () => {
    const listing = [{ name: 'a.md', path: 'a.md', type: 'file' as const }];
    expect(mergeHidden(listing, [])).toBe(listing);
  });

  test('adds hidden files and their folders, sorted and marked', () => {
    const listing = [
      { name: 'phases', path: 'phases', type: 'directory' as const },
      { name: 'phase-1.md', path: 'phases/phase-1.md', type: 'file' as const },
    ];
    const merged = mergeHidden(listing, ['phases/phase-2.md', 'extra/notes.md']);

    expect(merged.map(e => e.path)).toEqual(['extra', 'extra/notes.md', 'phases', 'phases/phase-1.md', 'phases/phase-2.md']);
    expect(merged.find(e => e.path === 'phases/phase-2.md')).toMatchObject({ hidden: true, type: 'file' });
    expect(merged.find(e => e.path === 'phases/phase-1.md')?.hidden).toBeUndefined();
  });
});

describe('visibility migration', () => {
  test('puts phase briefs kept aside by an older version back in the candidate folder', () => {
    const cwd = process.cwd();
    const root = mkdtempSync(join(tmpdir(), 'visibility-ref-'));
    process.chdir(root);
    try {
      const template = join(root, 'template');
      put(join(template, 'exercise.json'), JSON.stringify({ hidden: [] }));
      put(join(root, '.solutions', 'ana', '.reference', 'ex', 'phases', 'phase-1.md'), 'one');
      mkdirSync(join(root, '.solutions', 'ana', 'ex'), { recursive: true });
      applyVisibility(template, 'ana', 'ex');
      expect(readFileSync(join(root, '.solutions', 'ana', 'ex', 'phases', 'phase-1.md'), 'utf-8')).toBe('one');
      expect(existsSync(join(root, '.solutions', 'ana', '.reference'))).toBe(false);
    } finally {
      process.chdir(cwd);
      rmSync(root, { recursive: true, force: true });
    }
  });
});
