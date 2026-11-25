/**
 * Logic of the custom right-click menu, free of React and the DOM so it can be tested:
 * the entries, where the menu goes on screen, and how the arrow keys and typing move through it.
 */

export interface MenuItem {
  id: string;
  label: string;
  onSelect?: () => void;
  /** Shown greyed and not run. Say why with `reason`, an item is never hidden silently */
  disabled?: boolean;
  reason?: string;
  /** Hint on the right, only where a real shortcut exists */
  shortcut?: string;
  danger?: boolean;
}

export interface MenuSeparator { separator: true }

export type MenuEntry = MenuItem | MenuSeparator;

export const isSeparator = (entry: MenuEntry): entry is MenuSeparator => 'separator' in entry;

export const SEPARATOR: MenuSeparator = { separator: true };

/** Drops separators that lead, trail or repeat, so groups that came out empty leave no stray lines */
export function cleanEntries(entries: Array<MenuEntry | null | false | undefined>): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const entry of entries) {
    if (!entry) continue;
    if (isSeparator(entry) && (out.length === 0 || isSeparator(out[out.length - 1]))) continue;
    out.push(entry);
  }
  while (out.length > 0 && isSeparator(out[out.length - 1])) out.pop();
  return out;
}

export interface Size { width: number; height: number }

export const VIEWPORT_MARGIN = 8;

/**
 * Where the top left corner of the menu goes. It opens at the cursor; where that would run past the right or the
 * bottom edge it opens to the left or above the cursor instead, and it never leaves the viewport.
 */
export function placeMenu(point: { x: number; y: number }, menu: Size, viewport: Size, margin = VIEWPORT_MARGIN): { left: number; top: number } {
  const place = (at: number, size: number, room: number): number => {
    let pos = at;
    if (pos + size > room - margin) pos = at - size;
    const max = room - margin - size;
    if (pos > max) pos = max;
    return pos < margin ? margin : pos;
  };
  return { left: place(point.x, menu.width, viewport.width), top: place(point.y, menu.height, viewport.height) };
}

export const isEnabled = (entry: MenuEntry | undefined): entry is MenuItem => !!entry && !isSeparator(entry) && !entry.disabled;

/**
 * The next item for an arrow key, skipping separators and disabled items and wrapping around.
 * Disabled items are skipped by the arrows on purpose: they cannot run, and the reason is on the item itself.
 */
export function stepIndex(entries: MenuEntry[], from: number, direction: 1 | -1): number {
  const count = entries.length;
  if (count === 0) return -1;
  let i = from;
  for (let n = 0; n < count; n++) {
    i = i < 0 ? (direction === 1 ? 0 : count - 1) : (i + direction + count) % count;
    if (isEnabled(entries[i])) return i;
  }
  return -1;
}

export function edgeIndex(entries: MenuEntry[], edge: 'first' | 'last'): number {
  const order = entries.map((_, i) => i);
  if (edge === 'last') order.reverse();
  return order.find(i => isEnabled(entries[i])) ?? -1;
}

/** Typing letters jumps to the next enabled item that starts with them, after the current one */
export function typeAheadIndex(entries: MenuEntry[], from: number, typed: string): number {
  const text = typed.toLowerCase();
  if (!text) return -1;
  const count = entries.length;
  for (let n = 1; n <= count; n++) {
    const i = (Math.max(from, -1) + n) % count;
    const entry = entries[i];
    if (isEnabled(entry) && entry.label.toLowerCase().startsWith(text)) return i;
  }
  return -1;
}

/** The Menu key and Shift+F10 open the menu where the focus is */
export function isMenuKey(e: { key: string; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): boolean {
  if (e.key === 'ContextMenu') return true;
  return e.key === 'F10' && !!e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey;
}

/** The modifier in the way the platform names it, for the hints on the right of an item */
export function modifier(isMac: boolean): string {
  return isMac ? '⌘' : 'Ctrl+';
}
