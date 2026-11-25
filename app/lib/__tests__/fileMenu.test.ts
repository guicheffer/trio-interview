import { describe, expect, test, vi } from 'vitest';
import type { MenuEntry, MenuItem } from '../contextMenu';
import {
  FOLDER_LOCKED_REASON, HIDDEN_REASON, LOCKED_REASON, duplicatePath, fileMenuEntries, type FileMenuContext, type FileMenuHandlers, type FileMenuTarget,
} from '../fileMenu';

const handlers = (): FileMenuHandlers => ({
  open: vi.fn(), toggle: vi.fn(), rename: vi.fn(), remove: vi.fn(), newFile: vi.fn(), newFolder: vi.fn(),
  duplicate: vi.fn(), copy: vi.fn(), setVisibility: vi.fn(), collapseAll: vi.fn(),
});

const ctx = (over: Partial<FileMenuContext> = {}): FileMenuContext => ({
  isInterviewer: false,
  lockedFiles: ['description.md', 'phases/'],
  existingPaths: new Set(['description.md', 'src', 'src/app.ts', 'phases', 'phases/phase-1.md']),
  expanded: new Set(),
  managed: [],
  hiddenNow: [],
  handlers: handlers(),
  ...over,
});

const items = (entries: MenuEntry[]): MenuItem[] => entries.filter((e): e is MenuItem => !('separator' in e));
const find = (entries: MenuEntry[], id: string): MenuItem | undefined => items(entries).find(i => i.id === id);
const file = (path: string, hidden = false): FileMenuTarget => ({ kind: 'file', path, name: path.split('/').pop()!, hidden });
const dir = (path: string): FileMenuTarget => ({ kind: 'directory', path, name: path.split('/').pop()! });

describe('file menu: a file', () => {
  test('an ordinary file has every action enabled for a candidate, and no visibility entry', () => {
    const entries = fileMenuEntries(file('src/app.ts'), ctx());
    expect(items(entries).map(i => i.id)).toEqual(['open', 'rename', 'duplicate', 'delete', 'copy-path', 'copy-name']);
    expect(items(entries).every(i => !i.disabled)).toBe(true);
  });

  test('a locked file cannot be renamed or deleted by a candidate, and says why', () => {
    const entries = fileMenuEntries(file('description.md'), ctx());
    for (const id of ['rename', 'delete']) expect(find(entries, id)).toMatchObject({ disabled: true, reason: LOCKED_REASON });
    expect(find(entries, 'rename')?.onSelect).toBeUndefined();
    // Reading it stays possible
    expect(find(entries, 'open')?.disabled).toBeFalsy();
    expect(find(entries, 'copy-path')?.disabled).toBeFalsy();
  });

  test('a file inside a locked folder is locked too', () => {
    const entries = fileMenuEntries(file('phases/phase-1.md'), ctx());
    expect(find(entries, 'delete')?.disabled).toBe(true);
    expect(find(entries, 'duplicate')).toMatchObject({ disabled: true, reason: LOCKED_REASON });
  });

  test('the interviewer may change locked files', () => {
    const entries = fileMenuEntries(file('description.md'), ctx({ isInterviewer: true }));
    expect(find(entries, 'rename')?.disabled).toBeFalsy();
    expect(find(entries, 'delete')?.disabled).toBeFalsy();
  });

  test('a hidden file cannot be renamed, duplicated or deleted until it is revealed', () => {
    const entries = fileMenuEntries(file('phases/phase-2.md', true), ctx({ isInterviewer: true, managed: ['phases/phase-2.md'], hiddenNow: ['phases/phase-2.md'] }));
    for (const id of ['rename', 'duplicate', 'delete']) expect(find(entries, id)).toMatchObject({ disabled: true, reason: HIDDEN_REASON });
    expect(find(entries, 'open')?.disabled).toBeFalsy();
  });

  test('a binary file is not duplicated', () => {
    expect(find(fileMenuEntries(file('logo.png'), ctx()), 'duplicate')?.disabled).toBe(true);
  });

  test('copy path gives the project relative path and copy name only the name', () => {
    const c = ctx();
    const entries = fileMenuEntries(file('src/app.ts'), c);
    find(entries, 'copy-path')!.onSelect!();
    find(entries, 'copy-name')!.onSelect!();
    expect(c.handlers.copy).toHaveBeenNthCalledWith(1, 'src/app.ts');
    expect(c.handlers.copy).toHaveBeenNthCalledWith(2, 'app.ts');
  });

  test('actions call the real handlers with the path', () => {
    const c = ctx();
    const entries = fileMenuEntries(file('src/app.ts'), c);
    for (const [id, fn] of [['open', c.handlers.open], ['rename', c.handlers.rename], ['duplicate', c.handlers.duplicate], ['delete', c.handlers.remove]] as const) {
      find(entries, id)!.onSelect!();
      expect(fn).toHaveBeenCalledWith('src/app.ts');
    }
  });
});

