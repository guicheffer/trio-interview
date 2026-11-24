import { describe, expect, test } from 'vitest';
import { moveHead, selectionRange } from '../terminalSelect';

const size = { cols: 10, rows: 5 };

describe('moveHead', () => {
  test('moves a character, wrapping at the ends of a line', () => {
    expect(moveHead({ col: 3, row: 2 }, 'ArrowLeft', size)).toEqual({ col: 2, row: 2 });
    expect(moveHead({ col: 0, row: 2 }, 'ArrowLeft', size)).toEqual({ col: 9, row: 1 });
    expect(moveHead({ col: 10, row: 2 }, 'ArrowRight', size)).toEqual({ col: 1, row: 3 });
    expect(moveHead({ col: 0, row: 0 }, 'ArrowLeft', size)).toEqual({ col: 0, row: 0 });
  });

  test('moves a line, and to the ends of the line', () => {
    expect(moveHead({ col: 4, row: 0 }, 'ArrowUp', size)).toEqual({ col: 4, row: 0 });
    expect(moveHead({ col: 4, row: 4 }, 'ArrowDown', size)).toEqual({ col: 4, row: 4 });
    expect(moveHead({ col: 4, row: 2 }, 'Home', size)).toEqual({ col: 0, row: 2 });
    expect(moveHead({ col: 4, row: 2 }, 'End', size)).toEqual({ col: 10, row: 2 });
  });
});

describe('selectionRange', () => {
  test('is the same going forward or backward', () => {
    const a = { col: 2, row: 1 };
    const b = { col: 5, row: 1 };
    expect(selectionRange({ anchor: a, head: b }, 10)).toEqual({ col: 2, row: 1, length: 3 });
    expect(selectionRange({ anchor: b, head: a }, 10)).toEqual({ col: 2, row: 1, length: 3 });
  });

  test('counts whole lines in between', () => {
    expect(selectionRange({ anchor: { col: 8, row: 0 }, head: { col: 2, row: 2 } }, 10)).toEqual({ col: 8, row: 0, length: 14 });
  });
});
