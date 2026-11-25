import { describe, expect, test, vi } from 'vitest';
import type { MenuEntry, MenuItem } from '../contextMenu';
import { NOT_CONNECTED_REASON, NO_TEXT_SELECTED_REASON, terminalMenuEntries, type TerminalMenuState } from '../terminalMenu';

const handlers = () => ({ copy: vi.fn(), paste: vi.fn(), selectAll: vi.fn(), clear: vi.fn() });
const state = (over: Partial<TerminalMenuState> = {}): TerminalMenuState => ({ hasSelection: true, kind: 'shell', connected: true, isMac: true, ...over });
const ids = (entries: MenuEntry[]) => entries.filter((e): e is MenuItem => !('separator' in e)).map(i => i.id);
const find = (entries: MenuEntry[], id: string) => entries.find((e): e is MenuItem => !('separator' in e) && e.id === id);

describe('terminal menu', () => {
  test('the shell terminal offers Copy, Paste, Select all and Clear', () => {
    expect(ids(terminalMenuEntries(state(), handlers()))).toEqual(['copy', 'paste', 'select-all', 'clear']);
  });

  test('the assistant terminal never offers Clear, which would act on its program', () => {
    expect(ids(terminalMenuEntries(state({ kind: 'assistant' }), handlers()))).toEqual(['copy', 'paste', 'select-all']);
  });

  test('Copy needs a selection and says so', () => {
    expect(find(terminalMenuEntries(state({ hasSelection: false }), handlers()), 'copy')).toMatchObject({ disabled: true, reason: NO_TEXT_SELECTED_REASON });
  });

  test('Paste and Clear need the connection, so nothing is typed into a dead terminal', () => {
    const entries = terminalMenuEntries(state({ connected: false }), handlers());
    expect(find(entries, 'paste')).toMatchObject({ disabled: true, reason: NOT_CONNECTED_REASON });
    expect(find(entries, 'clear')).toMatchObject({ disabled: true, reason: NOT_CONNECTED_REASON });
    expect(find(entries, 'select-all')?.disabled).toBeFalsy();
  });

  test('off a Mac the copy hint is left out because Ctrl+C is also the interrupt', () => {
    const entries = terminalMenuEntries(state({ isMac: false }), handlers());
    expect(find(entries, 'copy')?.shortcut).toBeUndefined();
    expect(find(terminalMenuEntries(state({ isMac: true }), handlers()), 'copy')?.shortcut).toBe('⌘C');
  });
});
