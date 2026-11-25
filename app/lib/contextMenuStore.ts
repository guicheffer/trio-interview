import type { MenuEntry } from './contextMenu';

/**
 * One menu at a time for the whole page. Opening another replaces it, and the menu itself is drawn by
 * `ContextMenuHost`. It is local to this screen: nothing here goes through kvSync or the presence socket.
 */
export interface OpenMenu {
  entries: MenuEntry[];
  x: number;
  y: number;
  label: string;
  /** Opened from the keyboard, so the first item is focused right away */
  keyboard: boolean;
  /** Where the focus goes back to when it closes */
  returnFocus: HTMLElement | null;
}

let current: OpenMenu | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach(fn => fn());

export function subscribeMenu(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export const currentMenu = (): OpenMenu | null => current;

export function openContextMenu(menu: Omit<OpenMenu, 'returnFocus' | 'keyboard'> & { returnFocus?: HTMLElement | null; keyboard?: boolean }): void {
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  current = {
    keyboard: false,
    returnFocus: menu.returnFocus ?? (active instanceof HTMLElement && active !== document.body ? active : null),
    ...menu,
  };
  emit();
}

export function closeContextMenu(): OpenMenu | null {
  const was = current;
  if (!was) return null;
  current = null;
  emit();
  return was;
}

/** A mouse or keyboard event on an element: where the menu opens */
export function pointOfEvent(e: { clientX: number; clientY: number; currentTarget: EventTarget | null }): { x: number; y: number; keyboard: boolean } {
  // The Menu key sends a contextmenu event with no pointer position
  if (e.clientX === 0 && e.clientY === 0 && e.currentTarget instanceof HTMLElement) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: rect.left + 8, y: rect.bottom - 2, keyboard: true };
  }
  return { x: e.clientX, y: e.clientY, keyboard: false };
}
