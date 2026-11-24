import { describe, expect, test } from 'vitest';
import { isHiddenFile, setHiddenFiles } from '../hiddenFiles';

describe('hidden files', () => {
  test('knows which files the candidate cannot see yet, and forgets them once shown', () => {
    setHiddenFiles(['phases/phase-2.md', 'phases/phase-3.md']);
    expect(isHiddenFile('phases/phase-2.md')).toBe(true);
    expect(isHiddenFile('src/index.ts')).toBe(false);
    expect(isHiddenFile(null)).toBe(false);
    setHiddenFiles(['phases/phase-3.md']);
    expect(isHiddenFile('phases/phase-2.md')).toBe(false);
    setHiddenFiles([]);
    expect(isHiddenFile('phases/phase-3.md')).toBe(false);
  });
});
