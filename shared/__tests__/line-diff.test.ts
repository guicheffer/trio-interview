import { describe, expect, test } from 'vitest';
import { countChanges, diffHunks, revertHunk } from '../line-diff';

const before = ['a', 'b', 'c', 'd', 'e'].join('\n');

describe('diffHunks', () => {
  test('no change, no hunks', () => {
    expect(diffHunks(before, before)).toEqual([]);
  });

  test('a changed line is one hunk with what left and what came', () => {
    expect(diffHunks(before, ['a', 'B', 'c', 'd', 'e'].join('\n'))).toEqual([{ line: 1, removed: ['b'], added: ['B'] }]);
  });

  test('separate edits are separate hunks', () => {
    const hunks = diffHunks(before, ['a', 'B', 'c', 'd', 'E', 'f'].join('\n'))!;
    expect(hunks.map(h => [h.removed, h.added])).toEqual([[['b'], ['B']], [['e'], ['E', 'f']]]);
  });

  test('a new file against nothing is all added', () => {
    expect(diffHunks('', 'x\ny')).toEqual([{ line: 0, removed: [], added: ['x', 'y'] }]);
  });

  test('very large files are not compared', () => {
    const big = Array.from({ length: 3000 }, (_, i) => String(i)).join('\n');
    expect(diffHunks(big, big + '\nx')).toBeNull();
  });
});

describe('revertHunk', () => {
  const after = ['a', 'B', 'c', 'd', 'E', 'f'].join('\n');

  test('puts back only the chosen hunk', () => {
    expect(revertHunk(before, after, 0)).toBe(['a', 'b', 'c', 'd', 'E', 'f'].join('\n'));
    expect(revertHunk(before, after, 1)).toBe(['a', 'B', 'c', 'd', 'e'].join('\n'));
  });

  test('reverting every hunk one after the other gives the original', () => {
    const once = revertHunk(before, after, 0)!;
    expect(revertHunk(before, once, 0)).toBe(before);
  });

  test('removed lines come back and added lines go', () => {
    expect(revertHunk('x\ny\nz', 'x\nz', 0)).toBe('x\ny\nz');
    expect(revertHunk('x\nz', 'x\ny\nz', 0)).toBe('x\nz');
  });
});

describe('countChanges', () => {
  test('counts added and removed lines', () => {
    expect(countChanges('a\nb\nc', 'a\nB\nc\nd')).toEqual({ added: 2, removed: 1 });
    expect(countChanges('', 'x\ny')).toEqual({ added: 2, removed: 0 });
    expect(countChanges('same', 'same')).toEqual({ added: 0, removed: 0 });
  });
});
