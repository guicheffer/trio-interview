import { describe, expect, test, vi } from 'vitest';
import type { MenuEntry, MenuItem } from '../contextMenu';
import { HIDDEN_FILE_REASON, NO_PREVIEW_REASON, ONLY_TAB_REASON, PREVIEW_TAB, tabMenuEntries, type TabMenuState } from '../tabMenu';

const handlers = () => ({ close: vi.fn(), closeOthers: vi.fn(), closeAll: vi.fn(), copyPath: vi.fn(), revealInTree: vi.fn(), reloadPreview: vi.fn(), openPreviewInNewTab: vi.fn() });
const state = (over: Partial<TabMenuState> = {}): TabMenuState => ({ tab: 'a.ts', tabs: [PREVIEW_TAB, 'a.ts', 'b.ts'], hasPreviewUrl: true, revealable: true, hidden: false, ...over });
const ids = (entries: MenuEntry[]) => entries.filter((e): e is MenuItem => !('separator' in e)).map(i => i.id);
const find = (entries: MenuEntry[], id: string) => entries.find((e): e is MenuItem => !('separator' in e) && e.id === id);

describe('tab menu', () => {
  test('a file tab closes, closes the others or all, copies its path and shows in the tree', () => {
    const h = handlers();
    const entries = tabMenuEntries(state(), h, '⌘');
    expect(ids(entries)).toEqual(['close', 'close-others', 'close-all', 'copy-path', 'reveal-in-tree']);
    find(entries, 'close-others')!.onSelect!();
    find(entries, 'copy-path')!.onSelect!();
    expect(h.closeOthers).toHaveBeenCalledWith('a.ts');
    expect(h.copyPath).toHaveBeenCalledWith('a.ts');
  });

  test('Close others is off when this is the only tab', () => {
    expect(find(tabMenuEntries(state({ tabs: ['a.ts'] }), handlers(), '⌘'), 'close-others')).toMatchObject({ disabled: true, reason: ONLY_TAB_REASON });
  });

  test('a file the person cannot see in the tree has no path to copy or reveal', () => {
    const entries = tabMenuEntries(state({ revealable: false }), handlers(), '⌘');
    expect(find(entries, 'copy-path')).toMatchObject({ disabled: true, reason: HIDDEN_FILE_REASON });
    expect(find(entries, 'reveal-in-tree')?.disabled).toBe(true);
  });

  test('the preview tab reloads and opens in a new tab, and has no path', () => {
    const entries = tabMenuEntries(state({ tab: PREVIEW_TAB }), handlers(), '⌘');
    expect(ids(entries)).toEqual(['reload-preview', 'open-preview', 'close', 'close-others', 'close-all']);
  });

  test('the preview actions are off while no app is running', () => {
    const entries = tabMenuEntries(state({ tab: PREVIEW_TAB, hasPreviewUrl: false }), handlers(), '⌘');
    expect(find(entries, 'reload-preview')).toMatchObject({ disabled: true, reason: NO_PREVIEW_REASON });
    expect(find(entries, 'open-preview')?.disabled).toBe(true);
  });
});
