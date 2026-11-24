'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { tabSessionId } from './lib/tabSession';
import { AiChangesBar } from './components/AiChangesBar';
import { Group, Panel, Separator, useGroupRef, usePanelRef } from 'react-resizable-panels';
import type { GroupImperativeHandle, Layout, PanelImperativeHandle } from 'react-resizable-panels';
import type { SaveState } from './components/MonacoCodeViewer';
import { useClaudeStream } from './hooks/useClaudeStream';
import { useMultiChat } from './hooks/useMultiChat';
import { useCandidate } from './hooks/useCandidate';
import { useCollabOpen } from './hooks/useCollabOpen';
import { useSessionStatus } from './hooks/useSessionStatus';
import { useStickyTrue } from './hooks/useStickyTrue';
import { useProjectFiles } from './hooks/useProjectFiles';
import { useAiChanges } from './hooks/useAiChanges';
import { ChatInterface } from './components/ChatInterface';
import { FileExplorerNew } from './components/FileExplorerNew';
import { MonacoCodeViewer } from './components/MonacoCodeViewer';
import { Header } from './components/Header';
import { WelcomeScreen } from './components/WelcomeScreen';
import { EditNameModal } from './components/EditNameModal';
import { TerminalManager } from './components/TerminalManager';
import { useUiStateSync } from './hooks/useUiStateSync';
import { useAiStatus } from './hooks/useAiStatus';
import { AiUnavailable } from './components/AiUnavailable';
import { useAgentMode } from './hooks/useAgentMode';
import { AgentModePicker } from './components/AgentModePicker';
import { AgentTerminal } from './components/AgentTerminal';
import { isLockedPath } from '../shared/locks';
import { collab } from './lib/collab';
import { previewSrc } from './lib/previewOrigin';
import { CommandPalette, type PaletteAction } from './components/CommandPalette';
import { runAction } from './lib/actions';
import { MODELS } from '../shared/models';
import { isFollowing, registerViewSnapshot, stopFollowing, useFollowing } from './lib/follow';
import { beginLayoutGesture, isLayoutGesture, pulseLayoutGesture } from './lib/layoutGesture';
import { useRemoteKey } from './hooks/useRemoteKey';
import { ConfirmDialog } from './components/ConfirmDialog';
import { FileTabBar } from './components/FileTabBar';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { closeShortcut, globalShortcut, mergeOpenTabs } from './lib/shortcuts';
import { createDragGuard } from './lib/dragGuard';
import { ThemeProvider } from './context/ThemeContext';

function togglePanel(e: React.MouseEvent, panelRef: React.RefObject<PanelImperativeHandle | null>, setCollapsed: (v: boolean) => void) {
  e.stopPropagation();
  pulseLayoutGesture();
  const panel = panelRef.current;
  if (!panel) return;
  if (panel.isCollapsed()) {
    panel.expand();
    setCollapsed(false);
  } else {
    panel.collapse();
    setCollapsed(true);
  }
}

const PREVIEW_TAB = '__preview__';

/** Loads the preview again from its address, which also leaves any route the app navigated to */
function reloadPreview() {
  const iframe = document.querySelector<HTMLIFrameElement>('#preview-iframe');
  const src = iframe?.getAttribute('src');
  if (iframe && src) iframe.setAttribute('src', src);
}

function remapPath(path: string, from: string, to: string): string {
  if (path === from) return to;
  return path.startsWith(from + '/') ? to + path.slice(from.length) : path;
}

interface MainPaneProps {
  codeArea: React.ReactNode;
  previewPaneEl: React.ReactNode;
  previewUrl: string | null | undefined;
  selectedFile: string | null;
  previewPinned: boolean;
  pinnedPreviewRef: React.RefObject<PanelImperativeHandle | null>;
  pinnedPreviewCollapsed: boolean;
  setPinnedPreviewCollapsed: (v: boolean) => void;
  pinnedGroupRef: React.RefObject<GroupImperativeHandle | null>;
  onPinnedLayout: (layout: Layout) => void;
}

/** The code editor, the preview, or both side by side when the preview is pinned */
function MainPane({ codeArea, previewPaneEl, previewUrl, selectedFile, previewPinned, pinnedPreviewRef, pinnedPreviewCollapsed, setPinnedPreviewCollapsed, pinnedGroupRef, onPinnedLayout }: MainPaneProps) {
  if (previewPinned && selectedFile !== PREVIEW_TAB) {
    return (
      <Group orientation="horizontal" className="h-full flex" groupRef={pinnedGroupRef} onLayoutChanged={onPinnedLayout}>
        <Panel id="code-pane" defaultSize="60%" minSize="8%">{codeArea}</Panel>
        <HSep panelRef={pinnedPreviewRef} collapsed={pinnedPreviewCollapsed} setCollapsed={setPinnedPreviewCollapsed} side="right" />
        <Panel id="pinned-preview" defaultSize="40%" minSize="5%" collapsible collapsedSize="0%" panelRef={pinnedPreviewRef}>
          {previewPaneEl}
        </Panel>
      </Group>
    );
  }
  if (selectedFile !== PREVIEW_TAB) return <>{codeArea}</>;
  if (previewUrl) return <>{previewPaneEl}</>;
  return (
    <div className="flex h-full items-center justify-center bg-gray-50 text-sm text-gray-500 dark:bg-gray-900 dark:text-gray-400">
      The app is not running yet. Press Run in the terminal and the preview shows up here.
    </div>
  );
}

/** Arrow keys on a separator resize a panel */
function layoutKey(e: React.KeyboardEvent) {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Enter'].includes(e.key)) pulseLayoutGesture();
}

// Separator with a small centered toggle button
function HSep({
  panelRef, collapsed, setCollapsed, side = 'left',
}: {
  panelRef: React.RefObject<PanelImperativeHandle | null>;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  side?: 'left' | 'right';
}) {
  const guard = useRef(createDragGuard()).current;
  const toggle = (e: React.MouseEvent) => { if (guard.isDrag(e)) { e.stopPropagation(); return; } togglePanel(e, panelRef, setCollapsed); };
  // chevron direction: when left panel is visible → ‹ (close left); when collapsed → ›
  // for right panel: when visible → › (close right); when collapsed → ‹
  const pointsRight = side === 'left' ? collapsed : !collapsed;
  const icon = pointsRight ? '›' : '‹';
  return (
    <Separator onPointerDown={beginLayoutGesture} onKeyDown={layoutKey} className="relative w-1 bg-gray-200 dark:bg-gray-700 hover:bg-accent-400 dark:hover:bg-accent-600 transition-colors cursor-col-resize overflow-visible z-10">
      <button
        onClick={toggle}
        onPointerDown={guard.down}
        title={collapsed ? 'Expand' : 'Collapse'}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-9 bg-gray-200 dark:bg-gray-600 hover:bg-accent-400 dark:hover:bg-accent-500 rounded-sm flex items-center justify-center text-gray-600 dark:text-gray-300 hover:text-white transition-colors shadow-sm text-xs font-bold z-20"
        style={{ cursor: 'default' }}
      >
        {icon}
      </button>
    </Separator>
  );
}

function VSep({
  panelRef, collapsed, setCollapsed,
}: {
  panelRef: React.RefObject<PanelImperativeHandle | null>;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}) {
  const guard = useRef(createDragGuard()).current;
  const toggle = (e: React.MouseEvent) => { if (guard.isDrag(e)) { e.stopPropagation(); return; } togglePanel(e, panelRef, setCollapsed); };
  return (
    <Separator onPointerDown={beginLayoutGesture} onKeyDown={layoutKey} className="relative h-1 bg-gray-700 dark:bg-gray-800 hover:bg-accent-500 transition-colors cursor-row-resize overflow-visible z-10">
      <button
        onClick={toggle}
        onPointerDown={guard.down}
        title={collapsed ? 'Show terminal' : 'Hide terminal'}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-4 bg-gray-600 dark:bg-gray-700 hover:bg-accent-500 rounded-sm flex items-center justify-center text-gray-300 hover:text-white transition-colors shadow-sm text-xs font-bold z-20"
        style={{ cursor: 'default' }}
      >
        {collapsed ? '∨' : '∧'}
      </button>
    </Separator>
  );
}

