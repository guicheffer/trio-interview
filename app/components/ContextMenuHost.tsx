'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  edgeIndex, isEnabled, isSeparator, placeMenu, stepIndex, typeAheadIndex, type MenuItem,
} from '../lib/contextMenu';
import { closeContextMenu, currentMenu, subscribeMenu } from '../lib/contextMenuStore';

/**
 * Draws the one open context menu (see `contextMenuStore`). Mounted once in the page. It looks like the settings
 * menu in the header: same surface, border and text colours, in both themes.
 */
export function ContextMenuHost() {
  const menu = useSyncExternalStore(subscribeMenu, currentMenu, () => null);
  if (!menu || typeof document === 'undefined') return null;
  return createPortal(<OpenContextMenu key={`${menu.x}:${menu.y}:${menu.label}`} />, document.body);
}

function OpenContextMenu() {
  const menu = useSyncExternalStore(subscribeMenu, currentMenu, () => null)!;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [active, setActive] = useState(-1);
  const typed = useRef({ text: '', at: 0 });
  const { entries } = menu;

  // Measured after the first paint of the hidden menu, so it can flip before anyone sees it
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos(placeMenu({ x: menu.x, y: menu.y }, { width: rect.width, height: rect.height }, { width: window.innerWidth, height: window.innerHeight }));
  }, [menu]);

  // Focus waits for the menu to be placed: an element that is still hidden cannot take it
  useEffect(() => {
    if (!pos) return;
    ref.current?.focus({ preventScroll: true });
  }, [pos]);
  useEffect(() => {
    if (menu.keyboard) setActive(edgeIndex(entries, 'first'));
  }, [menu, entries]);

  useEffect(() => {
    const close = () => closeContextMenu();
    const outside = (e: Event) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const onContext = (e: MouseEvent) => {
      // Another right click opens its own menu through its handler; one on our own menu only stays quiet
      if (ref.current?.contains(e.target as Node)) e.preventDefault();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('contextmenu', onContext, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('contextmenu', onContext, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, []);

  // Whatever closes it, the focus goes back to where it was
  useEffect(() => () => {
    const back = menu.returnFocus;
    // Not when another menu replaced this one: it has the focus now
    if (back && document.contains(back)) setTimeout(() => { if (!currentMenu()) back.focus({ preventScroll: true }); }, 0);
  }, [menu]);

  const run = (item: MenuItem) => {
    if (item.disabled) return;
    closeContextMenu();
    // After the menu is gone, so an action that opens a dialog or moves the focus is not fighting it
    setTimeout(() => item.onSelect?.(), 0);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (e.key === 'Escape') { stop(); closeContextMenu(); return; }
    if (e.key === 'Tab') { stop(); closeContextMenu(); return; }
    if (e.key === 'ArrowDown') { stop(); setActive(stepIndex(entries, active, 1)); return; }
    if (e.key === 'ArrowUp') { stop(); setActive(stepIndex(entries, active, -1)); return; }
    if (e.key === 'Home') { stop(); setActive(edgeIndex(entries, 'first')); return; }
    if (e.key === 'End') { stop(); setActive(edgeIndex(entries, 'last')); return; }
    if (e.key === 'Enter' || e.key === ' ') {
      stop();
      const entry = entries[active];
      if (isEnabled(entry)) run(entry);
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      stop();
      const now = Date.now();
      typed.current = { text: now - typed.current.at < 700 ? typed.current.text + e.key : e.key, at: now };
      const next = typeAheadIndex(entries, typed.current.text.length > 1 ? active - 1 : active, typed.current.text);
      if (next >= 0) setActive(next);
    }
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={menu.label}
      tabIndex={-1}
      aria-activedescendant={active >= 0 ? `ctx-item-${active}` : undefined}
      onKeyDown={onKeyDown}
      data-testid="context-menu"
      className="min-w-[200px] max-w-[min(320px,calc(100vw-1rem))] rounded-xl border border-gray-200 bg-white py-1 shadow-xl outline-none dark:border-gray-700 dark:bg-gray-800"
      style={{ position: 'fixed', left: pos?.left ?? 0, top: pos?.top ?? 0, zIndex: 99999, visibility: pos ? 'visible' : 'hidden' }}
    >
      {entries.map((entry, i) => {
        if (isSeparator(entry)) return <div key={`sep-${i}`} role="separator" className="my-1 border-t border-gray-100 dark:border-gray-700" />;
        const color = entry.disabled
          ? 'cursor-not-allowed text-gray-400 dark:text-gray-500'
          : entry.danger
            ? 'text-red-600 dark:text-red-400'
            : 'text-gray-700 dark:text-gray-300';
        return (
          <div
            key={entry.id}
            id={`ctx-item-${i}`}
            role="menuitem"
            aria-disabled={entry.disabled || undefined}
            data-testid={`ctx-${entry.id}`}
            title={entry.disabled ? entry.reason : undefined}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(a => (a === i ? -1 : a))}
            onClick={() => run(entry)}
            className={`flex cursor-default items-center justify-between gap-6 px-4 py-1.5 text-sm ${color} ${i === active && !entry.disabled ? 'bg-gray-50 dark:bg-gray-700' : ''}`}
          >
            <span className="min-w-0">
              <span className="block truncate">{entry.label}</span>
              {entry.disabled && entry.reason && <span className="block text-[11px] leading-tight text-gray-400 dark:text-gray-500">{entry.reason}</span>}
            </span>
            {entry.shortcut && (
              <kbd className="flex-shrink-0 rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400">{entry.shortcut}</kbd>
            )}
          </div>
        );
      })}
    </div>
  );
}
