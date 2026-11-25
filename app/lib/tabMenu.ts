import { SEPARATOR, cleanEntries, type MenuEntry, type MenuItem } from './contextMenu';

/** Right-click menu of a tab above the editor: a file, or the preview */

export const PREVIEW_TAB = '__preview__';

export interface TabMenuState {
  tab: string;
  tabs: string[];
  /** The preview has an address to reload or open */
  hasPreviewUrl: boolean;
  /** The tab is a file the tree shows (not hidden from this person) */
  revealable: boolean;
  /** The files panel is open, or can be opened */
  hidden: boolean;
}

export interface TabMenuHandlers {
  close(path: string): void;
  closeOthers(path: string): void;
  closeAll(): void;
  copyPath(path: string): void;
  revealInTree(path: string): void;
  reloadPreview(): void;
  openPreviewInNewTab(): void;
}

export const NO_PREVIEW_REASON = 'The app is not running yet';
export const ONLY_TAB_REASON = 'This is the only tab';
export const HIDDEN_FILE_REASON = 'Hidden from the candidate';

const item = (id: string, label: string, onSelect: () => void, extra: Partial<MenuItem> = {}): MenuItem => ({ id, label, onSelect, ...extra });
const guard = (entry: MenuItem, reason: string | null): MenuItem => (reason ? { ...entry, disabled: true, reason, onSelect: undefined } : entry);

export function tabMenuEntries(state: TabMenuState, h: TabMenuHandlers, mod: string): MenuEntry[] {
  const { tab, tabs } = state;
  const others = tabs.filter(t => t !== tab);
  const closes: MenuEntry[] = [
    item('close', 'Close', () => h.close(tab), { shortcut: `${mod}W` }),
    guard(item('close-others', 'Close others', () => h.closeOthers(tab)), others.length > 0 ? null : ONLY_TAB_REASON),
    item('close-all', 'Close all', h.closeAll),
  ];
  if (tab === PREVIEW_TAB) {
    return cleanEntries([
      guard(item('reload-preview', 'Reload', h.reloadPreview, { shortcut: 'Ctrl+R' }), state.hasPreviewUrl ? null : NO_PREVIEW_REASON),
      guard(item('open-preview', 'Open in a new browser tab', h.openPreviewInNewTab), state.hasPreviewUrl ? null : NO_PREVIEW_REASON),
      SEPARATOR,
      ...closes,
    ]);
  }
  return cleanEntries([
    ...closes,
    SEPARATOR,
    guard(item('copy-path', 'Copy path', () => h.copyPath(tab)), state.revealable ? null : HIDDEN_FILE_REASON),
    guard(item('reveal-in-tree', 'Reveal in the file tree', () => h.revealInTree(tab)), state.revealable ? null : HIDDEN_FILE_REASON),
  ]);
}
