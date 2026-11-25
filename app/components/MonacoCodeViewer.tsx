'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { isRunTarget } from '../lib/runTarget';
import { useRemoteKey } from '../hooks/useRemoteKey';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTheme } from '../context/ThemeContext';
import { DatabaseViewer } from './DatabaseViewer';
import { CsvViewer } from './CsvViewer';
import { collab } from '../lib/collab';
import { REDACTED, isHiddenFile, useHiddenFiles } from '../lib/hiddenFiles';
import { runAction, useAction } from '../lib/actions';
import { askDraft, editorMenuEntries } from '../lib/editorMenu';
import { openContextMenu } from '../lib/contextMenuStore';
import { isMenuKey } from '../lib/contextMenu';

export type SaveState = 'idle' | 'unsaved' | 'saving' | 'saved';

const RUN_COMMANDS: Record<string, (base: string) => string> = {
  ts:   (b) => `npx tsx ${b}`,
  tsx:  (b) => `npx tsx ${b}`,
  js:   (b) => `node ${b}`,
  jsx:  (b) => `node ${b}`,
  py:   (b) => `python3 ${b}`,
  sh:   (b) => `bash ${b}`,
  bash: (b) => `bash ${b}`,
  rb:   (b) => `ruby ${b}`,
  go:   (_b) => `go run .`,
  rs:   (_b) => `cargo run`,
};

function getRunCommand(filePath: string): string | null {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const fn = RUN_COMMANDS[ext];
  if (!fn) return null;
  const base = filePath.includes('/') ? filePath.split('/').pop()! : filePath;
  return fn(base);
}

const SAVE_DEBOUNCE_MS = 400;

interface MonacoCodeViewerProps {
  filePath: string | null;
  readOnly?: boolean;
  /** The agent is writing files: typing is paused so nothing the person types can collide with what it writes */
  aiLocked?: boolean;
  onSaveStateChange?: (state: SaveState) => void;
  onFileRenamed?: (newPath: string) => void;
  onRunFile?: (cmd: string) => void;
  /** The exercise's run command; only a file it names gets its own Run button */
  runStart?: string | null;
  /** Ref that will be populated with a forceFlush() function to immediately save */
  flushRef?: React.MutableRefObject<(() => Promise<void>) | null>;
  /** Ref that will be populated with a forceReload() to pick up external changes */
  reloadRef?: React.MutableRefObject<(() => void) | null>;
  /** Set to the editor and the monaco namespace once they are ready, so other parts can draw on the editor */
  handleRef?: React.MutableRefObject<{ editor: any; monaco: any } | null>;
  /** Callback to run the app (for Cmd+Enter when no runnable file) */
  onRunApp?: () => void;
  /** Callback to focus terminal (for Shift+Esc) */
  onFocusTerminal?: () => void;
  /** Candidate + exercise key, used to share the scroll position with the other screen */
  baseKey?: string;
}

interface LangInfo { id: string; label: string }

interface PeerCaret {
  label: string;
  role: 'interviewer' | 'candidate';
  file: string;
  l: number; c: number;
  sl: number; sc: number; el: number; ec: number;
  typingUntil: number;
}

function syncPeerStyles(peers: Record<string, PeerCaret>) {
  let el = document.getElementById('trio-remote-styles') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'trio-remote-styles';
    document.head.appendChild(el);
  }
  el.textContent = Object.entries(peers)
    .map(([id, p]) => `.trio-rc-${id}::after{content:${JSON.stringify(p.label)};}`)
    .join('\n');
}

