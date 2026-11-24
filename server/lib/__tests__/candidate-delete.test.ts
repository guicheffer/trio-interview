import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { deleteCandidate } from '../candidate-delete.js';

describe('deleteCandidate', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'delete-'));
    mkdirSync(join(root, 'ana', 'ex'), { recursive: true });
    writeFileSync(join(root, 'ana', 'ex', 'a.js'), 'x');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  test('removes the whole folder of a candidate that is not in use', () => {
    expect(deleteCandidate('ana', { root })).toBe('deleted');
    expect(existsSync(join(root, 'ana'))).toBe(false);
  });

  test('keeps the active or connected candidate', () => {
    expect(deleteCandidate('ana', { root, activeName: 'ana' })).toBe('busy');
    expect(deleteCandidate('ana', { root, connected: 1 })).toBe('busy');
    expect(existsSync(join(root, 'ana'))).toBe(true);
  });

  test('refuses names that are not a plain folder name, and unknown ones', () => {
    expect(deleteCandidate('../x', { root })).toBe('invalid');
    expect(deleteCandidate('', { root })).toBe('invalid');
    expect(deleteCandidate('nobody', { root })).toBe('missing');
  });
});
