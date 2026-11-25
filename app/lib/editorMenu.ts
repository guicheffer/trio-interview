import { SEPARATOR, cleanEntries, modifier, type MenuEntry, type MenuItem } from './contextMenu';

/**
 * The entries of the right-click menu in the code editor. While the agent writes (`aiLocked`) or the file is read
 * only, the editor takes no edits, so Cut, Paste and Format are shown disabled with the reason.
 */

export interface EditorMenuState {
  hasSelection: boolean;
  /** The exercise is read only for this person */
  readOnly: boolean;
  /** The agent is writing files */
  aiLocked: boolean;
  /** The editor can format this language */
  canFormat: boolean;
  /** The command that runs this file, when the file is one the Run button covers */
  runCommand: string | null;
  /** Whether the chat box exists on this screen (not when a terminal assistant is in use) */
  chatAvailable: boolean;
  isMac: boolean;
}

export interface EditorMenuHandlers {
  cut(): void;
  copy(): void;
  paste(): void;
  selectAll(): void;
  gotoLine(): void;
  find(): void;
  format(): void;
  run(): void;
  ask(): void;
}

export const AGENT_WRITING_REASON = 'The agent is writing, try again in a moment';
export const READ_ONLY_REASON = 'Read-only: part of the exercise';
export const NO_SELECTION_REASON = 'Select some text first';
export const NO_CHAT_REASON = 'The chat is not in use, a terminal assistant is';
export const CANNOT_FORMAT_REASON = 'This kind of file has no formatter';

const item = (id: string, label: string, onSelect: () => void, extra: Partial<MenuItem> = {}): MenuItem => ({ id, label, onSelect, ...extra });
const guard = (entry: MenuItem, reason: string | null): MenuItem => (reason ? { ...entry, disabled: true, reason, onSelect: undefined } : entry);

export function editorMenuEntries(state: EditorMenuState, h: EditorMenuHandlers): MenuEntry[] {
  const m = modifier(state.isMac);
  const editReason = state.aiLocked ? AGENT_WRITING_REASON : state.readOnly ? READ_ONLY_REASON : null;
  const selectionReason = state.hasSelection ? null : NO_SELECTION_REASON;
  return cleanEntries([
    guard(item('cut', 'Cut', h.cut, { shortcut: `${m}X` }), editReason ?? selectionReason),
    guard(item('copy', 'Copy', h.copy, { shortcut: `${m}C` }), selectionReason),
    guard(item('paste', 'Paste', h.paste, { shortcut: `${m}V` }), editReason),
    item('select-all', 'Select all', h.selectAll, { shortcut: `${m}A` }),
    SEPARATOR,
    item('find', 'Find', h.find, { shortcut: `${m}F` }),
    item('goto-line', 'Go to line', h.gotoLine, { shortcut: state.isMac ? '⌃G' : 'Ctrl+G' }),
    guard(item('format', 'Format document', h.format, { shortcut: state.isMac ? '⇧⌥F' : 'Shift+Alt+F' }), editReason ?? (state.canFormat ? null : CANNOT_FORMAT_REASON)),
    SEPARATOR,
    !!state.runCommand && item('run', 'Run this file', h.run),
    guard(
      item('ask', state.hasSelection ? 'Ask the assistant about this selection' : 'Ask the assistant about this line', h.ask),
      state.chatAvailable ? null : NO_CHAT_REASON,
    ),
  ]);
}

/** The text that goes into the chat box as a draft (never sent): the selection with where it is, or just the place */
export function askDraft(file: string, selection: { text: string; startLine: number; endLine: number } | null, line: number): string {
  if (!selection || !selection.text.trim()) return `${file}:${line} `;
  const where = selection.startLine === selection.endLine ? `${file}:${selection.startLine}` : `${file}:${selection.startLine}-${selection.endLine}`;
  const fence = selection.text.includes('```') ? '````' : '```';
  return `${where}\n${fence}\n${selection.text}\n${fence}\n`;
}
