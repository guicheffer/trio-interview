import { describe, expect, test } from 'vitest';
import { mergeChanges } from '../ai-changes.js';

const source = (changedAt: number, changes: Array<{ file: string; before: string | null }>) => ({ changedAt, lastChanges: () => changes });

describe('mergeChanges', () => {
  test('joins what each session changed', () => {
    const merged = mergeChanges([source(1, [{ file: 'a.ts', before: 'x' }]), source(2, [{ file: 'b.ts', before: null }])]);
    expect(merged.map(c => c.file).sort()).toEqual(['a.ts', 'b.ts']);
  });

  test('keeps the more recent change for a file both changed', () => {
    const merged = mergeChanges([source(5, [{ file: 'a.ts', before: 'newer' }]), source(2, [{ file: 'a.ts', before: 'older' }])]);
    expect(merged).toEqual([{ file: 'a.ts', before: 'newer' }]);
  });

  test('is empty without sessions', () => {
    expect(mergeChanges([])).toEqual([]);
  });
});
