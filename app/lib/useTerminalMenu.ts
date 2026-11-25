'use client';

import { useEffect, useRef } from 'react';
import { isMenuKey } from './contextMenu';
import { openContextMenu } from './contextMenuStore';
import { terminalMenuEntries, type TerminalMenuState } from './terminalMenu';

interface Options {
  /** The element xterm draws in */
  host: React.RefObject<HTMLElement | null>;
  /** The xterm instance, once it exists */
  getTerm: () => any;
  kind: TerminalMenuState['kind'];
  connected: boolean;
  /** Clears the shell terminal (the shell terminal only) */
  clear?: () => void;
  /** Runs again when the terminal is rebuilt, so the listeners are on the live element */
  deps?: unknown[];
}

/** Right click (and the Menu key, Shift+F10) in a terminal opens the page's menu instead of the browser's */
export function useTerminalMenu({ host, getTerm, kind, connected, clear, deps = [] }: Options) {
  const live = useRef({ kind, connected, clear, getTerm });
  live.current = { kind, connected, clear, getTerm };

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const open = (x: number, y: number, keyboard: boolean) => {
      const { kind: k, connected: up, clear: wipe, getTerm: term } = live.current;
      const t = term();
      if (!t) return;
      const entries = terminalMenuEntries({
        hasSelection: !!t.hasSelection(),
        kind: k,
        connected: up,
        isMac: navigator.platform.toLowerCase().includes('mac'),
      }, {
        copy: () => { const text = t.getSelection(); if (text) navigator.clipboard?.writeText(text).catch(() => {}); },
        // xterm's own paste, so a program that asked for bracketed paste gets it that way
        paste: () => { navigator.clipboard?.readText().then(text => { if (text) t.paste(text); }).catch(() => {}); },
        selectAll: () => t.selectAll(),
        clear: () => wipe?.(),
      });
      openContextMenu({ entries, x, y, keyboard, label: k === 'shell' ? 'Terminal' : 'Assistant terminal', returnFocus: el.querySelector<HTMLElement>('textarea.xterm-helper-textarea') });
    };
    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      open(e.clientX, e.clientY, false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (!isMenuKey(e)) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = el.getBoundingClientRect();
      open(rect.left + 12, rect.bottom - 12, true);
    };
    el.addEventListener('contextmenu', onContext, true);
    el.addEventListener('keydown', onKey, true);
    return () => {
      el.removeEventListener('contextmenu', onContext, true);
      el.removeEventListener('keydown', onKey, true);
    };
  }, [host, ...deps]);
}
