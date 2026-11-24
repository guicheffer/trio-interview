export type ShortcutAction = 'toggle-shortcuts' | 'run-app' | 'close-shortcuts' | 'focus-terminal' | 'reload-preview';

export interface KeyInfo {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}

export interface KeyContext {
  /** The key was pressed in an input or textarea */
  inField: boolean;
  /** The key was pressed inside the Monaco editor, which has keybindings of its own */
  inMonaco: boolean;
  showShortcuts: boolean;
  /** A preview is on screen, so Ctrl+R has something to reload */
  hasPreview?: boolean;
}

/** Which workspace shortcut, if any, a key press outside the editor stands for */
export function globalShortcut(e: KeyInfo, ctx: KeyContext): ShortcutAction | null {
  if (ctx.inField) return null;
  // A question mark needs Shift on most layouts, so Shift cannot be ruled out
  if (e.key === '?' && !e.metaKey && !e.ctrlKey && !ctx.inMonaco) return 'toggle-shortcuts';
  // Plain Ctrl, not Cmd: Cmd+R stays the browser's own reload on a Mac. Not in fields, Ctrl+R is reverse search in the terminal
  if (ctx.hasPreview && e.ctrlKey && !e.metaKey && !e.shiftKey && e.key.toLowerCase() === 'r') return 'reload-preview';
  if (ctx.inMonaco) return null;
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) return 'run-app';
  if (e.key === 'Escape' && e.shiftKey) return 'focus-terminal';
  if (e.key === 'Escape' && ctx.showShortcuts) return 'close-shortcuts';
  return null;
}

/** With Follow off the interviewer keeps their own tabs and only gains the ones the candidate has open; the preview stays first */
export function mergeOpenTabs(previous: string[], incoming: string[], previewTab: string): string[] {
  const merged = [...previous, ...incoming.filter(tab => !previous.includes(tab))];
  return merged.includes(previewTab) ? [previewTab, ...merged.filter(tab => tab !== previewTab)] : merged;
}

export type CloseTarget = 'editor' | 'terminal' | 'chat';

/**
 * Ctrl or Cmd+W (and Alt+W, which browsers leave alone) closes the thing in focus instead of the browser tab: the open
 * file in the editor, the terminal, or the chat. Null when the key is something else or focus is elsewhere.
 */
export function closeShortcut(e: KeyInfo & { altKey?: boolean; code?: string }, focus: { inMonaco: boolean; inTerminal: boolean; inChat: boolean }): CloseTarget | null {
  const isW = e.code === 'KeyW' || e.key.toLowerCase() === 'w';
  const combo = ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) || (!!e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey);
  if (!isW || !combo) return null;
  if (focus.inMonaco) return 'editor';
  if (focus.inTerminal) return 'terminal';
  if (focus.inChat) return 'chat';
  return null;
}
