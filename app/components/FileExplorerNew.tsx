'use client';

import { setHiddenFiles } from '../lib/hiddenFiles';
import { isLockedPath } from '../../shared/locks';
import { stopFollowing } from '../lib/follow';
import { useAction } from '../lib/actions';
import { useEffect, useRef, useState } from 'react';
import { useRemoteKey } from '../hooks/useRemoteKey';
import { CreateFileModal } from './CreateFileModal';
import { ConfirmDialog } from './ConfirmDialog';
import { isMenuKey } from '../lib/contextMenu';
import { openContextMenu, pointOfEvent } from '../lib/contextMenuStore';
import { duplicatePath, fileMenuEntries, type FileMenuTarget } from '../lib/fileMenu';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  /** Still hidden from the candidate (only the interviewer gets these) */
  hidden?: boolean;
}

interface FileExplorerNewProps {
  onFileSelect: (path: string) => void;
  /** Scopes the remembered open folders to a candidate and exercise */
  baseKey?: string;
  /** Lets the auto-open skip itself when a file was already restored */
  hasSelection?: () => boolean;
  selectedFile: string | null;
  /** Paths the AI changed that nobody opened yet */
  aiChangedFiles?: string[];
  /** A file or folder was moved by drag and drop */
  onFileMoved?: (from: string, to: string) => void;
  /** A file or folder was deleted from the tree, so its tabs can close */
  onFileDeleted?: (path: string) => void;
  onLockedFilesLoaded?: (files: Set<string>, exerciseId?: string) => void;
}

// Colored dot + icon mapping by extension
const EXT_COLORS: Record<string, string> = {
  ts: 'text-blue-500', tsx: 'text-blue-400',
  js: 'text-yellow-500', jsx: 'text-yellow-400',
  py: 'text-green-500',
  json: 'text-orange-400',
  md: 'text-teal-500',
  css: 'text-pink-500', scss: 'text-pink-400',
  html: 'text-red-400',
  sql: 'text-pink-500',
  go: 'text-cyan-500',
  rs: 'text-orange-500',
  sh: 'text-gray-400', bash: 'text-gray-400',
  yaml: 'text-yellow-600', yml: 'text-yellow-600',
};

function getExtColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_COLORS[ext] ?? 'text-gray-400 dark:text-gray-500';
}

