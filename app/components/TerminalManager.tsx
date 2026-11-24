'use client';

import { activateOnKey } from '../lib/a11y';
import { useState, useCallback, useRef, useEffect } from 'react';
import { nanoid } from 'nanoid';
import { Terminal } from './Terminal';
import { ConfirmDialog } from './ConfirmDialog';
import { useRemoteKey } from '../hooks/useRemoteKey';
import { isFollowing, isRestoringView, registerViewSnapshot } from '../lib/follow';
import { useAction } from '../lib/actions';

interface TerminalTab {
  id: string;
  label: string;
}

interface TerminalManagerProps {
  collapsed: boolean;
  onToggle: () => void;
  onRunReady?: (fn: (cmd: string) => void) => void;
  pendingCommand?: string | null;
  onCommandExecuted?: () => void;
  onPreviewUrl?: (url: string) => void;
  onAppStarted?: () => void;
  runChallenge?: { start: string; description: string; port: number | null } | null;
  previewAvailable?: boolean;
  previewActive?: boolean;
  previewFlash?: boolean;
  hasPreviewUrl?: boolean;
  onOpenPreview?: () => void;
  /** Stable key (candidateName_exerciseId) for persisting tabs */
  sessionKey?: string;
}

function loadTerminalTabs(sessionKey: string): { tabs: TerminalTab[]; activeTabId: string } | null {
  try {
    const stored = localStorage.getItem(`trio_cc_term_tabs_${sessionKey}`);
    if (stored) return JSON.parse(stored);
  } catch {}
  return null;
}

function saveTerminalTabs(sessionKey: string, tabs: TerminalTab[], activeTabId: string) {
  try {
    localStorage.setItem(`trio_cc_term_tabs_${sessionKey}`, JSON.stringify({ tabs, activeTabId }));
  } catch {}
}

function nextRunningTab(previous: string | null, isApp: boolean, tabId: string): string | null {
  if (isApp) return tabId;
  return previous === tabId ? null : previous;
}

