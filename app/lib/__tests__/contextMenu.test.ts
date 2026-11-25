import { describe, expect, test } from 'vitest';
import {
  SEPARATOR, cleanEntries, edgeIndex, isMenuKey, placeMenu, stepIndex, typeAheadIndex, type MenuEntry,
} from '../contextMenu';

const item = (id: string, label = id, disabled = false): MenuEntry => ({ id, label, disabled, onSelect: () => {} });
const VIEW = { width: 1000, height: 700 };
const MENU = { width: 200, height: 150 };

describe('placeMenu', () => {
  test('opens at the cursor when there is room', () => {
    expect(placeMenu({ x: 100, y: 120 }, MENU, VIEW)).toEqual({ left: 100, top: 120 });
  });

  test('flips to the left of the cursor near the right edge', () => {
    expect(placeMenu({ x: 950, y: 120 }, MENU, VIEW)).toEqual({ left: 750, top: 120 });
  });

  test('flips above the cursor near the bottom edge', () => {
    expect(placeMenu({ x: 100, y: 650 }, MENU, VIEW)).toEqual({ left: 100, top: 500 });
  });

  test('flips both ways in the bottom right corner', () => {
    expect(placeMenu({ x: 999, y: 699 }, MENU, VIEW)).toEqual({ left: 792, top: 542 });
  });

  test('never leaves the viewport, even when the menu is larger than it', () => {
    const tiny = { width: 120, height: 90 };
    const spot = placeMenu({ x: 60, y: 45 }, { width: 300, height: 400 }, tiny);
    expect(spot).toEqual({ left: 8, top: 8 });
  });

  test('keeps the margin to the edge when it fits exactly', () => {
    const spot = placeMenu({ x: 790, y: 540 }, MENU, VIEW);
    expect(spot.left + MENU.width).toBeLessThanOrEqual(VIEW.width - 8);
    expect(spot.top + MENU.height).toBeLessThanOrEqual(VIEW.height - 8);
  });
});

describe('cleanEntries', () => {
  test('drops leading, trailing and repeated separators and empty entries', () => {
    const out = cleanEntries([SEPARATOR, item('a'), SEPARATOR, SEPARATOR, false, item('b'), SEPARATOR, null]);
    expect(out.map(e => ('separator' in e ? '-' : e.id))).toEqual(['a', '-', 'b']);
  });
});

describe('keyboard movement', () => {
  const entries = [item('a'), SEPARATOR, item('b', 'b', true), item('c')];

  test('arrows skip separators and disabled items and wrap', () => {
    expect(stepIndex(entries, -1, 1)).toBe(0);
    expect(stepIndex(entries, 0, 1)).toBe(3);
    expect(stepIndex(entries, 3, 1)).toBe(0);
    expect(stepIndex(entries, 0, -1)).toBe(3);
    expect(stepIndex(entries, -1, -1)).toBe(3);
  });

  test('Home and End pick the first and last enabled item', () => {
    expect(edgeIndex(entries, 'first')).toBe(0);
    expect(edgeIndex(entries, 'last')).toBe(3);
    expect(edgeIndex([item('x', 'x', true)], 'first')).toBe(-1);
  });

  test('nothing can be reached when every item is disabled', () => {
    expect(stepIndex([item('x', 'x', true)], -1, 1)).toBe(-1);
  });

  test('typing jumps to the next enabled item that starts with the letters', () => {
    const list = [item('new', 'New file'), item('nf', 'New folder'), item('del', 'Delete'), item('dup', 'Duplicate', true)];
    expect(typeAheadIndex(list, -1, 'n')).toBe(0);
    expect(typeAheadIndex(list, 0, 'n')).toBe(1);
    expect(typeAheadIndex(list, 1, 'd')).toBe(2);
    expect(typeAheadIndex(list, 2, 'du')).toBe(-1);
    expect(typeAheadIndex(list, -1, 'z')).toBe(-1);
  });
});

describe('isMenuKey', () => {
  test('the Menu key and Shift+F10 open the menu, a plain F10 does not', () => {
    expect(isMenuKey({ key: 'ContextMenu' })).toBe(true);
    expect(isMenuKey({ key: 'F10', shiftKey: true })).toBe(true);
    expect(isMenuKey({ key: 'F10' })).toBe(false);
    expect(isMenuKey({ key: 'F10', shiftKey: true, ctrlKey: true })).toBe(false);
  });
});