const EXT_MAP: Record<string, LangInfo> = {
  js:   { id: 'javascript', label: 'JavaScript' },
  jsx:  { id: 'javascript', label: 'JavaScript (JSX)' },
  ts:   { id: 'typescript', label: 'TypeScript' },
  tsx:  { id: 'typescript', label: 'TypeScript (TSX)' },
  py:   { id: 'python',     label: 'Python' },
  md:   { id: 'markdown',   label: 'Markdown' },
  json: { id: 'json',       label: 'JSON' },
  html: { id: 'html',       label: 'HTML' },
  css:  { id: 'css',        label: 'CSS' },
  scss: { id: 'scss',       label: 'SCSS' },
  yaml: { id: 'yaml',       label: 'YAML' },
  yml:  { id: 'yaml',       label: 'YAML' },
  sh:   { id: 'shell',      label: 'Shell' },
  bash: { id: 'shell',      label: 'Bash' },
  sql:  { id: 'sql',        label: 'SQL' },
  go:   { id: 'go',         label: 'Go' },
  rs:   { id: 'rust',       label: 'Rust' },
  java: { id: 'java',       label: 'Java' },
  rb:   { id: 'ruby',       label: 'Ruby' },
  php:  { id: 'php',        label: 'PHP' },
  c:    { id: 'c',          label: 'C' },
  cpp:  { id: 'cpp',        label: 'C++' },
  h:    { id: 'c',          label: 'C Header' },
  cs:   { id: 'csharp',     label: 'C#' },
  xml:  { id: 'xml',        label: 'XML' },
  txt:  { id: 'plaintext',  label: 'Plain Text' },
};

function getLangInfo(path: string): LangInfo {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MAP[ext] ?? { id: 'plaintext', label: 'Plain Text' };
}

type EditorStatus = 'clean' | 'unsaved' | 'saving' | 'saved' | 'error';

function statusFor(state: SaveState): EditorStatus {
  if (state === 'saving') return 'saving';
  if (state === 'unsaved') return 'unsaved';
  return 'saved';
}

function saveTitle(status: EditorStatus, savedAt: Date | null): string {
  if (status === 'error') return 'Save failed, press Ctrl+S to retry';
  if (status === 'saving') return 'Saving...';
  if (status === 'unsaved') return 'Unsaved changes, autosaving soon (Ctrl+S saves now)';
  const time = savedAt ? savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
  return time ? `Saved at ${time}` : 'Saved';
}