function FileIcon({ name, selected }: { name: string; selected: boolean }) {
  const color = selected ? 'text-white' : getExtColor(name);
  return (
    <svg className={`w-4 h-4 flex-shrink-0 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  );
}

/** The exercise can name its own first file (defaultFile in exercise.json), else description.md, else EXERCISE.md */
function pickFirstFile(files: FileNode[], defaultFile?: string): FileNode | undefined {
  const named = defaultFile ? files.find(f => f.path === defaultFile && f.type !== 'directory') : undefined;
  return named ?? files.find(f => f.name === 'description.md') ?? files.find(f => f.name === 'EXERCISE.md');
}

const NEW_FILE_HIGHLIGHT_MS = 12000;

function rowStateClass(selected: boolean, justCreated: boolean): string {
  if (selected) return 'bg-accent-500 text-white dark:bg-accent-600';
  if (justCreated) return 'bg-emerald-100 ring-1 ring-emerald-400 dark:bg-emerald-900/40 animate-pulse';
  return 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-100';
}

function rowTitle(file: { path: string; type: string }, lockedFiles: Iterable<string>): string {
  if (isLockedPath(file.path, lockedFiles)) return 'Read-only (challenge instructions)';
  return file.type === 'directory' ? 'Click to expand/collapse' : 'Double-click to rename';
}

const AI_FOLDER_TITLE = 'The AI changed files in here. It edits and saves directly; open them to review.';
const AI_CHANGED_TITLE = 'Changed by the AI and already saved. Open the file to keep or undo its latest changes.';
const AI_TOUCHED_TITLE = 'The AI wrote to this file. It edits and saves directly; you can undo its latest changes when the file is open.';

export function FileExplorerNew({ onFileSelect, baseKey, hasSelection, selectedFile, aiChangedFiles, onFileMoved, onFileDeleted, onLockedFilesLoaded }: FileExplorerNewProps) {
  const dragPathRef = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const aiChanged = aiChangedFiles ?? [];
  const isAiChanged = (file: FileNode) => file.type === 'directory'
    ? aiChanged.some(f => f.startsWith(file.path + '/'))
    : aiChanged.includes(file.path);
  // Files the AI wrote to, and files that are not the way the exercise started (anyone's edits)
  const [status, setStatus] = useState<{ ai: string[]; changed: string[] }>({ ai: [], changed: [] });
  const [files, setFiles] = useState<FileNode[]>([]);
  // The refresh below runs from an interval made once, so it reads the current list from here
  const filesRef = useRef<FileNode[]>([]);
  filesRef.current = files;
  const [lockedFiles, setLockedFiles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    const load = () => {
      fetch('/api/files-status').then(r => (r.ok ? r.json() : null)).then(data => {
        if (live && data && Array.isArray(data.ai) && Array.isArray(data.changed)) setStatus({ ai: data.ai, changed: data.changed });
      }).catch(() => {});
    };
    load();
    const timer = setInterval(load, 6000);
    return () => { live = false; clearInterval(timer); };
  }, [aiChangedFiles]);
  const [error, setError] = useState<string | null>(null);
  const [hasAutoOpened, setHasAutoOpened] = useState(false);
  // The interviewer (on localhost, having chosen that role) can reveal or hide the files the exercise starts without
  const [isInterviewer, setIsInterviewer] = useState(false);
  const [visibility, setVisibility] = useState<{ managed: string[]; hidden: string[] }>({ managed: [], hidden: [] });
  const isInterviewerRef = useRef(false);
  useEffect(() => {
    // Localhost alone is not enough: someone who joined as a candidate on this machine must not get the interviewer's controls
    let chosen = false;
    try { chosen = localStorage.getItem('trio_cc_role') === 'interviewer'; } catch {}
    const local = chosen && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
    isInterviewerRef.current = local;
    setIsInterviewer(local);
    if (local) refreshVisibility();
  }, []);

  const refreshVisibility = async () => {
    try {
      const res = await fetch('/api/interviewer/visibility');
      if (res.ok) {
        const data = await res.json();
        setVisibility({ managed: data.managed ?? [], hidden: data.hidden ?? [] });
        setHiddenFiles(data.hidden ?? []);
      }
    } catch {}
  };

  const changeVisibility = async (action: 'reveal' | 'hide' | 'reveal-all' | 'hide-all', paths?: string[]) => {
    try {
      await fetch('/api/interviewer/visibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, paths }),
      });
    } catch {}
    await refreshVisibility();
  };
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // Folders collapsed by default, click to expand. The open ones are remembered and shared with the other screen.
  const expandedKey = baseKey ? `trio_cc_expanded_${baseKey}` : undefined;
  const readExpanded = (): Set<string> => {
    try {
      const raw = expandedKey ? localStorage.getItem(expandedKey) : null;
      const parsed = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch { return new Set(); }
  };
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => readExpanded());

  useEffect(() => { setExpandedDirs(readExpanded()); }, [expandedKey]);

  useRemoteKey(expandedKey, (value) => {
    try {
      const parsed = value ? JSON.parse(value) : [];
      if (Array.isArray(parsed)) setExpandedDirs(new Set(parsed));
    } catch {}
  });

  const persistExpanded = (dirs: Set<string>) => {
    if (!expandedKey) return;
    try { localStorage.setItem(expandedKey, JSON.stringify([...dirs].sort((a, b) => a.localeCompare(b)))); } catch {}
  };
  useEffect(() => { persistExpanded(expandedDirs); }, [expandedDirs]);

  // The folders that lead to the active file must be open, otherwise the tree does not match the editor
  useEffect(() => {
    if (!selectedFile || selectedFile.startsWith('__')) return;
    const parts = selectedFile.split('/');
    if (parts.length < 2) return;
    setExpandedDirs(prev => {
      const next = new Set(prev);
      let acc = '';
      for (const part of parts.slice(0, -1)) {
        acc = acc ? `${acc}/${part}` : part;
        next.add(acc);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [selectedFile]);
  // Modal for creating new files/folders (reliable alternative to ghost input)
  const [modal, setModal] = useState<{ type: 'file' | 'folder'; parentPath?: string } | null>(null);
  // Highlight newly created files
  const [newlyCreatedFiles, setNewlyCreatedFiles] = useState<Set<string>>(new Set());
  const toggleDir = (path: string) => setExpandedDirs(prev => {
    const next = new Set(prev);
    if (next.has(path)) next.delete(path); else next.add(path);
    return next;
  });
  // Ghost item: VS Code-style inline creation (no modal)
  const [ghost, setGhost] = useState<{ type: 'file' | 'folder'; parentPath: string } | null>(null);
  const [ghostName, setGhostName] = useState('');
  const ghostInputRef = useRef<HTMLInputElement>(null);
  const ghostJustMounted = useRef(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const newMenuRef = useRef<HTMLDivElement>(null);

  const moveTo = async (toDir: string) => {
    const from = dragPathRef.current;
    dragPathRef.current = null;
    setDropTarget(null);
    if (!from) return;
    const parent = from.includes('/') ? from.slice(0, from.lastIndexOf('/')) : '';
    if (parent === toDir) return;
    try {
      const res = await fetch('/api/files-move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, toDir }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateError(data.error || 'Could not move the file');
        setTimeout(() => setCreateError(null), 3000);
        return;
      }
      if (toDir) setExpandedDirs(prev => new Set([...prev, toDir]));
      onFileMoved?.(from, data.path);
      await loadFiles();
    } catch {
      setCreateError('Could not move the file');
      setTimeout(() => setCreateError(null), 3000);
    }
  };

  const loadFiles = async () => {
    try {
      const res = await fetch('/api/files');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const newFiles = data.files || [];

      // Detect newly created files by comparing paths
      if (filesRef.current.length > 0) {
        const oldPaths = new Set(filesRef.current.map((f: FileNode) => f.path));
        const newPaths = new Set(newFiles.map((f: FileNode) => f.path));

        const created = (Array.from(newPaths) as string[]).filter(p => !oldPaths.has(p));
        if (created.length > 0) {
          setNewlyCreatedFiles(prev => new Set([...prev, ...created]));
          // Open the folders that lead to a new file, so it can be seen
          setExpandedDirs(prev => {
            const next = new Set(prev);
            for (const path of created) {
              const parts = path.split('/').slice(0, -1);
              parts.forEach((_, i) => next.add(parts.slice(0, i + 1).join('/')));
            }
            return next.size === prev.size ? prev : next;
          });
          // The highlight stays a while, so a plan or file the agent just wrote is noticed
          setTimeout(() => {
            setNewlyCreatedFiles(prev => new Set([...prev].filter(p => !created.includes(p))));
          }, NEW_FILE_HIGHLIGHT_MS);
        }
      }

      setFiles(newFiles);
      setError(null);
      if (isInterviewerRef.current) refreshVisibility();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      const res0 = await fetch('/api/files');
      let data: { files?: FileNode[] } = {};
      if (res0.ok) {
        data = await res0.json();
        setFiles(data.files || []);
        setError(null);
      } else {
        setError(`HTTP ${res0.status}`);
      }
      setLoading(false);

      let defaultFile: string | undefined;
      try {
        const res = await fetch('/api/challenge-meta');
        if (res.ok) {
          const meta = await res.json();
          defaultFile = typeof meta.defaultFile === 'string' ? meta.defaultFile : undefined;
          setLockedFiles(new Set(meta.lockedFiles || []));
          onLockedFilesLoaded?.(new Set(meta.lockedFiles || []), meta.exerciseId);
        }
      } catch {}

      // Auto-open description.md or EXERCISE.md on first load (once per component mount)
      // Only if no file is already selected (fresh session)
      if (!hasAutoOpened && data.files && data.files.length > 0 && !selectedFile) {
        setHasAutoOpened(true);

        const descFile = pickFirstFile(data.files, defaultFile);

        // Open the main description file
        if (descFile) {
          // Small delay to ensure the file explorer and parent are fully ready
          setTimeout(() => {
            if (hasSelection?.()) return;
            console.log('[FileExplorer] Auto-opening:', descFile.path);
            onFileSelect(descFile.path);
          }, 300);
        } else {
          console.log('[FileExplorer] No description file found to auto-open');
        }
      }
    };
    init();
    const interval = setInterval(loadFiles, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (renamingPath) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renamingPath]);

  useEffect(() => {
    if (ghost) {
      setGhostName('');
      ghostJustMounted.current = true;
      setTimeout(() => { ghostJustMounted.current = false; }, 200);
    }
  }, [ghost]);

  const commitGhost = async () => {
    const name = ghostInputRef.current?.value.trim() ?? ghostName.trim();
    if (!name || !ghost) { setGhost(null); return; }
    const fullPath = ghost.parentPath ? `${ghost.parentPath}/${name}` : name;
    setGhost(null);
    setGhostName('');
    if (ghost.type === 'file') await commitNewFile(fullPath);
    else await commitNewFolder(fullPath);
  };

  useAction('files:new-file', () => setModal({ type: 'file', parentPath: '' }));
  useAction('files:new-folder', () => setModal({ type: 'folder', parentPath: '' }));
  // "Reveal in the file tree" from a tab: open the folders that lead to the file and bring its row into view
  useAction('files:reveal', (path: string) => {
    if (!path) return;
    const parts = path.split('/').slice(0, -1);
    setExpandedDirs(prev => {
      const next = new Set(prev);
      parts.forEach((_, i) => next.add(parts.slice(0, i + 1).join('/')));
      return next;
    });
    setTimeout(() => {
      const row = Array.from(document.querySelectorAll<HTMLElement>('[data-file-row]')).find(el => el.dataset.fileRow === path);
      row?.scrollIntoView({ block: 'nearest' });
      row?.focus();
    }, 60);
  });
  useAction('files:collapse-all', () => setExpandedDirs(new Set()));
  useAction('files:reveal-all', () => { void changeVisibility('reveal-all'); });
  useAction('files:hide-all', () => { void changeVisibility('hide-all'); });
  useAction('files:rename', () => {
    const f = files.find(x => x.path === selectedFile && x.type === 'file');
    if (f && !isLockedPath(f.path, lockedFiles)) startRename(f);
  });

  const openGhost = (type: 'file' | 'folder', parentPath = '') => {
    setShowNewMenu(false);
    setModal({ type, parentPath });
  };


  useEffect(() => {
    if (!showNewMenu) return;
    const close = (e: MouseEvent) => {
      // Don't close if clicking inside the menu
      if (newMenuRef.current?.contains(e.target as Node)) return;
      setShowNewMenu(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showNewMenu]);

  const startRename = (file: FileNode) => {
    setRenameValue(file.name);
    setRenamingPath(file.path);
  };

  const commitRename = async (oldPath: string, value: string) => {
    const newName = value.trim();
    setRenamingPath(null);
    setRenameValue('');
    if (!newName || newName === oldPath.split('/').pop()) return;
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(oldPath)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName }),
      });
      if (!res.ok) console.error('Rename failed:', await res.text());
      await loadFiles();
    } catch (err) {
      console.error('Rename error:', err);
    }
  };

  const commitNewFile = async (name: string) => {
    const trimmed = name.trim();
    
    
    setCreateError(null);
    if (!trimmed) return;
    try {
      const res = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: trimmed, content: '' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setCreateError(body.error || `Failed (${res.status})`);
        setTimeout(() => setCreateError(null), 4000);
        return;
      }
      await loadFiles();
      stopFollowing();
      onFileSelect(trimmed);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Network error');
      setTimeout(() => setCreateError(null), 4000);
    }
  };

  const showError = (text: string) => {
    setCreateError(text);
    setTimeout(() => setCreateError(null), 4000);
  };

  // Delete asks first, then calls the same server route for a file or a folder
  const [pendingDelete, setPendingDelete] = useState<FileNode | null>(null);
  const confirmDelete = async () => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(target.path)}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showError(body.error || `Could not delete ${target.name}`);
        return;
      }
      onFileDeleted?.(target.path);
      await loadFiles();
    } catch {
      showError(`Could not delete ${target.name}`);
    }
  };

  // A copy is a new file with the same text, made with the calls the tree already uses to read and create
  const duplicateFile = async (path: string) => {
    try {
      const read = await fetch(`/api/files/${encodeURIComponent(path)}`);
      if (!read.ok) { showError('Could not read the file to copy it'); return; }
      const { content } = await read.json();
      const copy = duplicatePath(path, new Set(filesRef.current.map(f => f.path)));
      const res = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: copy, content: content ?? '' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showError(body.error || 'Could not duplicate the file');
        return;
      }
      await loadFiles();
      stopFollowing();
      onFileSelect(copy);
    } catch {
      showError('Could not duplicate the file');
    }
  };

  const copyText = (text: string) => { navigator.clipboard?.writeText(text).catch(() => {}); };

  const openMenu = (target: FileMenuTarget, at: { x: number; y: number; keyboard: boolean }) => {
    const nodeFiles = filesRef.current;
    const lockedInside = target.kind === 'directory'
      && nodeFiles.some(f => f.path.startsWith(target.path + '/') && isLockedPath(f.path, lockedFiles));
    const entries = fileMenuEntries(target, {
      isInterviewer,
      lockedFiles,
      existingPaths: new Set(nodeFiles.map(f => f.path)),
      expanded: expandedDirs,
      managed: visibility.managed,
      hiddenNow: visibility.hidden,
      lockedInside,
      handlers: {
        open: (path) => { stopFollowing(); onFileSelect(path); },
        toggle: toggleDir,
        rename: (path) => { const n = nodeFiles.find(f => f.path === path); if (n) startRename(n); },
        remove: (path) => { const n = nodeFiles.find(f => f.path === path); if (n) setPendingDelete(n); },
        newFile: (parent) => { if (parent && !expandedDirs.has(parent)) toggleDir(parent); setModal({ type: 'file', parentPath: parent }); },
        newFolder: (parent) => { if (parent && !expandedDirs.has(parent)) toggleDir(parent); setModal({ type: 'folder', parentPath: parent }); },
        duplicate: (path) => { void duplicateFile(path); },
        copy: copyText,
        setVisibility: (action, paths) => { void changeVisibility(action, paths); },
        collapseAll: () => setExpandedDirs(new Set()),
      },
    });
    openContextMenu({ entries, x: at.x, y: at.y, keyboard: at.keyboard, label: target.kind === 'root' ? 'Files' : target.name });
  };

  const menuHandlers = (target: FileMenuTarget) => ({
    onContextMenu: (e: React.MouseEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      openMenu(target, pointOfEvent(e));
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (!isMenuKey(e)) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      openMenu(target, { x: rect.left + 8, y: rect.bottom - 2, keyboard: true });
    },
  });

  const commitNewFolder = async (name: string) => {
    const trimmed = name.trim();
    
    
    if (!trimmed) return;
    try {
      const res = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: trimmed + '/.gitkeep', content: '' }),
      });
      if (!res.ok) console.error('Create folder failed:', res.status, await res.text());
      await loadFiles();
    } catch (err) {
      console.error('Create folder error:', err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Challenge Files</h3>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowNewMenu(!showNewMenu)}
            title="New..."
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          {showNewMenu && (
            <div
              ref={newMenuRef}
              className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-10 py-1"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openGhost('file');
                }}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>New File</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openGhost('folder');
                }}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
              >
                <svg className="w-3.5 h-3.5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span>New Folder</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Create error feedback */}
      {createError && (
        <div className="px-3 py-1.5 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
          <p className="text-xs text-red-600 dark:text-red-400 truncate">{createError}</p>
        </div>
      )}

      {isInterviewer && visibility.managed.length > 0 && (
        <div className="mx-2 mt-2 flex items-center justify-between gap-2 rounded-lg border border-pink-200 bg-pink-50 px-2.5 py-1.5 text-[11px] text-pink-800 dark:border-pink-800 dark:bg-pink-900/20 dark:text-pink-200">
          <span>{visibility.hidden.length} of {visibility.managed.length} hidden from the candidate</span>
          <span className="flex gap-2 font-semibold">
            {visibility.hidden.length > 0
              ? <button onClick={() => changeVisibility('reveal-all')} className="hover:underline">Reveal all</button>
              : <button onClick={() => changeVisibility('hide-all')} className="hover:underline">Hide all</button>}
          </span>
        </div>
      )}

      {/* File list */}
      <div
        className={`flex-1 overflow-y-auto ${dropTarget === '' ? 'bg-blue-50/40 dark:bg-blue-900/10' : ''}`}
        onDragOver={(e) => { if (dragPathRef.current) { e.preventDefault(); setDropTarget(''); } }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDropTarget(null); }}
        onDrop={(e) => { e.preventDefault(); void moveTo(''); }}
        {...menuHandlers({ kind: 'root' })}
        tabIndex={-1}
        aria-label="Files"
      >
        {loading && (
          <div className="flex items-center justify-center h-full">
            <span className="text-sm text-gray-500 dark:text-gray-400">Loading...</span>
          </div>
        )}
        {!loading && error && (
          <div className="p-4 text-center">
            <p className="text-sm text-red-500 mb-1">Backend not connected</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{error}</p>
          </div>
        )}
        {!loading && !error && (
          <ul className="p-2 space-y-0.5">
            {files.length === 0 && !ghost && (
              <li className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                No files found
              </li>
            )}

            {/* Ghost item: VS Code-style inline creation */}
            {ghost && (
              <li style={{ paddingLeft: `${(ghost.parentPath ? ghost.parentPath.split('/').length : 0) * 12}px` }}>
                <div className="flex items-center gap-1 px-2 py-1">
                  {ghost.type === 'folder' ? <FolderIcon /> : <FileIcon name={ghostName || (ghost.type === 'file' ? 'new.ts' : 'folder')} selected={false} />}
                  <input
                    ref={ghostInputRef}
                    autoFocus
                    defaultValue=""
                    onChange={(e) => setGhostName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); commitGhost(); }
                      if (e.key === 'Escape') { setGhost(null); setGhostName(''); }
                    }}
                    onBlur={() => {
                      if (ghostJustMounted.current) return;
                      commitGhost();
                    }}
                    placeholder={ghost.type === 'file' ? 'filename.ts' : 'folder-name'}
                    className="flex-1 min-w-0 text-sm font-mono bg-white dark:bg-gray-800 border border-accent-500 rounded px-1.5 py-0.5 text-gray-900 dark:text-gray-100 focus:outline-none"
                  />
                </div>
              </li>
            )}

            {files.map((file) => {
              const depth = file.path.split('/').length - 1;
              // Hide files whose parent directory is collapsed
              if (depth > 0) {
                const parentPath = file.path.split('/').slice(0, -1).join('/');
                if (!expandedDirs.has(parentPath)) return null;
              }
              return (
              <li key={file.path} className="group" style={{ paddingLeft: `${depth * 12}px` }}>
                {renamingPath === file.path ? (
                  <div className="flex items-center space-x-2 px-2 py-1">
                    <FileIcon name={file.name} selected={false} />
                    <input
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); commitRename(file.path, renameValue); }
                        if (e.key === 'Escape') { setRenamingPath(null); setRenameValue(''); }
                      }}
                      onBlur={() => commitRename(file.path, renameValue)}
                      className="flex-1 min-w-0 text-sm font-mono bg-white dark:bg-gray-800 border border-accent-500 rounded px-1.5 py-0.5 text-gray-900 dark:text-gray-100 focus:outline-none"
                    />
                  </div>
                ) : (
                  <div
                    draggable={!isLockedPath(file.path, lockedFiles) && !file.hidden}
                    onDragStart={(e) => { dragPathRef.current = file.path; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', file.path); }}
                    onDragEnd={() => { dragPathRef.current = null; setDropTarget(null); }}
                    onDragOver={(e) => {
                      if (file.type !== 'directory' || !dragPathRef.current) return;
                      const from = dragPathRef.current;
                      if (from === file.path || file.path.startsWith(from + '/')) return;
                      e.preventDefault(); e.stopPropagation(); setDropTarget(file.path);
                    }}
                    onDrop={(e) => { if (file.type === 'directory') { e.preventDefault(); e.stopPropagation(); void moveTo(file.path); } }}
                    className={`flex items-center rounded text-sm transition-colors ${dropTarget === file.path ? 'ring-2 ring-blue-400 ' : ''}${rowStateClass(selectedFile === file.path, newlyCreatedFiles.has(file.path))}`}>
                    <button
                      onClick={() => {
                        if (file.type === 'directory') toggleDir(file.path);
                        else { stopFollowing(); onFileSelect(file.path); }
                      }}
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        if (file.type === 'file' && !isLockedPath(file.path, lockedFiles)) startRename(file);
                      }}
                      title={rowTitle(file, lockedFiles)}
                      data-file-row={file.path}
                      {...menuHandlers(file.type === 'directory'
                        ? { kind: 'directory', path: file.path, name: file.name, hidden: file.hidden }
                        : { kind: 'file', path: file.path, name: file.name, hidden: file.hidden })}
                      className="flex-1 text-left px-3 py-2 flex items-center space-x-2 min-w-0"
                    >
                      {file.type === 'directory' ? (
                        <div className="flex items-center gap-1">
                          <svg viewBox="0 0 24 24" fill="none" className={`w-3 h-3 flex-shrink-0 text-gray-400 transition-transform ${expandedDirs.has(file.path) ? 'rotate-90' : ''}`} stroke="currentColor" strokeWidth="2">
                            <polyline points="9 18 15 12 9 6"/>
                          </svg>
                          <FolderIcon />
                        </div>
                      ) : (
                        <FileIcon name={file.name} selected={selectedFile === file.path} />
                      )}
                      <span className={`font-mono truncate text-sm ${file.hidden ? 'italic opacity-60' : ''}`}>{file.name}</span>
                      {isAiChanged(file) && (
                        <span
                          className="flex-shrink-0 text-amber-500"
                          title={file.type === 'directory' ? AI_FOLDER_TITLE : AI_CHANGED_TITLE}
                          data-testid="ai-changed"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.9 5.6L19.5 9l-5.6 1.9L12 16.5l-1.9-5.6L4.5 9l5.6-1.4L12 2zm7 11l.9 2.6L22.5 16.5l-2.6.9L19 20l-.9-2.6-2.6-.9 2.6-.9L19 13z"/></svg>
                        </span>
                      )}
                      {file.type === 'file' && !isAiChanged(file) && status.ai.includes(file.path) && (
                        <span className="flex-shrink-0 text-gray-400 dark:text-gray-500" title={AI_TOUCHED_TITLE} data-testid="ai-touched">
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.9 5.6L19.5 9l-5.6 1.9L12 16.5l-1.9-5.6L4.5 9l5.6-1.4L12 2zm7 11l.9 2.6L22.5 16.5l-2.6.9L19 20l-.9-2.6-2.6-.9 2.6-.9L19 13z"/></svg>
                        </span>
                      )}
                      {file.type === 'file' && status.changed.includes(file.path) && (
                        <span className="flex-shrink-0 text-sky-500" title="Changed since the exercise started" data-testid="file-edited">
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                        </span>
                      )}
                      {file.hidden && (
                        <span className="flex-shrink-0 rounded bg-pink-100 px-1.5 py-0.5 text-[10px] font-semibold text-pink-700 dark:bg-pink-900/40 dark:text-pink-300">hidden</span>
                      )}
                      {isLockedPath(file.path, lockedFiles) && (
                        <svg className="w-3 h-3 text-amber-500 flex-shrink-0 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      )}
                    </button>
                    {/* Folder: rename + buttons to create file or folder inside */}
                    {file.type === 'directory' && (
                      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); startRename(file); }}
                          title="Rename folder"
                          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); expandedDirs.has(file.path) || toggleDir(file.path); setModal({ type: 'file', parentPath: file.path }); }}
                          title="New file inside"
                          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); expandedDirs.has(file.path) || toggleDir(file.path); setModal({ type: 'folder', parentPath: file.path }); }}
                          title="New folder inside"
                          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
                        >
                          <svg className="w-3 h-3 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
                        </button>
                      </div>
                    )}
                    {isInterviewer && file.type === 'file' && visibility.managed.includes(file.path) && (
                      <button
                        onClick={(e) => { e.stopPropagation(); changeVisibility(visibility.hidden.includes(file.path) ? 'reveal' : 'hide', [file.path]); }}
                        title={visibility.hidden.includes(file.path) ? 'Reveal to the candidate' : 'Hide from the candidate'}
                        className="flex-shrink-0 p-1.5 rounded text-pink-500 hover:bg-pink-100 dark:hover:bg-pink-900/40"
                      >
                        {visibility.hidden.includes(file.path) ? (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        )}
                      </button>
                    )}
                    {file.type === 'file' && !isLockedPath(file.path, lockedFiles) && (
                      <button
                        onClick={(e) => { e.stopPropagation(); startRename(file); }}
                        title="Rename"
                        className={`flex-shrink-0 p-1.5 mr-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                          selectedFile === file.path
                            ? 'hover:bg-accent-400 text-white'
                            : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
            })}
          </ul>
        )}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title={pendingDelete.type === 'directory' ? `Delete the folder ${pendingDelete.name}?` : `Delete ${pendingDelete.name}?`}
          message={pendingDelete.type === 'directory'
            ? 'The folder and everything in it will be deleted. This cannot be undone.'
            : 'The file will be deleted. This cannot be undone.'}
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {modal && (
        <CreateFileModal
          type={modal.type}
          parentPath={modal.parentPath}
          onConfirm={async (fullPath) => {
            setModal(null);
            if (modal.type === 'file') await commitNewFile(fullPath);
            else await commitNewFolder(fullPath);
            // Auto-expand parent dir
            if (modal.parentPath) setExpandedDirs(prev => new Set([...prev, modal.parentPath!]));
          }}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  );
}
