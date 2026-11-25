import { isLockedPath } from '../../shared/locks';
import { SEPARATOR, cleanEntries, type MenuEntry, type MenuItem } from './contextMenu';

/**
 * The entries of the right-click menu in the file tree. The rules here mirror the ones the buttons of the tree and
 * the server already follow: a candidate cannot rename, move, create in or delete what `lockedFiles` names, and only
 * the interviewer can reveal or hide the files the exercise starts without.
 */

export type FileMenuTarget =
  | { kind: 'file'; path: string; name: string; hidden?: boolean }
  | { kind: 'directory'; path: string; name: string; hidden?: boolean }
  | { kind: 'root' };

export interface FileMenuHandlers {
  open(path: string): void;
  toggle(path: string): void;
  rename(path: string): void;
  remove(path: string): void;
  newFile(parent: string): void;
  newFolder(parent: string): void;
  duplicate(path: string): void;
  copy(text: string): void;
  setVisibility(action: 'reveal' | 'hide' | 'reveal-all' | 'hide-all', paths?: string[]): void;
  collapseAll(): void;
}

export interface FileMenuContext {
  isInterviewer: boolean;
  lockedFiles: Iterable<string>;
  /** Paths of every file and folder in the tree, to name a copy that does not collide */
  existingPaths: Set<string>;
  expanded: Set<string>;
  /** Files the exercise starts without (the interviewer only), and which of them are hidden right now */
  managed: string[];
  hiddenNow: string[];
  /** The folder holds something the candidate may not change */
  lockedInside?: boolean;
  handlers: FileMenuHandlers;
}

export const LOCKED_REASON = 'Read-only: part of the exercise';
export const HIDDEN_REASON = 'Hidden from the candidate: reveal it first';
export const BINARY_REASON = 'Only text files can be duplicated';
export const FOLDER_LOCKED_REASON = 'Holds read-only files of the exercise';

const BINARY = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'pdf', 'zip', 'gz', 'db', 'sqlite', 'sqlite3', 'woff', 'woff2', 'ttf', 'mp3', 'mp4']);

export const isBinaryName = (name: string): boolean => BINARY.has(name.split('.').pop()?.toLowerCase() ?? '');

const parentOf = (path: string): string => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const join = (parent: string, name: string): string => (parent ? `${parent}/${name}` : name);

/** "app.ts" becomes "app copy.ts", then "app copy 2.ts" when that is taken too */
export function duplicatePath(path: string, existing: Set<string>): string {
  const parent = parentOf(path);
  const name = path.slice(parent ? parent.length + 1 : 0);
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let candidate = join(parent, `${stem} copy${ext}`);
  for (let n = 2; existing.has(candidate); n++) candidate = join(parent, `${stem} copy ${n}${ext}`);
  return candidate;
}

function item(id: string, label: string, onSelect: () => void, extra: Partial<MenuItem> = {}): MenuItem {
  return { id, label, onSelect, ...extra };
}

/** Disabled with the reason, never hidden */
function guard(entry: MenuItem, reason: string | null): MenuItem {
  return reason ? { ...entry, disabled: true, reason, onSelect: undefined } : entry;
}

export function fileMenuEntries(target: FileMenuTarget, ctx: FileMenuContext): MenuEntry[] {
  const h = ctx.handlers;
  const lockedFor = (path: string) => !ctx.isInterviewer && isLockedPath(path, ctx.lockedFiles);

  if (target.kind === 'root') {
    const anyOpen = ctx.expanded.size > 0;
    return cleanEntries([
      item('new-file', 'New file', () => h.newFile('')),
      item('new-folder', 'New folder', () => h.newFolder('')),
      SEPARATOR,
      guard(item('collapse-all', 'Collapse all folders', h.collapseAll), anyOpen ? null : 'No folder is open'),
      ctx.isInterviewer && ctx.managed.length > 0 && (ctx.hiddenNow.length > 0
        ? item('reveal-all', 'Reveal all to the candidate', () => h.setVisibility('reveal-all'))
        : item('hide-all', 'Hide all from the candidate', () => h.setVisibility('hide-all'))),
    ]);
  }

  const { path, name } = target;
  const hidden = !!target.hidden;
  const locked = lockedFor(path);
  const copies: MenuEntry[] = [
    item('copy-path', 'Copy path', () => h.copy(path)),
    item('copy-name', 'Copy name', () => h.copy(name)),
  ];

  if (target.kind === 'directory') {
    const open = ctx.expanded.has(path);
    // The tree's own buttons create inside a folder with the same check as the server does for the new path
    const createReason = lockedFor(join(path, 'x')) || locked ? LOCKED_REASON : null;
    return cleanEntries([
      item('toggle', open ? 'Collapse' : 'Expand', () => h.toggle(path)),
      SEPARATOR,
      guard(item('new-file', 'New file inside', () => h.newFile(path)), createReason),
      guard(item('new-folder', 'New folder inside', () => h.newFolder(path)), createReason),
      SEPARATOR,
      guard(item('rename', 'Rename', () => h.rename(path)), locked ? LOCKED_REASON : hidden ? HIDDEN_REASON : null),
      guard(item('delete', 'Delete', () => h.remove(path), { danger: true }),
        locked ? LOCKED_REASON : ctx.lockedInside && !ctx.isInterviewer ? FOLDER_LOCKED_REASON : hidden ? HIDDEN_REASON : null),
      SEPARATOR,
      ...copies,
    ]);
  }

  const copyPath = duplicatePath(path, ctx.existingPaths);
  const duplicateReason = hidden ? HIDDEN_REASON : isBinaryName(name) ? BINARY_REASON : lockedFor(copyPath) ? LOCKED_REASON : null;
  const managed = ctx.managed.includes(path);
  return cleanEntries([
    item('open', 'Open', () => h.open(path)),
    SEPARATOR,
    guard(item('rename', 'Rename', () => h.rename(path)), locked ? LOCKED_REASON : hidden ? HIDDEN_REASON : null),
    guard(item('duplicate', 'Duplicate', () => h.duplicate(path)), duplicateReason),
    guard(item('delete', 'Delete', () => h.remove(path), { danger: true }), locked ? LOCKED_REASON : hidden ? HIDDEN_REASON : null),
    SEPARATOR,
    ...copies,
    ctx.isInterviewer && managed && SEPARATOR,
    ctx.isInterviewer && managed && (ctx.hiddenNow.includes(path)
      ? item('reveal', 'Reveal to the candidate', () => h.setVisibility('reveal', [path]))
      : item('hide', 'Hide from the candidate', () => h.setVisibility('hide', [path]))),
  ]);
}
