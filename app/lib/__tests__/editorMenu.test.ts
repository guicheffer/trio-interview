import { describe, expect, test, vi } from 'vitest';
import type { MenuEntry, MenuItem } from '../contextMenu';
import {
  AGENT_WRITING_REASON, CANNOT_FORMAT_REASON, NO_CHAT_REASON, NO_SELECTION_REASON, READ_ONLY_REASON, askDraft, editorMenuEntries,
  type EditorMenuHandlers, type EditorMenuState,
} from '../editorMenu';

const handlers = (): EditorMenuHandlers => ({
  cut: vi.fn(), copy: vi.fn(), paste: vi.fn(), selectAll: vi.fn(), gotoLine: vi.fn(), find: vi.fn(), format: vi.fn(), run: vi.fn(), ask: vi.fn(),
});
const state = (over: Partial<EditorMenuState> = {}): EditorMenuState => ({
  hasSelection: true, readOnly: false, aiLocked: false, canFormat: true, runCommand: 'node a.js', chatAvailable: true, isMac: true, ...over,
});
const find = (entries: MenuEntry[], id: string) => entries.find((e): e is MenuItem => !('separator' in e) && e.id === id);

describe('editor menu', () => {
  test('everything is enabled for an editable file with a selection', () => {
    const entries = editorMenuEntries(state(), handlers());
    expect(entries.filter((e): e is MenuItem => !('separator' in e)).every(i => !i.disabled)).toBe(true);
    expect(find(entries, 'run')).toBeDefined();
  });

  test('Cut, Paste and Format are off while the agent writes, with the reason; Copy and Find stay on', () => {
    const entries = editorMenuEntries(state({ aiLocked: true }), handlers());
    for (const id of ['cut', 'paste', 'format']) expect(find(entries, id)).toMatchObject({ disabled: true, reason: AGENT_WRITING_REASON });
    expect(find(entries, 'copy')?.disabled).toBeFalsy();
    expect(find(entries, 'find')?.disabled).toBeFalsy();
    expect(find(entries, 'select-all')?.disabled).toBeFalsy();
  });

  test('a read only file cannot be cut into, pasted into or formatted', () => {
    const entries = editorMenuEntries(state({ readOnly: true }), handlers());
    for (const id of ['cut', 'paste', 'format']) expect(find(entries, id)).toMatchObject({ disabled: true, reason: READ_ONLY_REASON });
    expect(find(entries, 'copy')?.disabled).toBeFalsy();
  });

  test('a disabled item has no action to run', () => {
    const h = handlers();
    const entries = editorMenuEntries(state({ aiLocked: true }), h);
    expect(find(entries, 'paste')?.onSelect).toBeUndefined();
  });

  test('without a selection Cut and Copy are off and the ask item talks about the line', () => {
    const entries = editorMenuEntries(state({ hasSelection: false }), handlers());
    expect(find(entries, 'cut')).toMatchObject({ disabled: true, reason: NO_SELECTION_REASON });
    expect(find(entries, 'copy')).toMatchObject({ disabled: true, reason: NO_SELECTION_REASON });
    expect(find(entries, 'ask')?.label).toBe('Ask the assistant about this line');
    expect(find(entries, 'paste')?.disabled).toBeFalsy();
  });

  test('Format is off for a language without a formatter', () => {
    expect(find(editorMenuEntries(state({ canFormat: false }), handlers()), 'format')).toMatchObject({ disabled: true, reason: CANNOT_FORMAT_REASON });
  });

  test('Run this file only shows for a file the Run button covers', () => {
    expect(find(editorMenuEntries(state({ runCommand: null }), handlers()), 'run')).toBeUndefined();
  });

  test('Ask the assistant is off, with a reason, when a terminal assistant is in use', () => {
    expect(find(editorMenuEntries(state({ chatAvailable: false }), handlers()), 'ask')).toMatchObject({ disabled: true, reason: NO_CHAT_REASON });
  });

  test('shortcut hints follow the platform', () => {
    expect(find(editorMenuEntries(state({ isMac: true }), handlers()), 'copy')?.shortcut).toBe('⌘C');
    expect(find(editorMenuEntries(state({ isMac: false }), handlers()), 'copy')?.shortcut).toBe('Ctrl+C');
  });
});

describe('askDraft', () => {
  test('a selection goes in a code block with its lines', () => {
    expect(askDraft('src/a.ts', { text: 'let x = 1;', startLine: 4, endLine: 4 }, 4)).toBe('src/a.ts:4\n```\nlet x = 1;\n```\n');
    expect(askDraft('src/a.ts', { text: 'a\nb', startLine: 4, endLine: 5 }, 5)).toBe('src/a.ts:4-5\n```\na\nb\n```\n');
  });

  test('no selection gives only the place', () => {
    expect(askDraft('src/a.ts', null, 12)).toBe('src/a.ts:12 ');
    expect(askDraft('src/a.ts', { text: '  ', startLine: 3, endLine: 3 }, 3)).toBe('src/a.ts:3 ');
  });

  test('a selection that holds a code fence gets a longer fence', () => {
    expect(askDraft('a.md', { text: '```js\nx\n```', startLine: 1, endLine: 3 }, 3)).toContain('````\n```js');
  });
});
