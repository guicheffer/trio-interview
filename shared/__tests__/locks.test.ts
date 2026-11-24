import { describe, expect, test } from 'vitest';
import { isLockedPath } from '../locks.js';

describe('isLockedPath', () => {
  test('matches a file by name in any folder', () => {
    expect(isLockedPath('description.md', ['description.md'])).toBe(true);
    expect(isLockedPath('docs/description.md', ['description.md'])).toBe(true);
    expect(isLockedPath('description.md.bak', ['description.md'])).toBe(false);
  });

  test('matches an exact path only at that path', () => {
    expect(isLockedPath('src/app.ts', ['src/app.ts'])).toBe(true);
    expect(isLockedPath('lib/src/app.ts', ['src/app.ts'])).toBe(false);
  });

  test('matches a whole folder with a trailing slash or /**', () => {
    expect(isLockedPath('phases/phase-2.md', ['phases/'])).toBe(true);
    expect(isLockedPath('phases/deep/one.md', ['phases/**'])).toBe(true);
    expect(isLockedPath('phases', ['phases/'])).toBe(true);
    expect(isLockedPath('phases-extra/one.md', ['phases/'])).toBe(false);
  });

  test('matches globs without crossing folders for a single star', () => {
    expect(isLockedPath('fixtures/a.json', ['fixtures/*.json'])).toBe(true);
    expect(isLockedPath('fixtures/sub/a.json', ['fixtures/*.json'])).toBe(false);
    expect(isLockedPath('fixtures/sub/a.json', ['fixtures/**/*.json'])).toBe(true);
  });

  test('ignores empty patterns and leading or trailing slashes on the path', () => {
    expect(isLockedPath('/phases/a.md/', ['', '/phases/'])).toBe(true);
    expect(isLockedPath('anything', [''])).toBe(false);
  });

  test('a path written another way is still the same file', () => {
    expect(isLockedPath('./phases/a.md', ['phases/'])).toBe(true);
    expect(isLockedPath('src/../phases/a.md', ['phases/'])).toBe(true);
    expect(isLockedPath('Phases/A.md', ['phases/'])).toBe(true);
    expect(isLockedPath('phases\\a.md', ['phases/'])).toBe(true);
    expect(isLockedPath('../description.md', ['description.md'])).toBe(true);
    expect(isLockedPath('src/../src/a.md', ['phases/'])).toBe(false);
  });
});
