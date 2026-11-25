import { describe, expect, test } from 'vitest';
import { migrateReviewKeys, remapList, remapPath, remapReviewKey, remapScrollRecord } from '../renamePaths';

describe('remapPath', () => {
  test('a renamed file moves, and so does everything inside a renamed folder', () => {
    expect(remapPath('a.ts', 'a.ts', 'b.ts')).toBe('b.ts');
    expect(remapPath('src/a.ts', 'src', 'lib')).toBe('lib/a.ts');
    expect(remapPath('src/deep/a.ts', 'src', 'lib')).toBe('lib/deep/a.ts');
  });

  test('a path that only starts with the same letters stays', () => {
    expect(remapPath('src2/a.ts', 'src', 'lib')).toBe('src2/a.ts');
    expect(remapPath('src.ts', 'src', 'lib')).toBe('src.ts');
  });
});

describe('remapList', () => {
  test('keeps every tab in its position and renames the ones that moved', () => {
    expect(remapList(['__preview__', 'src/a.ts', 'x.md', 'src/b.ts'], 'src', 'lib')).toEqual(['__preview__', 'lib/a.ts', 'x.md', 'lib/b.ts']);
  });

  test('does not repeat a tab that the other screen already renamed', () => {
    expect(remapList(['lib/a.ts', 'src/a.ts', 'x.md'], 'src', 'lib')).toEqual(['lib/a.ts', 'x.md']);
  });
});

describe('review keys', () => {
  test('the file part of a key is renamed and the hash kept', () => {
    expect(remapReviewKey('trio_review_kept_src/a.ts_1x2y', 'src/a.ts', 'src/b.ts')).toBe('trio_review_kept_src/b.ts_1x2y');
    expect(remapReviewKey('trio_review_counts_src/a_b.ts_9z', 'src', 'lib')).toBe('trio_review_counts_lib/a_b.ts_9z');
  });

  test('other keys and other files are left alone', () => {
    expect(remapReviewKey('trio_review_kept_x.ts_1', 'src/a.ts', 'src/b.ts')).toBeNull();
    expect(remapReviewKey('trio_cc_tabs_k', 'src/a.ts', 'src/b.ts')).toBeNull();
  });

  test('migrate moves the stored values to the new names', () => {
    const data = new Map<string, string>([
      ['trio_review_kept_src/a.ts_1', '["h"]'],
      ['trio_review_counts_src/a.ts_1', '{"added":1,"removed":0}'],
      ['trio_review_kept_other.ts_1', '[]'],
    ]);
    const storage = {
      get length() { return data.size; },
      key: (i: number) => [...data.keys()][i] ?? null,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => { data.set(k, v); },
      removeItem: (k: string) => { data.delete(k); },
    };
    migrateReviewKeys(storage, 'src', 'lib');
    expect([...data.keys()].sort()).toEqual(['trio_review_counts_lib/a.ts_1', 'trio_review_kept_lib/a.ts_1', 'trio_review_kept_other.ts_1']);
    expect(data.get('trio_review_kept_lib/a.ts_1')).toBe('["h"]');
  });
});

describe('remapScrollRecord', () => {
  test('follows the file, keeps the position', () => {
    expect(JSON.parse(remapScrollRecord('{"file":"src/a.ts","line":9}', 'src', 'lib')!)).toEqual({ file: 'lib/a.ts', line: 9 });
  });
  test('nothing to change gives null', () => {
    expect(remapScrollRecord('{"file":"x.ts","line":9}', 'src', 'lib')).toBeNull();
    expect(remapScrollRecord('nope', 'src', 'lib')).toBeNull();
    expect(remapScrollRecord(null, 'src', 'lib')).toBeNull();
  });
});