function CollapsedFiles({ onExpand }: { onExpand: () => void }) {
  return (
    <div className="flex flex-col items-center h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 py-4 gap-3">
      <button onClick={onExpand} title="Expand files"
        className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      </button>
      <span className="text-xs text-gray-400 dark:text-gray-500 font-medium tracking-wider"
        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>FILES</span>
    </div>
  );
}

function CollapsedChat({ onExpand }: { onExpand: () => void }) {
  return (
    <div className="flex flex-col items-center h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 py-4 gap-3">
      <button onClick={onExpand} title="Expand AI chat"
        className="p-1.5 rounded hover:bg-accent-100 dark:hover:bg-accent-900/30 text-accent-600 dark:text-accent-300">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      </button>
      <div className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_2px_rgba(34,197,94,0.6)] animate-pulse" />
      <span className="text-xs text-accent-600 dark:text-accent-300 font-medium tracking-wider"
        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>AI</span>
    </div>
  );
}

function InterviewPageContent() {
  const [sessionId] = useState(() => tabSessionId());
  const [sessionReady, setSessionReady] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [pendingThreadClose, setPendingThreadClose] = useState<string | null>(null);
  const [startAsInterviewer, setStartAsInterviewer] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem('trio_cc_pick_candidate') === '1') {
        sessionStorage.removeItem('trio_cc_pick_candidate');
        setStartAsInterviewer(true);
      }
    } catch {}
  }, []);
  const [interviewerView, setInterviewerView] = useState(false);
  const interviewerViewRef = useRef(false);
  interviewerViewRef.current = interviewerView;
  const [following] = useFollowing();
  const { status: aiStatus, recheck: recheckAi } = useAiStatus();
  const agentMode = useAgentMode();
  const [confirmChangeAssistant, setConfirmChangeAssistant] = useState(false);
  const switchCandidate = useCallback(() => {
    ['trio_cc_candidate', 'trio_cc_last_seen', 'trio_cc_role'].forEach(k => { try { localStorage.removeItem(k); } catch {} });
    // Straight to the list of candidates, not the home page
    try {
      sessionStorage.setItem('trio_cc_pick_candidate', '1');
    } catch {}
    window.location.reload();
  }, []);
  // Back to the first page. The candidate keeps the name and the work; the interviewer picks the role again.
  const [confirmHome, setConfirmHome] = useState(false);
  const [confirmInactive, setConfirmInactive] = useState(false);
  const goHome = useCallback(() => {
    const keys = localStorage.getItem('trio_cc_role') === 'interviewer'
      ? ['trio_cc_role', 'trio_cc_candidate', 'trio_cc_last_seen']
      
      : ['trio_cc_last_seen']; // no recent visit: the welcome screen asks "Continue as <name>" or someone else
    keys.forEach(k => { try { localStorage.removeItem(k); } catch {} });
    window.location.reload();
  }, []);
  useEffect(() => {
    if (sessionReady) setInterviewerView(localStorage.getItem('trio_cc_role') === 'interviewer');
  }, [sessionReady]);
  const [previewPinned, setPreviewPinned] = useState(false);
  const [pinnedPreviewCollapsed, setPinnedPreviewCollapsed] = useState(false);
  const pinnedPreviewRef = usePanelRef();
  const selectedFileRef = useRef<string | null>(null);
  selectedFileRef.current = selectedFile;
  const lastFileRef = useRef<string | null>(null);
  if (selectedFile && selectedFile !== '__preview__') lastFileRef.current = selectedFile;
  const [showEditName, setShowEditName] = useState(false);
  const [filesCollapsed, setFilesCollapsed] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [terminalCollapsed, setTerminalCollapsed] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [lockedFiles, setLockedFiles] = useState<Set<string>>(new Set());
  // Read exerciseId from localStorage immediately (set during activation)
  const [currentExerciseId, setCurrentExerciseId] = useState<string>(() => {
    if (typeof window === 'undefined') return 'fibonacci';
    return localStorage.getItem('trio_cc_exercise') || 'fibonacci';
  });
  const [pendingRunCmd, setPendingRunCmd] = useState<string | null>(null);
  const [runChallenge, setRunChallenge] = useState<{ start: string; description: string; port: number | null } | null>(null);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [tabsLoaded, setTabsLoaded] = useState(false);
  const [previewFlash, setPreviewFlash] = useState(false);
  const focusPreviewAskedAt = useRef(0);
  const previewPinnedRef = useRef(false);
  previewPinnedRef.current = previewPinned;
  const [previewUrl, setPreviewUrl] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    // Restore preview URL from session storage (survives reload, not tab close)
    return sessionStorage.getItem('trio_cc_preview_url') || null;
  });
  // Monaco exposes forceFlush so "Save now" always saves latest editor content
  const monacoFlushRef = useRef<(() => Promise<void>) | null>(null);
  const monacoReloadRef = useRef<(() => void) | null>(null);
  const monacoHandleRef = useRef<{ editor: any; monaco: any } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const runAppRef = useRef<(() => void) | null>(null);

  // usePanelRef() is the typed hook from react-resizable-panels v3
  const filesPanelRef = usePanelRef();
  const chatPanelRef = usePanelRef();
  const terminalPanelRef = usePanelRef();

  // useCandidate must come before useClaudeStream so we can use candidateName as chat key
  const { candidateName, createCandidate, triggerManualSave, setActiveName } = useCandidate();
  const sessionStatus = useSessionStatus(candidateName);
  const collabOpen = useCollabOpen();
  // This screen shows one candidate while the platform works on another: go to the active one (interviewer) or leave to the first page (candidate)
  const resolveInactive = useCallback(() => {
    const target = interviewerViewRef.current ? sessionStatus.active : null;
    if (target) {
      try { localStorage.setItem('trio_cc_candidate', target); localStorage.removeItem('trio_cc_last_seen'); } catch {}
    } else {
      // A candidate screen cannot take the interview back from someone else: leave to the first page
      ['trio_cc_last_seen'].forEach(k => { try { localStorage.removeItem(k); } catch {} });
    }
    window.location.reload();
  }, [sessionStatus.active]);
  // Base key scoped to candidate + exercise
  const baseKey = useUiStateSync(candidateName ?? undefined, currentExerciseId);
  // The title of the exercise, from the first heading of its brief. The header shows it next to the logo.
  const [exerciseTitle, setExerciseTitle] = useState('');
  useEffect(() => {
    let cancelled = false;
    fetch('/api/exercise').then(r => (r.ok ? r.json() : null)).then(d => { if (!cancelled && typeof d?.title === 'string') setExerciseTitle(d.title); }).catch(() => {});
    return () => { cancelled = true; };
  }, [candidateName, currentExerciseId]);
  // A preview URL left in sessionStorage by another candidate must not leak into this one
  useEffect(() => {
    if (!candidateName || !previewUrl) return;
    if (!previewUrl.includes(`/preview/${candidateName}/`)) {
      setPreviewUrl(null);
      try { sessionStorage.removeItem('trio_cc_preview_url'); } catch {}
    }
  }, [candidateName, previewUrl]);
  // Multi-chat: manages threads per candidate+exercise
  const { threads, closedThreads, activeThread, activeThreadId, setActiveThreadId, activeChatKey, unreadThreadIds, markThreadUnread, createThread, deleteThread, restoreThread, renameThread, reorderThreads, setThreadModel, autoTitleThread, applyGeneratedTitle } = useMultiChat(baseKey);
  // Files the AI changed and the candidate has not opened since
  const aiChangedKey = baseKey ? `trio_cc_ai_changed_${baseKey}` : undefined;
  const [aiChanged, setAiChanged] = useState<string[]>([]);
  const aiChangedRef = useRef<string[]>([]);
  const writeAiChanged = useCallback((next: string[]) => {
    aiChangedRef.current = next;
    setAiChanged(next);
    if (aiChangedKey) { try { localStorage.setItem(aiChangedKey, JSON.stringify(next)); } catch {} }
  }, [aiChangedKey]);
  useEffect(() => {
    if (!aiChangedKey) return;
    try {
      const parsed = JSON.parse(localStorage.getItem(aiChangedKey) || '[]');
      if (Array.isArray(parsed)) { aiChangedRef.current = parsed; setAiChanged(parsed); }
    } catch {}
  }, [aiChangedKey]);
  useRemoteKey(aiChangedKey, (value) => {
    try {
      const parsed = value ? JSON.parse(value) : [];
      if (Array.isArray(parsed)) { aiChangedRef.current = parsed; setAiChanged(parsed); }
    } catch {}
  });
  const markAiChanged = useCallback((filePath: string) => {
    if (aiChangedRef.current.includes(filePath)) return;
    writeAiChanged([...aiChangedRef.current, filePath]);
  }, [writeAiChanged]);

  useEffect(() => {
    if (selectedFile && aiChangedRef.current.includes(selectedFile)) {
      writeAiChanged(aiChangedRef.current.filter(f => f !== selectedFile));
    }
  }, [selectedFile, writeAiChanged]);

  // Cursors are shared only while the code screen is open, not on the landing or name screens
  useEffect(() => {
    collab.setWorkspaceOpen(sessionReady && !!baseKey);
    return () => collab.setWorkspaceOpen(false);
  }, [sessionReady, baseKey]);

  // Claude stream wired to the active thread's baseKey
  const [aiTurn, setAiTurn] = useState(0);
  const projectFiles = useProjectFiles(sessionReady);
  const { changes: aiChanges, writing: aiWriting } = useAiChanges(sessionReady, aiTurn);
  const { messages, sendMessage, isConnected, isThinking, editingFile, clearHistory, stopCurrent, selectedModel, setSelectedModel, contextTokens, totalTokens, runCommand } = useClaudeStream(sessionId, () => {
    monacoReloadRef.current?.();
    setAiTurn(n => n + 1);
  }, activeChatKey, markThreadUnread, markAiChanged);
  const aiLocked = useStickyTrue(aiWriting || !!editingFile, 2500);

  // Keep selectedModel in sync with active thread's model
  useEffect(() => {
    if (activeThread && activeThread.model !== selectedModel) {
      setSelectedModel(activeThread.model);
    }
  }, [activeThread?.id]);

  useEffect(() => {
    if (!sessionReady) return;
    fetch('/api/run-challenge')
      .then(r => r.json())
      .then(d => { if (d.start) setRunChallenge(d); })
      .catch(() => {});
  }, [sessionReady]);

  // If previewUrl was restored from sessionStorage, make sure preview tab is open
  useEffect(() => {
    if (!previewUrl) return;
    setOpenTabs(prev => prev.includes(PREVIEW_TAB) ? prev : [PREVIEW_TAB, ...prev]);
  }, []); // only on mount

  // Web exercises start with the preview tab open but not focused
  useEffect(() => {
    if (!baseKey || !runChallenge?.port || !tabsLoaded) return;
    const flag = `trio_cc_preview_seeded_${baseKey}`;
    try { if (localStorage.getItem(flag)) return; } catch {}
    const t = setTimeout(() => {
      try { localStorage.setItem(flag, '1'); } catch {}
      setOpenTabs(prev => prev.includes(PREVIEW_TAB) ? prev : [PREVIEW_TAB, ...prev]);
    }, 700);
    return () => clearTimeout(t);
  }, [baseKey, runChallenge?.port, tabsLoaded]);

  // Load open tabs from localStorage when baseKey is available
  const previousBaseKey = useRef<string | null>(null);
  useEffect(() => {
    if (!baseKey) return;
    const switchedSession = previousBaseKey.current !== null && previousBaseKey.current !== baseKey;
    previousBaseKey.current = baseKey;

    const storageKey = `trio_cc_tabs_${baseKey}`;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setOpenTabs(parsed);
          // Restore the file that was active, falling back to the first tab
          if (parsed.length > 0 && (!selectedFile || switchedSession)) {
            const savedActive = localStorage.getItem(`trio_cc_active_file_${baseKey}`);
            setSelectedFile(savedActive && parsed.includes(savedActive) ? savedActive : parsed[0]);
          }
        }
      } else {
        // No stored tabs for this baseKey - clear current tabs
        setOpenTabs([]);
        setSelectedFile(null);
      }
    } catch {}
    setTabsLoaded(true);
  }, [baseKey]);

  // Save open tabs to localStorage whenever they change
  useEffect(() => {
    if (!baseKey || !tabsLoaded) return;
    const storageKey = `trio_cc_tabs_${baseKey}`;
    try {
      localStorage.setItem(storageKey, JSON.stringify(openTabs));
    } catch {}
  }, [openTabs, baseKey, tabsLoaded]);

  // Restore the pinned preview choice
  useEffect(() => {
    if (!baseKey) return;
    try { setPreviewPinned(localStorage.getItem(`trio_cc_preview_pinned_${baseKey}`) === '1'); } catch {}
  }, [baseKey]);

  // Same layout and same files on both screens: whatever one side changes, the other follows
  useRemoteKey(baseKey ? `trio_cc_tabs_${baseKey}` : undefined, (value) => {
    try {
      const parsed = value ? JSON.parse(value) : [];
      if (!Array.isArray(parsed)) return;
      // Without Follow the interviewer keeps their own tabs and only gains the ones the candidate has open
      if (collab.role === 'interviewer' && !isFollowing()) {
        setOpenTabs(prev => mergeOpenTabs(prev, parsed, PREVIEW_TAB));
      } else {
        setOpenTabs(parsed);
      }
    } catch {}
  });
  useRemoteKey(baseKey ? `trio_cc_active_file_${baseKey}` : undefined, (value) => {
    if (value) setSelectedFile(value);
  });
  useRemoteKey(baseKey ? `trio_cc_preview_pinned_${baseKey}` : undefined, (value) => {
    setPreviewPinned(value === '1');
  });

  const applyLayout = useCallback((raw: string | null) => {
    if (!raw) return;
    try {
      const layout = JSON.parse(raw) as { files?: boolean; chat?: boolean; terminal?: boolean };
      const apply = (ref: { current: PanelImperativeHandle | null }, collapsed?: boolean) => {
        const panel = ref.current;
        if (!panel || collapsed === undefined) return;
        if (collapsed && !panel.isCollapsed()) panel.collapse();
        if (!collapsed && panel.isCollapsed()) panel.expand();
      };
      apply(filesPanelRef, layout.files);
      apply(chatPanelRef, layout.chat);
      apply(terminalPanelRef, layout.terminal);
    } catch {}
  }, [filesPanelRef, chatPanelRef, terminalPanelRef]);

  useRemoteKey(baseKey ? `trio_cc_layout_${baseKey}` : undefined, applyLayout);

  // Panel sizes are read once the workspace is on screen, so apply the saved layout after the first paint
  useEffect(() => {
    if (!baseKey || !sessionReady) return;
    const t = setTimeout(() => applyLayout(localStorage.getItem(`trio_cc_layout_${baseKey}`)), 600);
    return () => clearTimeout(t);
  }, [baseKey, sessionReady, applyLayout]);

  const layoutReady = useRef(false);
  useEffect(() => {
    if (!baseKey || !sessionReady) return;
    if (!layoutReady.current) { layoutReady.current = true; return; }
    try {
      localStorage.setItem(`trio_cc_layout_${baseKey}`, JSON.stringify({ files: filesCollapsed, chat: chatCollapsed, terminal: terminalCollapsed }));
    } catch {}
  }, [filesCollapsed, chatCollapsed, terminalCollapsed, baseKey, sessionReady]);

  // Exact panel sizes travel with Follow: what one person drags, a following screen copies, and it goes back when Follow is turned off
  const outerGroupRef = useGroupRef();
  const mainGroupRef = useGroupRef();
  const pinnedGroupRef = useGroupRef();
  // One key per side, so the other person's layout is still there to copy after you moved yours
  const sizesKey = baseKey ? `trio_cc_sizes_${interviewerView ? 'interviewer' : 'candidate'}_${baseKey}` : undefined;
  const otherSizesKey = baseKey ? `trio_cc_sizes_${interviewerView ? 'candidate' : 'interviewer'}_${baseKey}` : undefined;
  const applyingSizes = useRef(false);

  // Every group is written each time, so a group that did not move is not left with an old value
  const currentSizes = useCallback(() => {
    const round = (layout?: Layout) => layout && Object.fromEntries(Object.entries(layout).map(([id, size]) => [id, Math.round(size * 100) / 100]));
    return { outer: round(outerGroupRef.current?.getLayout()), main: round(mainGroupRef.current?.getLayout()), pinned: round(pinnedGroupRef.current?.getLayout()) };
  }, [outerGroupRef, mainGroupRef, pinnedGroupRef]);

  const saveSizes = useCallback((_group: 'outer' | 'main' | 'pinned', _layout: Layout) => {
    if (!sizesKey || applyingSizes.current || !isLayoutGesture()) return;
    try { localStorage.setItem(sizesKey, JSON.stringify(currentSizes())); } catch {}
  }, [sizesKey, currentSizes]);

  const applySizes = useCallback((raw: string | null) => {
    if (!raw) return;
    try {
      const sizes = JSON.parse(raw) as { outer?: Layout; main?: Layout; pinned?: Layout };
      applyingSizes.current = true;
      if (sizes.outer) outerGroupRef.current?.setLayout(sizes.outer);
      if (sizes.main) mainGroupRef.current?.setLayout(sizes.main);
      if (sizes.pinned) pinnedGroupRef.current?.setLayout(sizes.pinned);
    } catch {
    } finally {
      setTimeout(() => { applyingSizes.current = false; }, 400);
    }
  }, [outerGroupRef, mainGroupRef, pinnedGroupRef]);

  useRemoteKey(otherSizesKey, applySizes);
  useRemoteKey(sizesKey, applySizes);

  // Turning Follow on remembers the sizes this screen has right now, so turning it off can bring them back
  useEffect(() => {
    if (!sizesKey) return;
    return registerViewSnapshot(() => ({ [sizesKey]: JSON.stringify(currentSizes()) }));
  }, [sizesKey, currentSizes]);

  // Turning Follow on always copies the other side's sizes, even when the stored copy has not changed since the last time
  useEffect(() => {
    if (!otherSizesKey) return;
    const onChange = () => {
      if (!isFollowing()) return;
      setTimeout(() => { if (isFollowing()) applySizes(localStorage.getItem(otherSizesKey)); }, 400);
    };
    window.addEventListener('trio-follow-change', onChange);
    return () => window.removeEventListener('trio-follow-change', onChange);
  }, [otherSizesKey, applySizes]);

  // On load, and when the pinned preview shows up, a following screen takes the sizes it was given
  useEffect(() => {
    if (!otherSizesKey || !sessionReady || !isFollowing()) return;
    const t = setTimeout(() => applySizes(localStorage.getItem(otherSizesKey)), 700);
    return () => clearTimeout(t);
  }, [otherSizesKey, sessionReady, previewPinned, applySizes]);

  // Remember which file is active
  useEffect(() => {
    if (!baseKey || !tabsLoaded || !selectedFile) return;
    try { localStorage.setItem(`trio_cc_active_file_${baseKey}`, selectedFile); } catch {}
  }, [selectedFile, baseKey, tabsLoaded]);

  // Global keyboard shortcuts (only work outside Monaco editor)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const closing = closeShortcut(e, {
        inMonaco: target.closest('.monaco-editor') !== null,
        inTerminal: target.closest('.xterm') !== null,
        inChat: target.closest('[data-chat-root]') !== null,
      });
      if (closing) {
        e.preventDefault();
        if (closing === 'editor') { const open = selectedFileRef.current; if (open) closeTabRef.current(open); }
        else runAction(closing === 'terminal' ? 'terminal:close' : 'chat:close');
        return;
      }
      const action = globalShortcut(e, {
        inField: target.tagName === 'INPUT' || target.tagName === 'TEXTAREA',
        inMonaco: target.closest('.monaco-editor') !== null,
        showShortcuts,
        hasPreview: document.querySelector('#preview-iframe') !== null,
      });
      if (!action) return;
      e.preventDefault();
      if (action === 'toggle-shortcuts') setShowShortcuts(prev => !prev);
      else if (action === 'close-shortcuts') setShowShortcuts(false);
      else if (action === 'run-app') runAppRef.current?.();
      else if (action === 'reload-preview') reloadPreview();
      else if (terminalPanelRef.current?.isCollapsed()) terminalPanelRef.current.expand();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [terminalPanelRef, showShortcuts]);

  const handleEditName = async (newName: string) => {
    localStorage.setItem('trio_cc_candidate', newName);
    window.location.reload();
  };

  const handleFilesResize = useCallback(() => {
    setFilesCollapsed(!!filesPanelRef.current?.isCollapsed());
  }, [filesPanelRef]);

  const handleChatResize = useCallback(() => {
    setChatCollapsed(!!chatPanelRef.current?.isCollapsed());
  }, [chatPanelRef]);

  const handleTerminalResize = useCallback(() => {
    setTerminalCollapsed(!!terminalPanelRef.current?.isCollapsed());
  }, [terminalPanelRef]);

  const handleRunFile = useCallback((cmd: string) => {
    // Expand terminal first
    // Expand terminal if collapsed
    const panel = terminalPanelRef.current;
    if (panel?.isCollapsed()) {
      panel.expand();
      setTerminalCollapsed(false);
    }
    // Queue command, Terminal.tsx executes it when WebSocket is open
    setPendingRunCmd(cmd);
  }, [terminalPanelRef]);

  const handleFocusTerminal = useCallback(() => {
    const panel = terminalPanelRef.current;
    if (panel?.isCollapsed()) {
      panel.expand();
      setTerminalCollapsed(false);
    }
    // Focus will happen naturally when terminal becomes visible
  }, [terminalPanelRef]);

  const handleRunApp = useCallback(() => {
    runAppRef.current?.();
  }, []);

  // Open a file: add to tabs + select it
  const openFile = useCallback((path: string) => {
    if (aiChangedRef.current.includes(path)) writeAiChanged(aiChangedRef.current.filter(f => f !== path));
    setSelectedFile(path);
    setOpenTabs(prev => prev.includes(path) ? prev : [...prev, path]);
  }, [writeAiChanged]);

  // Every exercise opens its default file when nothing else is open (defaultFile in exercise.json, else description.md)
  const openTabsRef = useRef<string[]>([]);
  openTabsRef.current = openTabs;
  const defaultOpenedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!baseKey || !tabsLoaded || defaultOpenedFor.current === baseKey) return;
    const timer = setTimeout(async () => {
      const onlyPreview = !openTabsRef.current.some(t => t !== PREVIEW_TAB);
      const nothingFocused = !selectedFileRef.current || (selectedFileRef.current === PREVIEW_TAB && onlyPreview);
      defaultOpenedFor.current = baseKey;
      if (!nothingFocused || !onlyPreview) return;
      try {
        const [meta, list] = await Promise.all([
          fetch('/api/challenge-meta').then(r => r.json()).catch(() => null),
          fetch('/api/files').then(r => r.json()).catch(() => null),
        ]);
        const paths: string[] = (list?.files ?? []).filter((f: { type: string }) => f.type === 'file').map((f: { path: string }) => f.path);
        const wanted = [meta?.defaultFile, 'description.md', 'EXERCISE.md'].find((f: string | undefined) => f && paths.includes(f));
        const stillEmpty = !openTabsRef.current.some(t => t !== PREVIEW_TAB);
        if (wanted && stillEmpty) openFile(wanted);
      } catch {}
    }, 900);
    return () => clearTimeout(timer);
  }, [baseKey, tabsLoaded, openFile]);


  const removeTab = useCallback((path: string) => {
    setOpenTabs(prev => {
      const next = prev.filter(t => t !== path);
      setSelectedFile(cur => {
        if (cur !== path) return cur;
        const idx = prev.indexOf(path);
        return next[Math.min(idx, next.length - 1)] ?? null;
      });
      return next;
    });
  }, []);

  const closeTab = useCallback((path: string) => {
    removeTab(path);
  }, [removeTab]);
  const closeTabRef = useRef(closeTab);
  closeTabRef.current = closeTab;

  const toggleTerminal = useCallback(() => {
    const panel = terminalPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.expand();
      setTerminalCollapsed(false);
    } else {
      panel.collapse();
      setTerminalCollapsed(true);
    }
  }, [terminalPanelRef]);

  const pinPreview = (pinned: boolean) => {
    if (pinned && selectedFile === PREVIEW_TAB) {
      const next = (lastFileRef.current && openTabs.includes(lastFileRef.current) ? lastFileRef.current : openTabs.find(t => t !== PREVIEW_TAB)) ?? null;
      if (next) setSelectedFile(next);
    }
    setPreviewPinned(pinned);
    if (pinned) setPinnedPreviewCollapsed(false);
    try { if (baseKey) localStorage.setItem(`trio_cc_preview_pinned_${baseKey}`, pinned ? '1' : '0'); } catch {}
  };

  const previewSrcUrl = previewUrl && typeof window !== 'undefined' ? previewSrc(previewUrl, window.location) : previewUrl;

  const previewPaneEl = (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <span className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate flex-1">{previewUrl ?? 'Preview'}</span>
        {previewUrl && (
          <a href={previewSrcUrl ?? previewUrl} target="_blank" rel="noopener noreferrer"
            className="flex-shrink-0 text-xs text-blue-500 hover:text-blue-600 transition-colors">
            <svg className="mr-1 inline h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-6M14 4h6m0 0v6m0-6L10 14" /></svg>New tab
          </a>
        )}
        <button onClick={reloadPreview}
          className="flex-shrink-0 text-xs text-gray-400 hover:text-gray-600 transition-colors" title="Reload preview">↺</button>
        <button onClick={() => pinPreview(!previewPinned)}
          className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded transition-colors ${previewPinned ? 'bg-accent-100 dark:bg-accent-900/40 text-accent-700 dark:text-accent-300' : 'text-gray-400 hover:text-gray-600'}`}
          title={previewPinned ? 'Unpin the preview from the editor' : 'Keep the preview open next to the editor'}>
          <svg className="mr-1 inline h-3 w-3" viewBox="0 0 24 24" fill={previewPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinejoin="round"><path d="M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6zM12 15v6" strokeLinecap="round" /></svg>
          {previewPinned ? 'Unpin' : 'Pin'}
        </button>
      </div>
      {previewUrl ? (
        <iframe
          id="preview-iframe"
          src={previewSrcUrl ?? previewUrl}
          className="flex-1 w-full border-none"
          title="Exercise Preview"
          sandbox="allow-scripts allow-same-origin allow-forms"
        />
      ) : (
        <div className="flex-1 flex items-center justify-center p-6 text-center text-sm text-gray-500 dark:text-gray-400">
          Run the app from the terminal and the preview shows up here.
        </div>
      )}
    </div>
  );

  const codeArea = (
    <div className="relative h-full">
                        {/* Editing overlay, only shown when the agent is actively editing THIS file */}
                        {editingFile && selectedFile && (
                          selectedFile.endsWith(editingFile) || editingFile.endsWith(selectedFile)
                        ) && (
                          <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden">
                            {/* Blurred glass overlay */}
                            <div style={{
                              position: 'absolute', inset: 0,
                              backdropFilter: 'blur(3px) brightness(0.97)',
                              background: 'linear-gradient(135deg, rgba(34,197,94,0.07) 0%, rgba(16,185,129,0.05) 40%, rgba(59,130,246,0.07) 100%)',
                              backgroundSize: '300% 300%',
                              animation: 'trio-edit-gradient 3s ease infinite, trio-edit-border 1.8s ease-in-out infinite',
                            }} />
                            {/* Moving scanline */}
                            <div style={{
                              position: 'absolute', left: 0, right: 0, height: '60px',
                              background: 'linear-gradient(180deg, transparent 0%, rgba(34,197,94,0.08) 50%, transparent 100%)',
                              animation: 'trio-edit-scanline 2s linear infinite',
                              pointerEvents: 'none',
                            }} />
                            {/* Badge */}
                            <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-accent-500 text-white text-[10px] font-semibold px-2.5 py-1 rounded-full shadow-lg">
                              <span className="w-1.5 h-1.5 bg-white rounded-full inline-block" style={{ animation: 'trio-edit-pulse 0.8s ease-in-out infinite' }} />
                              Agent is editing…
                            </div>
                          </div>
                        )}
                        <AiChangesBar
                          changes={aiChanges}
                          filePath={selectedFile === PREVIEW_TAB ? null : selectedFile}
                          handleRef={monacoHandleRef}
                        />
                        <MonacoCodeViewer
                          baseKey={baseKey}
                          filePath={selectedFile === PREVIEW_TAB ? null : selectedFile}
                          readOnly={selectedFile && !interviewerView ? isLockedPath(selectedFile, lockedFiles) : false}
                          onSaveStateChange={setSaveState}
                          onFileRenamed={(newPath) => {
                            setOpenTabs(prev => prev.map(t => t === selectedFile ? newPath : t));
                            setSelectedFile(newPath);
                          }}
                          onRunFile={handleRunFile}
                          runStart={runChallenge?.start}
                          flushRef={monacoFlushRef}
                          aiLocked={aiLocked}
                          reloadRef={monacoReloadRef}
                          handleRef={monacoHandleRef}
                          onRunApp={handleRunApp}
                          onFocusTerminal={handleFocusTerminal}
                        />
    </div>
  );

  // Closing a chat that already has messages asks first
  const requestDeleteThread = (id: string) => {
    let hasMessages = false;
    try {
      const raw = baseKey ? localStorage.getItem(`trio_cc_chat_${baseKey}_${id}`) : null;
      hasMessages = !!raw && JSON.parse(raw).length > 0;
    } catch {}
    if (hasMessages) setPendingThreadClose(id);
    else deleteThread(id);
  };


  // ---- Command palette (Cmd+K), quick open (Cmd+P) and the actions behind them
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<'commands' | 'files'>('commands');
  const [paletteFiles, setPaletteFiles] = useState<string[]>([]);
  const paletteOpenRef = useRef(false);
  paletteOpenRef.current = paletteOpen;

  const openPalette = useCallback((mode: 'commands' | 'files') => {
    setPaletteMode(mode);
    setPaletteOpen(true);
    fetch('/api/files').then(r => r.json()).then(d => {
      const list: string[] = (d.files ?? []).filter((f: { type: string }) => f.type === 'file').map((f: { path: string }) => f.path);
      setPaletteFiles(list);
    }).catch(() => {});
  }, []);

  const togglePanel = useCallback((ref: React.RefObject<PanelImperativeHandle | null>, set: (v: boolean) => void) => {
    pulseLayoutGesture();
    const p = ref.current;
    if (!p) return;
    if (p.isCollapsed()) { p.expand(); set(false); } else { p.collapse(); set(true); }
  }, []);

  const showPanel = useCallback((ref: React.RefObject<PanelImperativeHandle | null>, set: (v: boolean) => void) => {
    pulseLayoutGesture();
    const p = ref.current;
    if (p?.isCollapsed()) { p.expand(); set(false); }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.altKey) return;
      const key = e.key.toLowerCase();
      const stop = () => { e.preventDefault(); e.stopPropagation(); };
      if ((key === 'k' && !e.shiftKey) || (key === 'p' && e.shiftKey)) { stop(); if (paletteOpenRef.current) setPaletteOpen(false); else openPalette('commands'); }
      else if (key === 'p') { stop(); if (paletteOpenRef.current) setPaletteOpen(false); else openPalette('files'); }
      else if (key === 'b' && !e.shiftKey) { stop(); togglePanel(filesPanelRef, setFilesCollapsed); }
    };
    // Capture phase, so it wins over Monaco and the terminal
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [openPalette, togglePanel, filesPanelRef]);

  const isMacPalette = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');
  const mod = isMacPalette ? '⌘' : 'Ctrl';

  const focusTerminal = useCallback(() => {
    showPanel(terminalPanelRef, setTerminalCollapsed);
    setTimeout(() => runAction('terminal:focus-input'), 120);
  }, [showPanel, terminalPanelRef]);
  const focusChat = useCallback(() => {
    showPanel(chatPanelRef, setChatCollapsed);
    setTimeout(() => runAction('chat:focus'), 120);
  }, [showPanel, chatPanelRef]);

  const tabsOnly = openTabs;
  const cycleFileTab = useCallback((dir: 1 | -1) => {
    if (tabsOnly.length === 0) return;
    const i = selectedFile ? tabsOnly.indexOf(selectedFile) : -1;
    setSelectedFile(tabsOnly[(i + dir + tabsOnly.length) % tabsOnly.length]);
  }, [tabsOnly, selectedFile]);
  const cycleChat = useCallback((dir: 1 | -1) => {
    if (threads.length === 0) return;
    const i = threads.findIndex(t => t.id === activeThreadId);
    setActiveThreadId(threads[(i + dir + threads.length) % threads.length].id);
  }, [threads, activeThreadId, setActiveThreadId]);

  const paletteActions: PaletteAction[] = useMemo(() => {
    const fileLabel = selectedFile && selectedFile !== PREVIEW_TAB ? selectedFile : null;
    const a = (id: string, category: string, title: string, run: () => void, extra: Partial<PaletteAction> = {}): PaletteAction => ({ id, category, title, run, ...extra });
    const list: PaletteAction[] = [
      // Focus
      a('focus-chat', 'Focus', 'Focus the AI chat input', focusChat, { keywords: 'agent assistant claude ask' }),
      a('focus-terminal', 'Focus', 'Focus the terminal', focusTerminal, { shortcut: ['Shift', 'Esc'], keywords: 'shell console' }),
      a('focus-editor', 'Focus', 'Focus the editor', () => runAction('editor:focus')),
      a('focus-preview', 'Focus', 'Focus on the preview', () => { if (previewUrl) { setOpenTabs(p => p.includes(PREVIEW_TAB) ? p : [PREVIEW_TAB, ...p]); setSelectedFile(PREVIEW_TAB); } }, { keywords: 'app browser' }),
      // Panels
      a('toggle-sidebar', 'View', 'Toggle the file sidebar', () => togglePanel(filesPanelRef, setFilesCollapsed), { shortcut: [mod, 'B'], keywords: 'files explorer hide show' }),
      a('toggle-terminal', 'View', 'Toggle the terminal panel', () => toggleTerminal(), { keywords: 'hide show console' }),
      a('help', 'Help', 'Open the help', () => runAction('help:open'), { keywords: 'guide docs team contact wizard' }),
      a('toggle-chat', 'View', 'Toggle the AI chat panel', () => togglePanel(chatPanelRef, setChatCollapsed), { keywords: 'agent assistant hide show' }),
      a('show-all-panels', 'View', 'Show every panel', () => { showPanel(filesPanelRef, setFilesCollapsed); showPanel(terminalPanelRef, setTerminalCollapsed); showPanel(chatPanelRef, setChatCollapsed); }, { keywords: 'reset layout expand' }),
      a('toggle-theme', 'View', 'Switch between light and dark mode', () => runAction('view:theme'), { keywords: 'theme appearance' }),
      a('toggle-cursors', 'View', interviewerView ? "Show or hide the candidate's cursor" : "Show or hide the interviewer's cursor", () => runAction('view:cursors'), { keywords: 'mouse presence' }),
      a('toggle-follow', 'View', 'Turn Follow on or off', () => runAction('view:follow'), { keywords: 'mirror navigation' }),
      a('palette-self', 'Help', 'Command palette (this one)', () => openPalette('commands'), { shortcut: [mod, 'K'] }),
      a('shortcuts', 'Help', 'Show shortcuts and commands', () => setShowShortcuts(true), { shortcut: ['?'], keywords: 'help keyboard terminal commands' }),
      // Files
      a('new-file', 'Files', 'New file', () => { showPanel(filesPanelRef, setFilesCollapsed); runAction('files:new-file'); }, { keywords: 'create add' }),
      a('new-folder', 'Files', 'New folder', () => { showPanel(filesPanelRef, setFilesCollapsed); runAction('files:new-folder'); }, { keywords: 'create add directory' }),
      a('rename-file', 'Files', fileLabel ? `Rename ${fileLabel}` : 'Rename the current file', () => runAction('files:rename')),
      a('collapse-folders', 'Files', 'Collapse all folders', () => runAction('files:collapse-all')),
      a('quick-open', 'Files', 'Go to file...', () => openPalette('files'), { shortcut: [mod, 'P'], keywords: 'open find' }),
      a('save', 'Files', 'Save the current file', () => runAction('editor:save'), { shortcut: [mod, 'S'] }),
      a('reload-file', 'Files', 'Reload the current file from disk', () => runAction('editor:reload')),
      a('copy-path', 'Files', 'Copy the current file path', () => { if (fileLabel) navigator.clipboard?.writeText(fileLabel).catch(() => {}); }),
      a('next-tab', 'Tabs', 'Next file tab', () => cycleFileTab(1)),
      a('prev-tab', 'Tabs', 'Previous file tab', () => cycleFileTab(-1)),
      a('close-tab', 'Tabs', fileLabel ? `Close ${fileLabel}` : 'Close the current tab', () => { if (selectedFile) closeTab(selectedFile); }),
      a('close-other-tabs', 'Tabs', 'Close the other tabs', () => { if (selectedFile) setOpenTabs(p => p.filter(t => t === selectedFile)); }),
      // Editor
      a('editor-find', 'Editor', 'Find in file', () => runAction('editor:action', 'actions.find'), { shortcut: [mod, 'F'] }),
      a('editor-replace', 'Editor', 'Find and replace in file', () => runAction('editor:action', 'editor.action.startFindReplace'), { shortcut: isMacPalette ? ['⌥', '⌘', 'F'] : ['Ctrl', 'H'] }),
      a('editor-goto-line', 'Editor', 'Go to line...', () => runAction('editor:action', 'editor.action.gotoLine'), { keywords: 'jump', shortcut: ['Ctrl', 'G'] }),
      a('editor-format', 'Editor', 'Format the document', () => runAction('editor:action', 'editor.action.formatDocument'), { keywords: 'prettier indent', shortcut: ['Shift', 'Alt', 'F'] }),
      a('editor-comment', 'Editor', 'Toggle line comment', () => runAction('editor:action', 'editor.action.commentLine'), { shortcut: [mod, '/'] }),
      a('editor-fold-all', 'Editor', 'Fold all', () => runAction('editor:action', 'editor.foldAll')),
      a('editor-unfold-all', 'Editor', 'Unfold all', () => runAction('editor:action', 'editor.unfoldAll')),
      a('editor-zoom-in', 'Editor', 'Increase editor font size', () => runAction('editor:action', 'editor.action.fontZoomIn')),
      a('editor-zoom-out', 'Editor', 'Decrease editor font size', () => runAction('editor:action', 'editor.action.fontZoomOut')),
      a('editor-wrap', 'Editor', 'Toggle word wrap', () => runAction('editor:action', 'editor.action.toggleWordWrap'), { shortcut: ['Alt', 'Z'] }),
      // Run
      a('run-app', 'Run', 'Run the app', () => runAction('app:run'), { shortcut: [mod, 'Enter'], keywords: 'start dev server' }),
      a('reload-preview', 'Run', 'Reload the preview', reloadPreview, { shortcut: ['Ctrl', 'R'], keywords: 'refresh app' }),
      a('stop-app', 'Run', 'Stop the running app', () => runAction('app:stop'), { keywords: 'kill' }),
      a('restart-app', 'Run', 'Restart the app', () => { runAction('app:stop'); setTimeout(() => runAction('app:run'), 1500); }),
      a('run-file', 'Run', fileLabel ? `Run ${fileLabel}` : 'Run the current file', () => runAction('editor:run')),
      // Terminal
      a('new-terminal', 'Terminal', 'New terminal', () => { showPanel(terminalPanelRef, setTerminalCollapsed); runAction('terminal:new'); setTimeout(() => runAction('terminal:focus-input'), 200); }, { keywords: 'open tab shell' }),
      a('close-terminal', 'Terminal', 'Close the current terminal', () => runAction('terminal:close')),
      a('next-terminal', 'Terminal', 'Next terminal', () => runAction('terminal:next')),
      a('prev-terminal', 'Terminal', 'Previous terminal', () => runAction('terminal:prev')),
      a('clear-terminal', 'Terminal', 'Clear the terminal', () => runAction('terminal:clear'), { shortcut: ['Ctrl', 'L'] }),
      // Preview
      a('open-preview-tab', 'Preview', 'Open the preview in a new browser tab', () => { if (previewUrl) window.open(previewSrc(previewUrl, window.location), '_blank', 'noopener'); }),
      a('copy-preview-url', 'Preview', 'Copy the preview URL', () => { if (previewUrl) navigator.clipboard?.writeText(previewSrc(previewUrl, window.location)).catch(() => {}); }),
      a('pin-preview', 'Preview', previewPinned ? 'Unpin the preview' : 'Pin the preview next to the editor', () => pinPreview(!previewPinned)),
      // AI chat
      a('chat-new', 'AI chat', 'New chat', () => { showPanel(chatPanelRef, setChatCollapsed); runAction('chat:new'); setTimeout(() => runAction('chat:focus'), 250); }, { keywords: 'agent conversation' }),
      a('chat-close', 'AI chat', 'Close the current chat', () => runAction('chat:close')),
      a('chat-rename', 'AI chat', 'Rename the current chat', () => runAction('chat:rename')),
      a('chat-next', 'AI chat', 'Next chat', () => cycleChat(1)),
      a('chat-prev', 'AI chat', 'Previous chat', () => cycleChat(-1)),
      a('chat-clear', 'AI chat', 'Clear the current chat', () => runAction('chat:clear'), { shortcut: ['/clear'] }),
      a('chat-stop', 'AI chat', 'Stop the AI answer', () => runAction('chat:stop'), { keywords: 'cancel', shortcut: ['/stop'] }),
      a('chat-plan', 'AI chat', 'Plan first mode (Opus)', () => runAction('chat:plan'), { keywords: 'planning ask questions', shortcut: ['/plan'] }),
      a('chat-instant', 'AI chat', 'Instant mode (Sonnet)', () => runAction('chat:instant'), { keywords: 'execute act', shortcut: ['/instant'] }),
      a('chat-compact', 'AI chat', 'Compact the conversation (free up context)', () => runAction('chat:compact'), { keywords: 'summarize tokens', shortcut: ['/compact'] }),
      a('chat-undo', 'AI chat', 'Undo the last AI file changes', () => runAction('chat:undo'), { keywords: 'revert', shortcut: ['/undo'] }),
      ...fileLabel ? [
        a('ask-explain', 'AI chat', `Ask the AI to explain ${fileLabel}`, () => { focusChat(); setTimeout(() => runAction('chat:prefill', `Explain how ${fileLabel} works, step by step.`), 200); }),
        a('ask-review', 'AI chat', `Ask the AI to review ${fileLabel}`, () => { focusChat(); setTimeout(() => runAction('chat:prefill', `Review ${fileLabel}: bugs, edge cases and readability.`), 200); }),
        a('ask-tests', 'AI chat', `Ask the AI to write tests for ${fileLabel}`, () => { focusChat(); setTimeout(() => runAction('chat:prefill', `Write tests for ${fileLabel} covering the edge cases.`), 200); }),
      ] : [],
      ...MODELS.map(m => a(`model-${m.key}`, 'AI model', `Use ${m.label}`, () => runAction('chat:model', m.key), { keywords: `model switch ${m.key} ${m.group}` })),
      // Session
      ...(interviewerView ? [
        a('reveal-all', 'Interviewer', 'Reveal every hidden file to the candidate', () => runAction('files:reveal-all'), { keywords: 'phases show' }),
        a('switch-candidate', 'Interviewer', 'Switch candidate', () => runAction('session:switch')),
      ] : []),
      // Switch to an open tab / chat
      ...openTabs.map(t => a(`tab-${t}`, 'Go to tab', t === PREVIEW_TAB ? 'Preview' : t, () => setSelectedFile(t), { keywords: 'switch tab' })),
      ...threads.map(t => a(`thread-${t.id}`, 'Go to chat', t.title, () => { focusChat(); setActiveThreadId(t.id); }, { keywords: 'switch chat agent' })),
      // Files for Go to file
      ...paletteFiles.map(f => a(`file-${f}`, 'File', f, () => openFile(f), { fileMode: true })),
    ];
    return list;
  }, [selectedFile, previewUrl, previewPinned, interviewerView, openTabs, threads, paletteFiles, mod, focusChat, focusTerminal, togglePanel, showPanel, cycleFileTab, cycleChat, openFile, closeTab, setActiveThreadId, filesPanelRef, chatPanelRef, terminalPanelRef, toggleTerminal, openPalette]);

  // Typing a file name in the command palette also finds files
  const paletteWithFiles = useMemo(() => (
    paletteMode === 'commands'
      ? [...paletteActions, ...paletteFiles.map(f => ({ id: `open-${f}`, category: 'Open file', title: f, run: () => openFile(f) } as PaletteAction))]
      : paletteActions
  ), [paletteActions, paletteFiles, paletteMode, openFile]);

  if (!sessionReady) {
    return (
      <WelcomeScreen
        startAsInterviewer={startAsInterviewer}
        onReady={async (name, isNew) => {
          // Force candidateName into the hook immediately (bypasses stale localStorage read)
          setActiveName(name);
          if (isNew) {
            createCandidate(name).catch(() => {});
          }
          // The exercise id of this session decides which saved state to load, never trust the one cached in the browser
          try {
            const meta = await fetch('/api/challenge-meta').then(r => r.json());
            if (meta?.exerciseId) setCurrentExerciseId(meta.exerciseId);
          } catch {}
          setSessionReady(true);
        }}
      />
    );
  }

  if (!baseKey) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-accent-500 border-r-transparent" />
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">Opening the workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden">
      {showEditName && candidateName && (
        <EditNameModal currentName={candidateName} onSave={handleEditName}
          onCancel={() => setShowEditName(false)} isLoading={false} error={null} />
      )}

      <Header isConnected={isConnected && collabOpen} inactive={!sessionStatus.isActive} onResolveInactive={() => setConfirmInactive(true)} exerciseTitle={exerciseTitle}
        candidateName={candidateName} onEditName={() => setShowEditName(true)}
        interviewerView={interviewerView} onSwitchCandidate={switchCandidate} onGoHome={() => setConfirmHome(true)}
        onSave={async () => {
          // Flush Monaco's latest content immediately before saving to .solutions/
          await monacoFlushRef.current?.();
          await triggerManualSave();
        }}
        saveState={saveState}
        onShowShortcuts={() => setShowShortcuts(true)} />

      {showShortcuts && <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />}
      <CommandPalette open={paletteOpen} mode={paletteMode} actions={paletteWithFiles} onClose={() => setPaletteOpen(false)} />

      {confirmChangeAssistant && (
        <ConfirmDialog
          title="Choose another assistant?"
          message="The one you are using now stops. You can pick it again later and keep working."
          confirmLabel="Choose another"
          onConfirm={() => { setConfirmChangeAssistant(false); agentMode.reset(); }}
          onCancel={() => setConfirmChangeAssistant(false)}
        />
      )}

      {confirmInactive && (
        <ConfirmDialog
          title="This session is not the active one"
          message={interviewerView && sessionStatus.active
            ? `The interview is now on ${sessionStatus.active}. Switch to ${sessionStatus.active}?`
            : 'The interview is on another session right now, so this one is paused. Leave it and go back to the home page? Your work stays saved.'}
          confirmLabel={interviewerView && sessionStatus.active ? `Switch to ${sessionStatus.active}` : 'Leave this session'}
          onCancel={() => setConfirmInactive(false)}
          onConfirm={resolveInactive}
        />
      )}

      {confirmHome && (
        <ConfirmDialog
          title="Go back to the home page?"
          message="You will pick again between the web interface and your own IDE. Your work stays saved."
          confirmLabel="Go to the home page"
          onCancel={() => setConfirmHome(false)}
          onConfirm={goHome}
        />
      )}

      {pendingThreadClose && (
        <ConfirmDialog
          title="Close this chat?"
          message="This conversation has messages. You can bring it back from the closed chats list, but the AI session will start fresh."
          confirmLabel="Close chat"
          danger
          onCancel={() => setPendingThreadClose(null)}
          onConfirm={() => { deleteThread(pendingThreadClose); setPendingThreadClose(null); }}
        />
      )}

      <div className="relative flex flex-1 overflow-hidden"
        onDragStartCapture={(e) => { if (e.isTrusted) stopFollowing(); }}
        onClickCapture={(e) => {
          // A real click on any tab (files, terminals, chats) is the user navigating on their own
          if (e.isTrusted && (e.target as HTMLElement).closest?.('[role="tab"]')) stopFollowing();
        }}>
        {following && (
          // A frame around the whole workspace (files, editor, preview, chat) while Follow is on
          <div data-testid="follow-frame" className="pointer-events-none absolute inset-0 z-30 rounded-sm border-2 border-pink-500">
            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-t-md bg-pink-500 px-2 py-0.5 text-[11px] font-semibold text-white shadow">
              Following the {interviewerView ? 'candidate' : 'interviewer'}
            </span>
          </div>
        )}
        <Group orientation="horizontal" className="flex-1 flex" groupRef={outerGroupRef} onLayoutChanged={(l) => saveSizes('outer', l)}>

          {/* Left: File Explorer */}
          <Panel id="files" defaultSize="18%" minSize="3%" collapsible collapsedSize="3%"
            panelRef={filesPanelRef} onResize={handleFilesResize}>
            {filesCollapsed
              ? <CollapsedFiles onExpand={() => { filesPanelRef.current?.expand(); setFilesCollapsed(false); }} />
              : <FileExplorerNew
                    baseKey={baseKey}
                    onFileSelect={openFile}
                    hasSelection={() => selectedFileRef.current !== null}
                    selectedFile={selectedFile}
                    aiChangedFiles={aiChanged}
                    onFileMoved={(from, to) => {
                      const remap = (p: string) => remapPath(p, from, to);
                      setOpenTabs(prev => prev.map(remap));
                      setSelectedFile(cur => (cur ? remap(cur) : cur));
                    }}
                    onLockedFilesLoaded={(locked, exerciseId) => {
                      setLockedFiles(locked);
                      if (exerciseId) setCurrentExerciseId(exerciseId);
                    }}
                  />
            }
          </Panel>

          <HSep panelRef={filesPanelRef} collapsed={filesCollapsed} setCollapsed={setFilesCollapsed} side="left" />

          {/* Center: Editor + Terminal */}
          <Panel id="main" defaultSize="52%" minSize="10%">
            <Group orientation="vertical" className="h-full flex flex-col" groupRef={mainGroupRef} onLayoutChanged={(l) => saveSizes('main', l)}>
              <Panel id="editor" defaultSize="70%" minSize="8%">
                <div className="flex flex-col h-full">
                  <FileTabBar
                    tabs={openTabs}
                    selectedTab={selectedFile}
                    onSelect={(p) => setSelectedFile(p)}
                    onClose={closeTab}
                    onReorder={(newOrder) => setOpenTabs(newOrder)}
                    lockedFiles={lockedFiles}
                  />
                  <div className="relative flex-1 min-h-0">
                    <MainPane
                      codeArea={codeArea}
                      previewPaneEl={previewPaneEl}
                      previewUrl={previewUrl}
                      selectedFile={selectedFile}
                      previewPinned={previewPinned}
                      pinnedPreviewRef={pinnedPreviewRef}
                      pinnedPreviewCollapsed={pinnedPreviewCollapsed}
                      setPinnedPreviewCollapsed={setPinnedPreviewCollapsed}
                      pinnedGroupRef={pinnedGroupRef}
                      onPinnedLayout={(l) => saveSizes('pinned', l)}
                    />
                  </div>
                </div>
              </Panel>
              <VSep panelRef={terminalPanelRef} collapsed={terminalCollapsed} setCollapsed={setTerminalCollapsed} />
              <Panel id="terminal" defaultSize="30%" minSize="4%" collapsible collapsedSize="4%"
                panelRef={terminalPanelRef} onResize={handleTerminalResize}>
                <TerminalManager
                  key={baseKey ?? 'pending'}
                  collapsed={terminalCollapsed}
                  onToggle={toggleTerminal}
                  sessionKey={baseKey}
                  onRunReady={(runFn: (cmd: string) => void) => {
                    runAppRef.current = () => {
                      if (runChallenge?.start) {
                        runFn(runChallenge.start);
                      }
                    };
                  }}
                  pendingCommand={pendingRunCmd}
                  onCommandExecuted={() => setPendingRunCmd(null)}
                  onPreviewUrl={(url) => {
                    setPreviewUrl(url);
                    try { sessionStorage.setItem('trio_cc_preview_url', url); } catch {}
                    setOpenTabs(prev => prev.includes(PREVIEW_TAB) ? prev : [PREVIEW_TAB, ...prev]);
                    setPreviewFlash(true);
                    setTimeout(() => setPreviewFlash(false), 4000);
                    // The app this person just started is up: show it (not for replays or when the preview is pinned anyway)
                    if (Date.now() - focusPreviewAskedAt.current < 120000 && !previewPinnedRef.current) {
                      focusPreviewAskedAt.current = 0;
                      setSelectedFile(PREVIEW_TAB);
                    }
                  }}
                  onAppStarted={() => { focusPreviewAskedAt.current = Date.now(); }}
                  runChallenge={runChallenge}
                  previewAvailable={!!runChallenge?.port}
                  previewActive={selectedFile === PREVIEW_TAB}
                  previewFlash={previewFlash}
                  hasPreviewUrl={!!previewUrl}
                  onOpenPreview={() => {
                    setOpenTabs(prev => prev.includes(PREVIEW_TAB) ? prev : [PREVIEW_TAB, ...prev]);
                    setSelectedFile(PREVIEW_TAB);
                  }}
                />
              </Panel>
            </Group>
          </Panel>

          <HSep panelRef={chatPanelRef} collapsed={chatCollapsed} setCollapsed={setChatCollapsed} side="right" />

          {/* Right: AI Chat */}
          <Panel id="chat" defaultSize="30%" minSize="3%" collapsible collapsedSize="3%"
            panelRef={chatPanelRef} onResize={handleChatResize}>
            <div className="relative h-full">
            {aiStatus.ok === false && !chatCollapsed && agentMode.mode === 'agent' && (
              <AiUnavailable interviewer={interviewerView} message={aiStatus.message} onRecheck={recheckAi} />
            )}
            {chatCollapsed
              ? <CollapsedChat onExpand={() => { chatPanelRef.current?.expand(); setChatCollapsed(false); }} />
              : agentMode.mode === null
              ? <AgentModePicker canChoose={agentMode.canChoose} tools={agentMode.tools} onChoose={agentMode.choose} onRecheck={agentMode.recheck} />
              : agentMode.mode === 'claude-code' || agentMode.mode === 'opencode'
              ? <AgentTerminal interviewer={interviewerView} tool={agentMode.mode} onChange={() => setConfirmChangeAssistant(true)} />
              : <ChatInterface
                    chatKey={activeChatKey}
                    files={projectFiles}
                    aiChanges={aiChanges}
                    onOpenFile={openFile}
                    messages={messages}
                    onSendMessage={async (msg, openFile, plan) => {
                      // What was typed before the agent starts must reach the disk first, so the agent works on it
                      await monacoFlushRef.current?.();
                      // Auto-title thread from first user message
                      if (messages.filter(m => m.role === 'user').length === 0 && activeThread) {
                        autoTitleThread(activeThread.id, msg);
                        const threadId = activeThread.id;
                        fetch('/api/chat/title', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ message: msg }),
                        }).then(r => r.json()).then(d => applyGeneratedTitle(threadId, d.title || '')).catch(() => {});
                      }
                      // The open terminals go along quietly, so "check my terminal" can be answered from what they printed
                      let terminals: { tabs: Array<{ id: string; label: string }>; active?: string } | undefined;
                      try {
                        const saved = JSON.parse(localStorage.getItem(`trio_cc_term_tabs_${baseKey}`) ?? 'null');
                        if (Array.isArray(saved?.tabs)) terminals = { tabs: saved.tabs.map((t: { id: string; label: string }) => ({ id: t.id, label: t.label })), active: saved.activeTabId };
                      } catch {}
                      sendMessage(msg, openFile, plan, terminals);
                    }}
                    isThinking={isThinking}
                    onClearChat={clearHistory}
                    onStop={stopCurrent}
                    selectedModel={selectedModel}
                    contextTokens={contextTokens}
                    totalTokens={totalTokens}
                    onCommand={runCommand}
                    onModelChange={(model) => {
                      setSelectedModel(model);
                      if (activeThread) setThreadModel(activeThread.id, model);
                    }}
                    currentFile={selectedFile && selectedFile !== PREVIEW_TAB ? selectedFile : null}
                    threads={threads}
                    closedThreads={closedThreads}
                    unreadThreadIds={unreadThreadIds}
                    activeThreadId={activeThreadId}
                    onSelectThread={setActiveThreadId}
                    onCreateThread={createThread}
                    onDeleteThread={requestDeleteThread}
                    onRenameThread={renameThread}
                    onRestoreThread={restoreThread}
                    onReorderThreads={reorderThreads}
                    onThreadModelChange={(id, model) => {
                      setThreadModel(id, model);
                      if (id === activeThreadId) setSelectedModel(model);
                    }}
                  />
            }
            </div>
          </Panel>

        </Group>
      </div>
    </div>
  );
}

export default function InterviewPage() {
  return (
    <ThemeProvider>
      <InterviewPageContent />
    </ThemeProvider>
  );
}