describe('file menu: reveal and hide', () => {
  const managed = ['phases/phase-2.md'];

  test('only the interviewer gets the entry, and only on a file the exercise manages', () => {
    expect(find(fileMenuEntries(file('phases/phase-2.md'), ctx({ managed })), 'reveal')).toBeUndefined();
    expect(find(fileMenuEntries(file('phases/phase-2.md'), ctx({ managed })), 'hide')).toBeUndefined();
    expect(find(fileMenuEntries(file('src/app.ts'), ctx({ isInterviewer: true, managed })), 'hide')).toBeUndefined();
  });

  test('a hidden file offers Reveal, a revealed one offers Hide, with the same call as the button', () => {
    const c1 = ctx({ isInterviewer: true, managed, hiddenNow: managed });
    find(fileMenuEntries(file('phases/phase-2.md', true), c1), 'reveal')!.onSelect!();
    expect(c1.handlers.setVisibility).toHaveBeenCalledWith('reveal', ['phases/phase-2.md']);

    const c2 = ctx({ isInterviewer: true, managed, hiddenNow: [] });
    const entries = fileMenuEntries(file('phases/phase-2.md'), c2);
    expect(find(entries, 'reveal')).toBeUndefined();
    find(entries, 'hide')!.onSelect!();
    expect(c2.handlers.setVisibility).toHaveBeenCalledWith('hide', ['phases/phase-2.md']);
  });
});

describe('file menu: a folder', () => {
  test('expands a closed folder and collapses an open one', () => {
    expect(find(fileMenuEntries(dir('src'), ctx()), 'toggle')?.label).toBe('Expand');
    expect(find(fileMenuEntries(dir('src'), ctx({ expanded: new Set(['src']) })), 'toggle')?.label).toBe('Collapse');
  });

  test('creates inside an ordinary folder and passes the folder as parent', () => {
    const c = ctx();
    const entries = fileMenuEntries(dir('src'), c);
    find(entries, 'new-file')!.onSelect!();
    find(entries, 'new-folder')!.onSelect!();
    expect(c.handlers.newFile).toHaveBeenCalledWith('src');
    expect(c.handlers.newFolder).toHaveBeenCalledWith('src');
  });

  test('a candidate cannot create in, rename or delete a locked folder', () => {
    const entries = fileMenuEntries(dir('phases'), ctx());
    for (const id of ['new-file', 'new-folder', 'rename', 'delete']) expect(find(entries, id)).toMatchObject({ disabled: true, reason: LOCKED_REASON });
    expect(find(entries, 'toggle')?.disabled).toBeFalsy();
  });

  test('a candidate cannot delete a folder that holds locked files, but can still rename it as the server allows', () => {
    const entries = fileMenuEntries(dir('src'), ctx({ lockedInside: true }));
    expect(find(entries, 'delete')).toMatchObject({ disabled: true, reason: FOLDER_LOCKED_REASON });
    expect(find(entries, 'rename')?.disabled).toBeFalsy();
  });

  test('the interviewer may delete a folder with locked files', () => {
    expect(find(fileMenuEntries(dir('src'), ctx({ isInterviewer: true, lockedInside: true })), 'delete')?.disabled).toBeFalsy();
  });

  test('a folder has no duplicate and no reveal entry', () => {
    const ids = items(fileMenuEntries(dir('src'), ctx({ isInterviewer: true }))).map(i => i.id);
    expect(ids).not.toContain('duplicate');
    expect(ids).not.toContain('reveal');
  });
});

describe('file menu: empty space', () => {
  test('offers new file and new folder at the top level', () => {
    const c = ctx();
    const entries = fileMenuEntries({ kind: 'root' }, c);
    find(entries, 'new-file')!.onSelect!();
    find(entries, 'new-folder')!.onSelect!();
    expect(c.handlers.newFile).toHaveBeenCalledWith('');
    expect(c.handlers.newFolder).toHaveBeenCalledWith('');
  });

  test('collapse all is disabled with a reason when no folder is open', () => {
    expect(find(fileMenuEntries({ kind: 'root' }, ctx()), 'collapse-all')).toMatchObject({ disabled: true, reason: 'No folder is open' });
    expect(find(fileMenuEntries({ kind: 'root' }, ctx({ expanded: new Set(['src']) })), 'collapse-all')?.disabled).toBeFalsy();
  });

  test('reveal all and hide all are for the interviewer only, and swap like the banner does', () => {
    const managed = ['a.md', 'b.md'];
    expect(find(fileMenuEntries({ kind: 'root' }, ctx({ managed, hiddenNow: managed })), 'reveal-all')).toBeUndefined();
    expect(find(fileMenuEntries({ kind: 'root' }, ctx({ isInterviewer: true, managed, hiddenNow: managed })), 'reveal-all')).toBeDefined();
    expect(find(fileMenuEntries({ kind: 'root' }, ctx({ isInterviewer: true, managed, hiddenNow: [] })), 'hide-all')).toBeDefined();
    expect(find(fileMenuEntries({ kind: 'root' }, ctx({ isInterviewer: true, managed: [] })), 'hide-all')).toBeUndefined();
  });
});

describe('duplicatePath', () => {
  test('puts "copy" before the extension, in the same folder', () => {
    expect(duplicatePath('src/app.ts', new Set())).toBe('src/app copy.ts');
    expect(duplicatePath('README', new Set())).toBe('README copy');
    expect(duplicatePath('.env', new Set())).toBe('.env copy');
  });

  test('numbers the copy when the name is taken', () => {
    expect(duplicatePath('app.ts', new Set(['app copy.ts']))).toBe('app copy 2.ts');
    expect(duplicatePath('app.ts', new Set(['app copy.ts', 'app copy 2.ts']))).toBe('app copy 3.ts');
  });
});
