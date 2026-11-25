import { SEPARATOR, cleanEntries, modifier, type MenuEntry, type MenuItem } from './contextMenu';

/**
 * Right-click menu of a terminal. The shell terminal also gets Clear. The assistant's terminal does not: it is a
 * program that draws its own screen, so the page only copies, pastes and selects there and never types for it.
 */
export interface TerminalMenuState {
  hasSelection: boolean;
  /** The shell terminal (Clear is offered) or the assistant's terminal (it is not) */
  kind: 'shell' | 'assistant';
  /** The socket to the terminal is open, so pasted text has somewhere to go */
  connected: boolean;
  isMac: boolean;
}

export interface TerminalMenuHandlers {
  copy(): void;
  paste(): void;
  selectAll(): void;
  clear(): void;
}

export const NOT_CONNECTED_REASON = 'The terminal is not connected';
export const NO_TEXT_SELECTED_REASON = 'Select some text first';

const item = (id: string, label: string, onSelect: () => void, extra: Partial<MenuItem> = {}): MenuItem => ({ id, label, onSelect, ...extra });
const guard = (entry: MenuItem, reason: string | null): MenuItem => (reason ? { ...entry, disabled: true, reason, onSelect: undefined } : entry);

export function terminalMenuEntries(state: TerminalMenuState, h: TerminalMenuHandlers): MenuEntry[] {
  // On a Mac Cmd+C copies and Ctrl+C stays the interrupt, so only Cmd hints are shown there; elsewhere Ctrl+C
  // copies only while text is selected, which the hint cannot say, so the hint is left off
  const copyHint = state.isMac ? `${modifier(true)}C` : undefined;
  const pasteHint = state.isMac ? `${modifier(true)}V` : undefined;
  return cleanEntries([
    guard(item('copy', 'Copy', h.copy, { shortcut: copyHint }), state.hasSelection ? null : NO_TEXT_SELECTED_REASON),
    guard(item('paste', 'Paste', h.paste, { shortcut: pasteHint }), state.connected ? null : NOT_CONNECTED_REASON),
    item('select-all', 'Select all', h.selectAll, { shortcut: state.isMac ? '⌘A' : undefined }),
    state.kind === 'shell' && SEPARATOR,
    state.kind === 'shell' && guard(item('clear', 'Clear', h.clear, { shortcut: 'Ctrl+L' }), state.connected ? null : NOT_CONNECTED_REASON),
  ]);
}
