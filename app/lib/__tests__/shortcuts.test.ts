import { describe, expect, test } from 'vitest';
import { closeShortcut, globalShortcut, mergeOpenTabs } from '../shortcuts';

const key = (k: string, mods: Partial<{ shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }> = {}) => ({ key: k, shiftKey: false, metaKey: false, ctrlKey: false, ...mods });
const ctx = (over: Partial<{ inField: boolean; inMonaco: boolean; showShortcuts: boolean; hasPreview: boolean }> = {}) => ({ inField: false, inMonaco: false, showShortcuts: false, ...over });

describe('globalShortcut', () => {
  test('question mark toggles the shortcuts outside fields and the editor', () => {
    expect(globalShortcut(key('?'), ctx())).toBe('toggle-shortcuts');
    expect(globalShortcut(key('?', { shiftKey: true }), ctx())).toBe('toggle-shortcuts');
    expect(globalShortcut(key('?'), ctx({ inField: true }))).toBeNull();
    expect(globalShortcut(key('?'), ctx({ inMonaco: true }))).toBeNull();
    expect(globalShortcut(key('?', { metaKey: true }), ctx())).toBeNull();
  });

  test('cmd or ctrl enter runs the app, but not inside the editor', () => {
    expect(globalShortcut(key('Enter', { metaKey: true }), ctx())).toBe('run-app');
    expect(globalShortcut(key('Enter', { ctrlKey: true }), ctx())).toBe('run-app');
    expect(globalShortcut(key('Enter', { metaKey: true }), ctx({ inMonaco: true }))).toBeNull();
    expect(globalShortcut(key('Enter'), ctx())).toBeNull();
  });

  test('shift escape focuses the terminal, plain escape only closes an open modal', () => {
    expect(globalShortcut(key('Escape', { shiftKey: true }), ctx())).toBe('focus-terminal');
    expect(globalShortcut(key('Escape'), ctx({ showShortcuts: true }))).toBe('close-shortcuts');
    expect(globalShortcut(key('Escape'), ctx())).toBeNull();
  });
});

describe('reload preview', () => {
  test('ctrl r reloads the preview when there is one, also inside the editor', () => {
    expect(globalShortcut(key('r', { ctrlKey: true }), ctx({ hasPreview: true }))).toBe('reload-preview');
    expect(globalShortcut(key('R', { ctrlKey: true }), ctx({ hasPreview: true, inMonaco: true }))).toBe('reload-preview');
  });

  test('without a preview, in a field, or with Cmd, the key is left alone', () => {
    expect(globalShortcut(key('r', { ctrlKey: true }), ctx())).toBeNull();
    expect(globalShortcut(key('r', { ctrlKey: true }), ctx({ hasPreview: true, inField: true }))).toBeNull();
    expect(globalShortcut(key('r', { metaKey: true }), ctx({ hasPreview: true }))).toBeNull();
    expect(globalShortcut(key('r'), ctx({ hasPreview: true }))).toBeNull();
  });
});

describe('mergeOpenTabs', () => {
  test('keeps my tabs, adds new ones and keeps the preview first', () => {
    expect(mergeOpenTabs(['a.ts', 'b.ts'], ['b.ts', 'c.ts'], '__preview__')).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect(mergeOpenTabs(['a.ts'], ['__preview__'], '__preview__')).toEqual(['__preview__', 'a.ts']);
  });
});

describe('closeShortcut', () => {
  const focus = (where: 'inMonaco' | 'inTerminal' | 'inChat' | null) => ({ inMonaco: false, inTerminal: false, inChat: false, ...(where ? { [where]: true } : {}) });

  test('Ctrl, Cmd or Alt+W closes what has the focus', () => {
    expect(closeShortcut(key('w', { metaKey: true }), focus('inMonaco'))).toBe('editor');
    expect(closeShortcut(key('w', { ctrlKey: true }), focus('inTerminal'))).toBe('terminal');
    expect(closeShortcut({ ...key('w'), altKey: true }, focus('inChat'))).toBe('chat');
  });

  test('leaves other keys and other places alone', () => {
    expect(closeShortcut(key('w', { metaKey: true }), focus(null))).toBeNull();
    expect(closeShortcut(key('q', { metaKey: true }), focus('inMonaco'))).toBeNull();
    expect(closeShortcut(key('w', { metaKey: true, shiftKey: true }), focus('inMonaco'))).toBeNull();
    expect(closeShortcut(key('w'), focus('inMonaco'))).toBeNull();
  });
});
