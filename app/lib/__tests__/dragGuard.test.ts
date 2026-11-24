import { describe, expect, test } from 'vitest';
import { createDragGuard } from '../dragGuard';

describe('createDragGuard', () => {
  test('a press and release in the same place is a click', () => {
    const guard = createDragGuard();
    guard.down({ clientX: 100, clientY: 100 });
    expect(guard.isDrag({ clientX: 101, clientY: 102 })).toBe(false);
  });

  test('a press that moved away is a drag, and only once', () => {
    const guard = createDragGuard();
    guard.down({ clientX: 100, clientY: 100 });
    expect(guard.isDrag({ clientX: 100, clientY: 160 })).toBe(true);
    expect(guard.isDrag({ clientX: 100, clientY: 160 })).toBe(false);
  });

  test('a click with no press first (keyboard) is a click', () => {
    expect(createDragGuard().isDrag({ clientX: 5, clientY: 5 })).toBe(false);
  });
});