export function MonacoCodeViewer({ filePath, readOnly = false, aiLocked = false, onSaveStateChange, onFileRenamed, onRunFile, runStart, flushRef, reloadRef, handleRef, onRunApp, onFocusTerminal, baseKey }: MonacoCodeViewerProps) {
  useHiddenFiles(); // re-render when a file is shown to or hidden from the candidate
  const runCommandFor = (file: string | null) => (file && isRunTarget(file, runStart) ? getRunCommand(file) : null);
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // showRaw must be declared here (top of component), Rules of Hooks forbid useState after early returns
  const [showRaw, setShowRaw] = useState(false);
  const { theme } = useTheme();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestContentRef = useRef<string>('');
  const hasLocalEditsRef = useRef(false);
  const lastSavedRef = useRef<number>(0);
  const loadFileRef = useRef<(() => Promise<void>) | null>(null);
  const editorRef = useRef<any>(null);
  const doSaveRef = useRef<() => Promise<void> | void>(() => {});
  const lastLocalScroll = useRef(0);
  const applyingScroll = useRef(false);
  const [status, setStatus] = useState<'clean' | 'unsaved' | 'saving' | 'saved' | 'error'>('clean');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const scrollKey = baseKey ? `trio_cc_scroll_${baseKey}` : undefined;
  const monacoRef = useRef<any>(null);
  const filePathRef = useRef<string | null>(filePath);
  const applyingRemoteEdit = useRef(false);
  const liveUntil = useRef(0);
  const peersRef = useRef<Record<string, PeerCaret>>({});
  const decoRef = useRef<any>(null);
  const sendCaretRef = useRef<((force?: boolean) => void) | null>(null);
  const renderPeersRef = useRef<(() => void) | null>(null);
  const mdScrollRef = useRef<HTMLDivElement>(null);
  const loadedPathRef = useRef<string | null>(null);

  useEffect(() => {
    hasLocalEditsRef.current = false;
    setStatus('clean');
    setSavedAt(null);

    if (!filePath) {
      setContent('');
      return;
    }

    const loadFile = async () => {
      if (hasLocalEditsRef.current || Date.now() < liveUntil.current) return;
      // Only the first load of a file shows the loading state; the 2s refresh is silent
      const firstLoad = loadedPathRef.current !== filePath;
      if (firstLoad) setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/files/${encodeURIComponent(filePath)}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setContent(data.content || '');
        latestContentRef.current = data.content || '';
        loadedPathRef.current = filePath;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load file');
        setContent('');
      } finally {
        setLoading(false);
      }
    };

    loadFileRef.current = loadFile;
    loadFile();

    // Refresh every 2s when not editing (picks up Claude's edits quickly)
    const interval = setInterval(loadFile, 2000);
    return () => { clearInterval(interval); loadFileRef.current = null; };
  }, [filePath]);

  // Expose forceReload to parent (for after Claude edits files)
  useEffect(() => {
    if (reloadRef) {
      reloadRef.current = () => {
        hasLocalEditsRef.current = false;
        loadFileRef.current?.();
      };
    }
    return () => { if (reloadRef) reloadRef.current = null; };
  }, [reloadRef]);

  // The other screen scrolled this file
  useRemoteKey(scrollKey, (value) => {
    if (!value || !filePath) return;
    if (Date.now() - lastLocalScroll.current < 1500) return;
    try {
      const { file, line, ratio } = JSON.parse(value) as { file: string; line?: number; ratio?: number };
      if (file !== filePath) return;
      if (typeof ratio === 'number' && mdScrollRef.current) {
        const box = mdScrollRef.current;
        applyingScroll.current = true;
        box.scrollTop = ratio * Math.max(0, box.scrollHeight - box.clientHeight);
        setTimeout(() => { applyingScroll.current = false; }, 120);
        return;
      }
      if (!editorRef.current || typeof line !== 'number') return;
      const editor = editorRef.current;
      applyingScroll.current = true;
      editor.setScrollTop(editor.getTopForLineNumber(line));
      setTimeout(() => { applyingScroll.current = false; }, 120);
    } catch {}
  });

  useEffect(() => {
    filePathRef.current = filePath;
    decoRef.current = null;
    renderPeersRef.current?.();
    sendCaretRef.current?.(true);
  }, [filePath]);

  // What the other person does in the editor: caret, selection and live edits
  useEffect(() => {
    const off = collab.on('peer', (msg) => {
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      if (msg.kind === 'leave') {
        delete peersRef.current[msg.id];
        renderPeersRef.current?.();
        return;
      }
      if (msg.kind === 'caret') {
        peersRef.current[msg.id] = {
          label: msg.label, role: msg.role, file: msg.file,
          l: msg.l, c: msg.c, sl: msg.sl, sc: msg.sc, el: msg.el, ec: msg.ec,
          typingUntil: msg.typing ? Date.now() + 1600 : 0,
        };
        renderPeersRef.current?.();
        if (msg.typing) setTimeout(() => renderPeersRef.current?.(), 1700);
        return;
      }
      if (!editor || !monaco || msg.file !== filePathRef.current) return;
      const model = editor.getModel();
      if (!model) return;
      const replaceAll = (text: string) => {
        applyingRemoteEdit.current = true;
        try { model.applyEdits([{ range: model.getFullModelRange(), text }]); } finally { applyingRemoteEdit.current = false; }
      };
      if (msg.kind === 'edit' && Array.isArray(msg.changes)) {
        applyingRemoteEdit.current = true;
        try {
          model.applyEdits(msg.changes.map((ch: any) => ({
            range: new monaco.Range(ch.sl, ch.sc, ch.el, ch.ec),
            text: ch.text,
            forceMoveMarkers: true,
          })));
        } finally { applyingRemoteEdit.current = false; }
        // The editor value prop must not change here: a late re-render would write an older text over newer edits
        latestContentRef.current = model.getValue();
        liveUntil.current = Date.now() + 5000;
        if (model.getValueLength() !== msg.len) {
          collab.send({ type: 'peer', kind: 'doc-request', file: msg.file });
        }
      } else if (msg.kind === 'doc-request') {
        collab.send({ type: 'peer', kind: 'doc-full', file: msg.file, text: model.getValue() });
      } else if (msg.kind === 'doc-full' && typeof msg.text === 'string') {
        replaceAll(msg.text);
        latestContentRef.current = msg.text;
        liveUntil.current = Date.now() + 5000;
      }
    });
    return () => { off(); };
  }, []);

  useAction('editor:focus', () => editorRef.current?.focus());
  useAction('editor:action', (id: string) => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.focus();
    ed.trigger('palette', id, {});
  });
  useAction('editor:run', () => {
    const cmd = runCommandFor(filePath);
    if (cmd) onRunFile?.(cmd);
  });
  useAction('editor:save', () => doSaveRef.current());
  // What the right-click menu needs to know when it opens, read at that moment rather than when the editor mounted
  const menuStateRef = useRef({ readOnly, aiLocked, filePath, runCommand: null as string | null, onRunFile });
  menuStateRef.current = { readOnly, aiLocked, filePath, runCommand: runCommandFor(filePath), onRunFile };
  const openEditorMenu = (editor: any, x: number, y: number, keyboard: boolean) => {
    const st = menuStateRef.current;
    const selection = editor.getSelection();
    const model = editor.getModel();
    const selected = selection && !selection.isEmpty() ? model?.getValueInRange(selection) ?? '' : '';
    const editLocked = st.readOnly || st.aiLocked;
    const edit = (text: string) => {
      const sel = editor.getSelection();
      if (!sel) return;
      editor.focus();
      // A normal Monaco edit, so it saves and reaches the other screen like typing
      editor.executeEdits('context-menu', [{ range: sel, text, forceMoveMarkers: true }]);
    };
    const entries = editorMenuEntries({
      hasSelection: !!selected,
      readOnly: st.readOnly,
      aiLocked: st.aiLocked,
      canFormat: !!editor.getAction('editor.action.formatDocument')?.isSupported(),
      runCommand: st.runCommand && st.onRunFile ? st.runCommand : null,
      chatAvailable: document.querySelector('[data-chat-root]') !== null,
      isMac: navigator.platform.toLowerCase().includes('mac'),
    }, {
      cut: () => { if (editLocked || !selected) return; navigator.clipboard?.writeText(selected).catch(() => {}); edit(''); },
      copy: () => { if (selected) navigator.clipboard?.writeText(selected).catch(() => {}); editor.focus(); },
      paste: () => {
        if (editLocked) return;
        navigator.clipboard?.readText().then(text => { if (text && !menuStateRef.current.aiLocked) edit(text); }).catch(() => {});
      },
      selectAll: () => { editor.focus(); editor.trigger('context-menu', 'editor.action.selectAll', {}); },
      gotoLine: () => { editor.focus(); editor.trigger('context-menu', 'editor.action.gotoLine', {}); },
      find: () => { editor.focus(); editor.trigger('context-menu', 'actions.find', {}); },
      format: () => { if (editLocked) return; editor.focus(); editor.trigger('context-menu', 'editor.action.formatDocument', {}); },
      run: () => { if (st.runCommand) st.onRunFile?.(st.runCommand); },
      ask: () => {
        const file = menuStateRef.current.filePath;
        if (!file) return;
        const line = editor.getPosition()?.lineNumber ?? 1;
        const sel = editor.getSelection();
        runAction('chat:draft-append', askDraft(file, selected && sel ? { text: selected, startLine: sel.startLineNumber, endLine: sel.endLineNumber } : null, line));
      },
    });
    openContextMenu({ entries, x, y, keyboard, label: 'Editor', returnFocus: editor.getDomNode()?.querySelector('textarea') ?? null });
  };

  useAction('editor:reload', () => { hasLocalEditsRef.current = false; loadFileRef.current?.(); });

  const notifySaveState = useCallback((state: SaveState) => {
    setStatus(statusFor(state));
    if (state === 'saved') setSavedAt(new Date());
    onSaveStateChange?.(state);
  }, [onSaveStateChange]);

  // Exposed via flushRef so parent can trigger an immediate save
  const savingRef = useRef(false);
  const saveAgainRef = useRef(false);
  const doSave = useCallback(async (valueToSave: string): Promise<void> => {
    if (!filePath) return;
    // One save at a time, so an older request can never land after a newer one; the latest text goes right after
    if (savingRef.current) {
      saveAgainRef.current = true;
      await new Promise<void>(resolve => { const t = setInterval(() => { if (!savingRef.current) { clearInterval(t); resolve(); } }, 20); });
      return;
    }
    savingRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    notifySaveState('saving');
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(filePath)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: valueToSave }),
      });
      if (!res.ok) throw new Error(`Save failed: HTTP ${res.status}`);
      lastSavedRef.current = Date.now();
      hasLocalEditsRef.current = false;
      notifySaveState('saved');
      savedTimerRef.current = setTimeout(() => notifySaveState('idle'), 2500);
    } catch (err) {
      console.error('[Monaco] Save failed:', err);
      notifySaveState('unsaved');
      setStatus('error');
    } finally {
      savingRef.current = false;
      if (saveAgainRef.current) { saveAgainRef.current = false; void doSave(latestContentRef.current); }
    }
  }, [filePath, notifySaveState]);

  useEffect(() => { doSaveRef.current = () => doSave(latestContentRef.current); }, [doSave]);

  // Register forceFlush with parent
  useEffect(() => {
    if (flushRef) {
      flushRef.current = () => doSave(latestContentRef.current);
    }
    return () => { if (flushRef) flushRef.current = null; };
  }, [flushRef, doSave]);

  const handleChange = useCallback((value: string | undefined) => {
    if (!filePath || value === undefined || applyingRemoteEdit.current) return;
    latestContentRef.current = value; // always track latest
    hasLocalEditsRef.current = true;
    notifySaveState('unsaved');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    // Saves a moment after the last key, always the latest content via latestContentRef
    saveTimerRef.current = setTimeout(() => doSave(latestContentRef.current), SAVE_DEBOUNCE_MS);
  }, [filePath, notifySaveState, doSave]);

  const handleLanguageChange = useCallback(async (newLangId: string) => {
    if (!filePath) return;
    const entry = Object.entries(EXT_MAP).find(([, v]) => v.id === newLangId);
    if (!entry) return;
    const [newExt] = entry;
    const currentExt = filePath.split('.').pop()?.toLowerCase();
    if (currentExt === newExt) return;
    const baseName = filePath.includes('.') ? filePath.slice(0, filePath.lastIndexOf('.')) : filePath;
    const newName = baseName + '.' + newExt;
    try {
      const res = await fetch(`/api/files/${encodeURIComponent(filePath)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName }),
      });
      if (res.ok) {
        // Notify parent to update selectedFile so Monaco reloads
        onFileRenamed?.(newName);
      }
    } catch (err) {
      console.error('Rename failed:', err);
    }
  }, [filePath, onFileRenamed]);

  if (!filePath) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 dark:bg-gray-900">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <svg
            className="mx-auto h-12 w-12 mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="text-sm">Select a file from the left sidebar</p>
        </div>
      </div>
    );
  }

  if (loading && !content) {
    return (
      <div className="flex items-center justify-center h-full bg-white dark:bg-gray-900">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-white dark:bg-gray-900">
        <div className="text-red-500 dark:text-red-400 text-sm">
          Error loading file: {error}
        </div>
      </div>
    );
  }

  const { id: language } = getLangInfo(filePath);
  const isMarkdown = filePath ? filePath.toLowerCase().endsWith('.md') : false;
  const isDatabase = filePath ? filePath.toLowerCase().endsWith('.db') : false;
  const isCsv = filePath ? filePath.toLowerCase().endsWith('.csv') : false;
  // showRaw declared at top of component (Rules of Hooks)

  // Special viewers for .db and .csv files
  if (isDatabase) {
    return <DatabaseViewer filePath={filePath} />;
  }

  if (isCsv) {
    return <CsvViewer filePath={filePath} />;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-gray-900">
      {/* File header */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-mono text-gray-700 dark:text-gray-300 truncate">
            {isHiddenFile(filePath) ? REDACTED : filePath}
          </span>
          {/* Language selector, hidden for locked/protected files and .md files */}
          {!readOnly && !isMarkdown && (
            <select
              value={language as string}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-none focus:outline-none cursor-pointer font-medium"
            >
              {Object.entries(EXT_MAP).filter(([, v], i, arr) =>
                arr.findIndex(([, v2]) => v2.id === v.id) === i
              ).map(([, { id, label }]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          )}
          {/* Show language badge for locked/markdown files instead of selector */}
          {(readOnly || isMarkdown) && (
            <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-medium">
              {Object.entries(EXT_MAP).find(([, v]) => v.id === language)?.[1]?.label || language}
            </span>
          )}
          {isMarkdown && (
            <button
              onClick={() => setShowRaw(r => !r)}
              className={`flex-shrink-0 text-xs px-2 py-0.5 rounded font-medium transition-colors ${
                showRaw
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  : 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'
              }`}
            >
              {showRaw ? 'Raw' : 'Preview'}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Run button, only for executable file types */}
          {!readOnly && !isMarkdown && status !== 'clean' && (
            <span
              title={saveTitle(status, savedAt)}
              className="flex h-5 w-5 flex-shrink-0 items-center justify-center"
              data-testid="save-state"
            >
              {status === 'saving' && (
                <svg className="h-3.5 w-3.5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              )}
              {status === 'unsaved' && <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />}
              {status === 'saved' && (
                <svg className="h-3.5 w-3.5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              )}
              {status === 'error' && (
                <svg className="h-3.5 w-3.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              )}
            </span>
          )}
          {(() => {
            const cmd = runCommandFor(filePath);
            if (!cmd || !onRunFile) return null;
            return (
              <button
                onClick={() => onRunFile(cmd)}
                title={`Run: ${cmd}`}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-accent-500 hover:bg-accent-600 text-white transition-colors font-medium"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
                Run
              </button>
            );
          })()}
        </div>
      </div>

      {/* Monaco Editor or Markdown Preview */}
      <div
        ref={mdScrollRef}
        className="flex-1 overflow-auto"
        onScroll={(e) => {
          if (!(isMarkdown && !showRaw) || applyingScroll.current || !scrollKey || !filePath) return;
          const box = e.currentTarget;
          lastLocalScroll.current = Date.now();
          const max = Math.max(1, box.scrollHeight - box.clientHeight);
          try { localStorage.setItem(scrollKey, JSON.stringify({ file: filePath, ratio: box.scrollTop / max })); } catch {}
        }}
      >
        {isMarkdown && !showRaw ? (
          <div className="p-6 prose prose-sm dark:prose-invert max-w-none
            prose-headings:mb-3 prose-headings:mt-4 prose-p:my-2 prose-li:my-0.5
            prose-code:bg-gray-100 prose-code:dark:bg-gray-800 prose-code:px-1.5 prose-code:rounded
            prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:p-4 prose-pre:rounded-xl
            prose-a:text-accent-600 prose-a:dark:text-accent-300 prose-strong:font-semibold
            prose-table:border prose-th:border prose-td:border prose-th:px-3 prose-th:py-1.5 prose-td:px-3 prose-td:py-1.5
          ">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        ) : (
          <Editor
            height="100%"
            path={filePath ?? undefined}
            language={language as string}
            beforeMount={(monacoInstance) => {
              // .tsx needs JSX enabled or every tag is a syntax error
              const ts = monacoInstance.languages.typescript;
              const compilerOptions = {
                jsx: ts.JsxEmit.ReactJSX,
                allowJs: true,
                allowNonTsExtensions: true,
                allowSyntheticDefaultImports: true,
                esModuleInterop: true,
                target: ts.ScriptTarget.ESNext,
                module: ts.ModuleKind.ESNext,
                moduleResolution: ts.ModuleResolutionKind.NodeJs,
              };
              ts.typescriptDefaults.setCompilerOptions(compilerOptions);
              ts.javascriptDefaults.setCompilerOptions(compilerOptions);
            }}
            value={content}
            theme={theme === 'dark' ? 'vs-dark' : 'vs'}
            onChange={handleChange}
            onMount={(editor, monacoInstance) => {
              editorRef.current = editor;
              monacoRef.current = monacoInstance;
              if (handleRef) handleRef.current = { editor, monaco: monacoInstance };

              const renderPeers = () => {
                const model = editor.getModel();
                if (!model) return;
                syncPeerStyles(peersRef.current);
                const decorations: any[] = [];
                for (const [id, p] of Object.entries(peersRef.current)) {
                  if (p.file !== filePathRef.current) continue;
                  const sel = model.validateRange(new monacoInstance.Range(p.sl, p.sc, p.el, p.ec));
                  if (!sel.isEmpty()) decorations.push({ range: sel, options: { className: `trio-rsel trio-rsel-${p.role}` } });
                  const at = model.validateRange(new monacoInstance.Range(p.l, p.c, p.l, p.c));
                  const typing = Date.now() < p.typingUntil ? ' trio-rc-typing' : '';
                  decorations.push({ range: at, options: { afterContentClassName: `trio-rc trio-rc-${p.role} trio-rc-${id}${typing}`, stickiness: 1 } });
                }
                if (!decoRef.current) decoRef.current = editor.createDecorationsCollection();
                decoRef.current.set(decorations);
              };
              renderPeersRef.current = renderPeers;

              let caretTimer: ReturnType<typeof setTimeout> | null = null;
              let pendingTyping = false;
              const sendCaret = (force?: boolean) => {
                if (!force && !editor.hasTextFocus()) return;
                const pos = editor.getPosition();
                const sel = editor.getSelection();
                if (!pos || !sel || !filePathRef.current) return;
                collab.send({
                  type: 'peer', kind: 'caret', file: filePathRef.current, typing: pendingTyping,
                  l: pos.lineNumber, c: pos.column,
                  sl: sel.startLineNumber, sc: sel.startColumn, el: sel.endLineNumber, ec: sel.endColumn,
                });
                pendingTyping = false;
              };
              sendCaretRef.current = sendCaret;

              // Our own menu replaces Monaco's (contextmenu is off below). It also opens from the Menu key and Shift+F10
              editor.onContextMenu((e: any) => {
                const ev = e.event;
                ev.preventDefault();
                ev.stopPropagation();
                // A right click inside the selection keeps it, anywhere else it moves the cursor there first
                const sel = editor.getSelection();
                if (e.target?.position && !(sel && !sel.isEmpty() && sel.containsPosition(e.target.position))) editor.setPosition(e.target.position);
                openEditorMenu(editor, ev.posx, ev.posy, false);
              });
              editor.onKeyDown((e: any) => {
                const ev = e.browserEvent as KeyboardEvent;
                if (!isMenuKey(ev)) return;
                e.preventDefault();
                e.stopPropagation();
                // Under the caret, in page coordinates
                const pos = editor.getPosition();
                const spot = pos ? editor.getScrolledVisiblePosition(pos) : null;
                const box = editor.getDomNode()?.getBoundingClientRect();
                openEditorMenu(editor, (box?.left ?? 0) + (spot?.left ?? 0), (box?.top ?? 0) + (spot ? spot.top + spot.height : 0), true);
              });
              const scheduleCaret = (typing = false) => {
                if (typing) pendingTyping = true;
                if (caretTimer) return;
                caretTimer = setTimeout(() => { caretTimer = null; sendCaret(); }, 40);
              };
              editor.onDidChangeCursorSelection(() => { if (!applyingRemoteEdit.current) scheduleCaret(); });
              editor.onDidChangeModelContent((e: any) => {
                if (applyingRemoteEdit.current || e.isFlush || !editor.hasTextFocus() || !filePathRef.current) return;
                collab.send({
                  type: 'peer', kind: 'edit', file: filePathRef.current,
                  changes: e.changes.map((ch: any) => ({
                    sl: ch.range.startLineNumber, sc: ch.range.startColumn,
                    el: ch.range.endLineNumber, ec: ch.range.endColumn, text: ch.text,
                  })),
                  len: editor.getModel()?.getValueLength() ?? 0,
                });
                scheduleCaret(true);
              });
              sendCaret(true);

              // Ctrl/Cmd+S saves right away instead of waiting for the autosave
              editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => doSaveRef.current());
              // On a Mac CtrlCmd is Cmd, so Ctrl+S needs its own binding
              editor.addCommand(monacoInstance.KeyMod.WinCtrl | monacoInstance.KeyCode.KeyS, () => doSaveRef.current());

              // Tell the other screen which line is at the top
              editor.onDidScrollChange((e: any) => {
                if (!e.scrollTopChanged || applyingScroll.current || !scrollKey || !filePath) return;
                lastLocalScroll.current = Date.now();
                const line = editor.getVisibleRanges()[0]?.startLineNumber ?? 1;
                try { localStorage.setItem(scrollKey, JSON.stringify({ file: filePath, line })); } catch {}
              });

              editor.onDidBlurEditorWidget(() => {
                if (hasLocalEditsRef.current && latestContentRef.current) {
                  doSave(latestContentRef.current);
                }
              });
              // Disable semantic validation errors (candidate's partial code will have errors)
              // Keep syntax highlighting but suppress red squiggles
              monacoInstance.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
                noSemanticValidation: true,
                noSyntaxValidation: false,
                noSuggestionDiagnostics: true,
              });
              monacoInstance.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
                noSemanticValidation: true,
                noSyntaxValidation: false,
                noSuggestionDiagnostics: true,
              });

              // Add custom keybindings for keyboard shortcuts
              // Cmd/Ctrl+Enter → Run file or app
              editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter, () => {
                const cmd = runCommandFor(filePath);
                if (cmd && onRunFile) {
                  onRunFile(cmd);
                } else if (onRunApp) {
                  onRunApp();
                }
              });

              // Shift+Esc → Focus terminal
              editor.addCommand(monacoInstance.KeyMod.Shift | monacoInstance.KeyCode.Escape, () => {
                onFocusTerminal?.();
              });
            }}
            options={{
              // Typing pauses while the agent writes; the text it writes still arrives
              readOnly: readOnly || aiLocked,
              // Replaced by the menu of the page (see onContextMenu above)
              contextmenu: false,
              minimap: { enabled: true },
              fontSize: 14,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              wordWrap: 'on',
              renderWhitespace: 'selection',
            }}
            loading={<div className="flex items-center justify-center h-full">Loading editor...</div>}
          />
        )}
      </div>
    </div>
  );
}