export function TerminalManager(props: TerminalManagerProps) {
  const { runChallenge, onToggle, sessionKey } = props;
  const firstTabId = useRef(nanoid());

  const [tabs, setTabs] = useState<TerminalTab[]>(() => {
    if (typeof window === 'undefined' || !sessionKey) return [{ id: firstTabId.current, label: 'Terminal 1' }];
    const saved = loadTerminalTabs(sessionKey);
    if (saved?.tabs?.length) { firstTabId.current = saved.tabs[0].id; return saved.tabs; }
    return [{ id: firstTabId.current, label: 'Terminal 1' }];
  });

  // Tabs where a command has been typed, closing those asks for confirmation
  const [usedTabs, setUsedTabs] = useState<Record<string, boolean>>({});
  const [pendingClose, setPendingClose] = useState<string | null>(null);
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  const [dragOverTab, setDragOverTab] = useState<string | null>(null);
  const moveTab = (fromId: string, toId: string) => {
    setTabs(prev => {
      const from = prev.findIndex(t => t.id === fromId);
      const to = prev.findIndex(t => t.id === toId);
      if (from < 0 || to < 0 || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const [activeTabId, setActiveTabId] = useState<string>(() => {
    if (typeof window === 'undefined' || !sessionKey) return firstTabId.current;
    const saved = loadTerminalTabs(sessionKey);
    return saved?.activeTabId || firstTabId.current;
  });

  // Reload tabs when sessionKey changes (different candidate/exercise)
  const prevSessionKey = useRef(sessionKey);
  useEffect(() => {
    if (!sessionKey || sessionKey === prevSessionKey.current) return;
    prevSessionKey.current = sessionKey;
    const saved = loadTerminalTabs(sessionKey);
    if (saved?.tabs?.length) {
      setTabs(saved.tabs);
      setActiveTabId(saved.activeTabId || saved.tabs[0].id);
    } else {
      const fresh = { id: nanoid(), label: 'Terminal 1' };
      setTabs([fresh]);
      setActiveTabId(fresh.id);
    }
  }, [sessionKey]);

  // A terminal tab opened, closed or selected on the other screen
  useRemoteKey(sessionKey ? `trio_cc_term_tabs_${sessionKey}` : undefined, (value) => {
    try {
      const saved = value ? JSON.parse(value) : null;
      if (!saved?.tabs?.length) return;
      // Turning Follow off puts back the terminal that was in front; the terminals opened meanwhile stay
      if (isRestoringView()) {
        setActiveTabId(cur => (tabs.some(t => t.id === saved.activeTabId) ? saved.activeTabId : cur));
        return;
      }
      setTabs(saved.tabs);
      // Terminals that exist are always shared; which one is focused follows the other person only with Follow on
      if (isFollowing()) setActiveTabId(saved.activeTabId || saved.tabs[0].id);
      else setActiveTabId(cur => (saved.tabs.some((t: { id: string }) => t.id === cur) ? cur : saved.tabs[0].id));
    } catch {}
  });

  // The key in storage is overwritten by the other screen; the terminals this screen really has, and the one in front, come from here
  const viewRef = useRef({ tabs, activeTabId });
  viewRef.current = { tabs, activeTabId };
  useEffect(() => {
    if (!sessionKey) return;
    return registerViewSnapshot(() => ({ [`trio_cc_term_tabs_${sessionKey}`]: JSON.stringify(viewRef.current) }));
  }, [sessionKey]);

  // Persist tabs whenever they change
  useEffect(() => {
    if (!sessionKey) return;
    saveTerminalTabs(sessionKey, tabs, activeTabId);
  }, [tabs, activeTabId, sessionKey]);
  // Which tab is running the app (null = nothing running)
  const [runningTabId, setRunningTabId] = useState<string | null>(null);
  // Per-tab run functions registered by Terminal instances
  const runFnsRef = useRef<Record<string, (cmd: string) => void>>({});
  // Per-tab stop functions
  const stopFnsRef = useRef<Record<string, () => void>>({});
  // Per-tab clear functions
  const clearFnsRef = useRef<Record<string, () => void>>({});

  const addTab = useCallback(() => {
    const num = tabs.length + 1;
    const tab: TerminalTab = { id: nanoid(), label: `Terminal ${num}` };
    setTabs(prev => [...prev, tab]);
    setActiveTabId(tab.id);
  }, [tabs.length]);

  const closeTab = useCallback((id: string) => {
    fetch('/api/terminal/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tab: id }),
    }).catch(() => {});
    setTabs(prev => {
      if (prev.length === 1) return prev;
      const next = prev.filter(t => t.id !== id);
      setActiveTabId(cur => cur === id ? next[next.length - 1].id : cur);
      if (runningTabId === id) setRunningTabId(null);
      return next;
    });
    delete runFnsRef.current[id];
    delete stopFnsRef.current[id];
    delete clearFnsRef.current[id];
  }, [runningTabId]);

  const handleRun = useCallback(() => {
    if (!runChallenge?.start) return;
    const targetTabId = activeTabId;
    const runFn = runFnsRef.current[targetTabId];
    if (!runFn) return;
    setRunningTabId(targetTabId); // set immediately so UI updates right away
    runFn(runChallenge.start);
  }, [activeTabId, runChallenge]);

  const handleStop = useCallback(async () => {
    try {
      await fetch('/api/terminal/stop', { method: 'POST' });
    } catch {}
    setRunningTabId(null);
  }, []);

  const handleClear = useCallback(() => {
    clearFnsRef.current[activeTabId]?.();
  }, [activeTabId]);

  const requestCloseActive = () => {
    if (tabs.length < 2) return;
    if (usedTabs[activeTabId]) setPendingClose(activeTabId);
    else closeTab(activeTabId);
  };
  const cycleTab = (dir: 1 | -1) => {
    const i = tabs.findIndex(t => t.id === activeTabId);
    setActiveTabId(tabs[(i + dir + tabs.length) % tabs.length].id);
  };
  useAction('terminal:new', () => addTab());
  useAction('terminal:close', () => requestCloseActive());
  useAction('terminal:next', () => cycleTab(1));
  useAction('terminal:prev', () => cycleTab(-1));
  useAction('terminal:clear', () => handleClear());
  useAction('app:run', () => handleRun());
  useAction('app:stop', () => { void handleStop(); });
  useAction('terminal:focus-input', () => {
    const panes = document.querySelectorAll<HTMLElement>('[data-terminal-pane]');
    const active = Array.from(panes).find(p => p.dataset.terminalPane === activeTabId);
    active?.querySelector<HTMLTextAreaElement>('textarea.xterm-helper-textarea')?.focus();
  });

  if (props.collapsed) {
    return (
      <button
        onClick={onToggle}
        className="w-full h-full flex items-center px-4 space-x-2 bg-gray-900 dark:bg-gray-950 border-t border-gray-700 hover:bg-gray-800 transition-colors"
      >
        <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="text-xs text-gray-400 font-mono">Terminal</span>
      </button>
    );
  }

  const isRunning = runningTabId !== null;
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar + controls */}
      <div className="flex items-center bg-gray-800 dark:bg-gray-900 border-t border-gray-700 flex-shrink-0 min-h-[30px]">
        {/* Tabs */}
        <div className="flex items-center flex-1 overflow-x-auto min-w-0">
          {tabs.map(tab => (
            <div
              key={tab.id}
              role="tab"
              tabIndex={0}
              aria-selected={tab.id === activeTabId}
              onClick={() => setActiveTabId(tab.id)}
              onKeyDown={activateOnKey(() => setActiveTabId(tab.id))}
              draggable
              onDragStart={(e) => {
                setDraggedTab(tab.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                if (draggedTab && draggedTab !== tab.id) {
                  e.preventDefault();
                  setDragOverTab(tab.id);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedTab && draggedTab !== tab.id) {
                  moveTab(draggedTab, tab.id);
                }
                setDraggedTab(null);
                setDragOverTab(null);
              }}
              onDragEnd={() => {
                setDraggedTab(null);
                setDragOverTab(null);
              }}
              className={`${draggedTab === tab.id ? 'opacity-50 ' : ''}${dragOverTab === tab.id ? 'border-l-2 border-l-blue-500 ' : ''}group relative flex items-center gap-1 px-3 py-1 text-xs cursor-pointer select-none flex-shrink-0 transition-colors ${
                tab.id === activeTabId
                  ? 'bg-gray-900 dark:bg-gray-950 text-green-400 border-t-2 border-accent-500'
                  : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200 border-t-2 border-transparent'
              }`}
            >
              {/* Running indicator on tab */}
              {tab.id === runningTabId && (
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse flex-shrink-0" />
              )}
              <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3" />
              </svg>
              <span className="font-mono">{tab.label}</span>
              {tabs.length > 1 && (
                <button
                  onClick={e => { e.stopPropagation(); if (usedTabs[tab.id]) setPendingClose(tab.id); else closeTab(tab.id); }}
                  className="ml-1 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
                >
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
          {/* New terminal tab */}
          <button
            onClick={addTab}
            title="New terminal"
            className="flex-shrink-0 px-2 py-1 text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* Right controls: Run/Stop + Clear + Collapse */}
        <div className="flex items-center gap-1 px-2 flex-shrink-0">
          {runChallenge?.start && (
            isRunning ? (
              <button
                onClick={handleStop}
                className="flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-red-600/80 hover:bg-red-600 text-white transition-colors font-medium"
                title="Stop running app"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
                Stop
              </button>
            ) : (
              <button
                onClick={handleRun}
                className="flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-green-600/80 hover:bg-green-600 text-white font-medium transition-colors"
                title={runChallenge.description || 'Run app'}
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"/></svg>
                Run
                <kbd className="text-[10px] opacity-70 ml-0.5">{isMac ? '⌘↵' : 'Ctrl+↵'}</kbd>
              </button>
            )
          )}
          {props.previewAvailable && (isRunning || props.hasPreviewUrl) && (
            <button
              onClick={props.onOpenPreview}
              disabled={props.previewActive}
              title={props.previewActive ? 'The preview is in focus' : 'Bring the preview tab into focus'}
              className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded font-medium transition-colors ${
                props.previewActive
                  ? 'bg-blue-900/70 text-blue-100 cursor-default ring-1 ring-blue-400'
                  : 'bg-blue-600/80 hover:bg-blue-600 text-white'
              } ${props.previewFlash && !props.previewActive ? 'ring-2 ring-blue-300 animate-pulse' : ''}`}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              {props.previewActive ? 'Preview in focus' : 'Focus on preview'}
            </button>
          )}
          <button onClick={handleClear} title="Clear terminal" className="px-1.5 py-0.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors">
            Clear
          </button>
          <button onClick={onToggle} title="Hide terminal" className="p-0.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Terminal panes */}
      <div className="flex-1 relative min-h-0">
        {tabs.map(tab => (
          <div
            key={tab.id}
            data-terminal-pane={tab.id}
            className="absolute inset-0"
            style={{ display: tab.id === activeTabId ? 'flex' : 'none', flexDirection: 'column' }}
          >
            <Terminal
              tabId={tab.id}
              onServerStatus={(running, command, commandsRun) => {
                setUsedTabs(prev => (prev[tab.id] === (commandsRun > 0) ? prev : { ...prev, [tab.id]: commandsRun > 0 }));
                const isApp = running && !!runChallenge?.start && command === runChallenge.start;
                setRunningTabId(prev => nextRunningTab(prev, isApp, tab.id));
              }}
              {...props}
              collapsed={false}
              onToggle={() => {}}
              hideHeader
              persistKey={sessionKey ? `${sessionKey}_${tab.id}` : undefined}
              // Wire run/stop/clear to this tab's functions
              onRunReady={(fn) => {
                runFnsRef.current[tab.id] = fn;
                // Also register with parent for keyboard shortcut (use first tab's fn)
                if (tab.id === tabs[0].id) props.onRunReady?.(fn);
              }}
              externalRunStatus={runningTabId ? 'running' : 'idle'}
              onAppStarted={() => {
                setRunningTabId(tab.id);
                props.onAppStarted?.();
              }}
              onAppStopped={() => setRunningTabId(null)}
              onClearReady={(fn) => { clearFnsRef.current[tab.id] = fn; }}
              onStopReady={(fn) => { stopFnsRef.current[tab.id] = fn; }}
              // Only pass pending commands to the first (primary) tab
              pendingCommand={tab.id === tabs[0].id ? props.pendingCommand : null}
              onCommandExecuted={tab.id === tabs[0].id ? props.onCommandExecuted : undefined}
            />
          </div>
        ))}
      </div>
      {pendingClose && (
        <ConfirmDialog
          title="Close this terminal?"
          message={runningTabId === pendingClose
            ? "Something is still running in this terminal. Closing it stops it and its history is gone."
            : "You have used this terminal. Its history is gone once it is closed."}
          confirmLabel="Close terminal"
          danger
          onCancel={() => setPendingClose(null)}
          onConfirm={() => { closeTab(pendingClose); setPendingClose(null); }}
        />
      )}
    </div>
  );
}
