'use client';

import { cleanScrollback } from '../lib/scrollback';
import { moveHead, selectionRange, type SelectKey, type Selection } from '../lib/terminalSelect';
import { firstPreviewUrl, lastPreviewUrl } from '../lib/terminalOutput';
import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext';

interface TerminalProps {
  collapsed: boolean;
  onToggle: () => void;
  onRunReady?: (fn: (cmd: string) => void) => void;
  onClearReady?: (fn: () => void) => void;
  onStopReady?: (fn: () => void) => void;
  pendingCommand?: string | null;
  onCommandExecuted?: () => void;
  onPreviewUrl?: (url: string) => void;
  onAppStarted?: () => void;
  onAppStopped?: () => void;
  runChallenge?: { start: string; description: string; port: number | null } | null;
  /** External override: if set, hides internal runStatus management (TerminalManager controls it) */
  externalRunStatus?: 'idle' | 'running' | 'stopped';
  hideHeader?: boolean;
  /** Key used to keep the scrollback across reloads and collapses */
  persistKey?: string;
  /** Tab id, used by the server to keep one shell session per tab */
  tabId?: string;
  /** Server side status: is a command running, and which */
  onServerStatus?: (running: boolean, command: string | null, commandsRun: number) => void;
}

// Match preview URLs output by exercise runners
// Only the platform's own announcement counts; any other URL an app prints (logs, JSON, CORS lists) must not become the preview

function restoreSavedOutput(term: { write: (data: string) => void }, scrollKey: string) {
  try {
    const saved = localStorage.getItem(scrollKey);
    if (!saved) return;
    term.write(saved.replace(/\n/g, '\r\n') + '\r\n');
    term.write('\x1b[2m--- earlier session, restored from this browser ---\x1b[0m\r\n');
  } catch {
    // Storage can be unavailable, the terminal just starts empty
  }
}

export function Terminal({ collapsed, onToggle, onRunReady, onClearReady, onStopReady, pendingCommand, onCommandExecuted, onPreviewUrl, onAppStarted, onAppStopped, runChallenge, hideHeader, persistKey, tabId, onServerStatus }: TerminalProps) {
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [runStatus, setRunStatus] = useState<'idle' | 'running' | 'stopped'>('idle');
  const { theme } = useTheme();
  const onPreviewUrlRef = useRef(onPreviewUrl);
  const onServerStatusRef = useRef(onServerStatus);
  const runChallengeRef = useRef(runChallenge);
  onPreviewUrlRef.current = onPreviewUrl;
  onServerStatusRef.current = onServerStatus;
  runChallengeRef.current = runChallenge;

  useEffect(() => {
    if (collapsed || !termRef.current) return;

    let term: any;
    let fitAddon: any;
    let ws: WebSocket;
    let destroyed = false;
    let attempts = 0;
    let notifiedDrop = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let saveTimer: ReturnType<typeof setInterval> | undefined;
    const scrollKey = persistKey ? `trio_cc_term_scroll_${persistKey}` : null;

    const saveScrollback = () => {
      if (!scrollKey || !term) return;
      try {
        const buf = term.buffer.active;
        const lines: string[] = [];
        for (let i = 0; i < buf.length; i++) lines.push(buf.getLine(i)?.translateToString(true) ?? '');
        while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
        // Drop restore markers and the shell banner so they do not pile up across reloads
        const cleaned = cleanScrollback(lines);
        const text = cleaned.slice(-500).join('\n').slice(-100000);
        if (text) localStorage.setItem(scrollKey, text);
      } catch {}
    };

    Promise.all([
      import('@xterm/xterm').then(m => m.Terminal),
      import('@xterm/addon-fit').then(m => m.FitAddon),
      import('@xterm/addon-web-links').then(m => m.WebLinksAddon),
      import('@xterm/xterm/css/xterm.css' as any).catch(() => {}),
    ]).then(([XTerm, FitAddon, WebLinksAddon]) => {
      if (destroyed || !termRef.current) return;

      const isDark = theme === 'dark';
      term = new XTerm({
        fontFamily: '"Cascadia Code", "Fira Code", "Monaco", "Menlo", monospace',
        fontSize: 13,
        theme: isDark ? {
          background: '#1a1a2e',
          foreground: '#e2e8f0',
          cursor: '#22c55e',
          cursorAccent: '#1a1a2e',
          selectionBackground: 'rgba(96, 165, 250, 0.45)',
          selectionInactiveBackground: 'rgba(148, 163, 184, 0.35)',
          black: '#000000', red: '#ef4444', green: '#22c55e',
          yellow: '#f59e0b', blue: '#3b82f6', magenta: '#a855f7',
          cyan: '#06b6d4', white: '#e2e8f0',
          brightBlack: '#475569', brightRed: '#f87171', brightGreen: '#4ade80',
          brightYellow: '#fbbf24', brightBlue: '#60a5fa', brightMagenta: '#c084fc',
          brightCyan: '#22d3ee', brightWhite: '#f1f5f9',
        } : {
          background: '#f8fafc',
          foreground: '#1e293b',
          cursor: '#16a34a',
          cursorAccent: '#f8fafc',
          selectionBackground: 'rgba(37, 99, 235, 0.3)',
          selectionInactiveBackground: 'rgba(100, 116, 139, 0.25)',
          black: '#1e293b', red: '#dc2626', green: '#16a34a',
          yellow: '#d97706', blue: '#2563eb', magenta: '#7c3aed',
          cyan: '#0891b2', white: '#334155',
          brightBlack: '#64748b', brightRed: '#ef4444', brightGreen: '#22c55e',
          brightYellow: '#f59e0b', brightBlue: '#3b82f6', brightMagenta: '#8b5cf6',
          brightCyan: '#06b6d4', brightWhite: '#0f172a',
        },
        cursorBlink: true,
        allowTransparency: false,
        rightClickSelectsWord: true,
      });

      fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      // Make URLs clickable, opens in new tab
      const webLinks = new WebLinksAddon();
      term.loadAddon(webLinks);
      term.open(termRef.current!);
      fitAddon.fit();

      xtermRef.current = term;

      // Keyboard selection: Shift with the arrows, Home or End grows a selection from the cursor, Cmd or Ctrl+A selects all
      // (Cmd only on a Mac, Ctrl+A is the start of the line in a shell), Escape drops it. With text selected, Ctrl+C
      // (and Cmd+C) copies it; without a selection Ctrl+C still interrupts the running command.
      let keyboardSelection: Selection | null = null;
      term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
        if (e.type !== 'keydown') return true;
        const key = e.key;
        if ((e.ctrlKey || e.metaKey) && key.toLowerCase() === 'c' && term.hasSelection()) {
          navigator.clipboard?.writeText(term.getSelection()).catch(() => {});
          return false;
        }
        if (e.metaKey && key.toLowerCase() === 'a') { term.selectAll(); return false; }
        if (key === 'Escape' && term.hasSelection()) { term.clearSelection(); keyboardSelection = null; return false; }
        if (e.shiftKey && !e.ctrlKey && !e.metaKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) {
          const buffer = term.buffer.active;
          const cursor = { col: buffer.cursorX, row: buffer.baseY + buffer.cursorY };
          const current = term.hasSelection() ? keyboardSelection : null;
          const sel = current ?? { anchor: cursor, head: cursor };
          const head = moveHead(sel.head, key as SelectKey, { cols: term.cols, rows: buffer.length });
          keyboardSelection = { anchor: sel.anchor, head };
          const range = selectionRange(keyboardSelection, term.cols);
          if (range.length > 0) term.select(range.col, range.row, range.length); else term.clearSelection();
          return false;
        }
        return true;
      });

      if (scrollKey) saveTimer = setInterval(saveScrollback, 4000);

      const openSocket = () => {
        ws = new WebSocket(`${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api/terminal?tab=${encodeURIComponent(tabId || 'main')}`);
        wsRef.current = ws;

        ws.onopen = () => {
          attempts = 0;
          if (notifiedDrop) { term.write('\x1b[2m--- reconnected ---\x1b[0m\r\n'); notifiedDrop = false; }
          setConnected(true);
          fitAddon.fit();
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        };

        ws.onmessage = (e: MessageEvent<string>) => {
          let frame: any;
          try { frame = JSON.parse(e.data); } catch { return; }

          if (frame.type === 'replay') {
            term.reset();
            // A brand new server session (after a server restart) falls back to the text saved in the browser
            if (frame.fresh && scrollKey) restoreSavedOutput(term, scrollKey);
            term.write(frame.data ?? '');
            // Whoever joins late still learns where the app is running
            const url = lastPreviewUrl(String(frame.data ?? ''));
            if (url) onPreviewUrlRef.current?.(url);
            return;
          }

          if (frame.type === 'output') {
            term.write(frame.data);
            const url = firstPreviewUrl(String(frame.data));
            if (url) onPreviewUrlRef.current?.(url);
            return;
          }

          if (frame.type === 'clear') {
            term.clear();
            return;
          }

          if (frame.type === 'status') {
            const isApp = !!frame.running && !!runChallengeRef.current?.start && frame.command === runChallengeRef.current.start;
            setRunStatus(isApp ? 'running' : 'idle');
            onServerStatusRef.current?.(!!frame.running, frame.command ?? null, Number(frame.commandsRun) || 0);
          }
        };

        ws.onclose = () => {
          setConnected(false);
          wsRef.current = null;
          onRunReady?.(() => {}); // clear the run fn
          if (destroyed) return;
          if (!notifiedDrop) { term.write('\r\n\x1b[33mTerminal disconnected, reconnecting...\x1b[0m\r\n'); notifiedDrop = true; }
          attempts++;
          reconnectTimer = setTimeout(openSocket, Math.min(1000 * attempts, 5000));
        };

        ws.onerror = () => {};


      };
      openSocket();

      term.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'data', data }));
        }
      });

      const ro = new ResizeObserver(() => {
        try { fitAddon?.fit(); } catch {}
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        }
      });
      if (termRef.current) ro.observe(termRef.current);

      return () => ro.disconnect();
    });

    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (saveTimer) clearInterval(saveTimer);
      saveScrollback();
      try { term?.dispose(); } catch {}
      try { ws?.close(); } catch {}
      xtermRef.current = null;
      wsRef.current = null;
    };
  }, [collapsed]);

  const sendFrame = (frame: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame));
  };

  // The server types the command and presses Enter, so the output streams in right away
  const runApp = () => {
    if (!runChallenge?.start) return;
    setRunStatus('running');
    onAppStarted?.();
    sendFrame({ type: 'run', command: runChallenge.start });
  };

  const stopApp = async () => {
    try {
      await fetch('/api/terminal/stop', { method: 'POST' });
    } catch (err) {
      console.error('Failed to stop the running command:', err);
    }
    setRunStatus('stopped');
    setTimeout(() => onAppStopped?.(), 0);
  };

  const clearTerminal = () => {
    sendFrame({ type: 'clear' });
  };

  // Run a command coming from the editor (Run button on a file)
  useEffect(() => {
    if (!pendingCommand || !connected) return;
    sendFrame({ type: 'run', command: pendingCommand });
    onCommandExecuted?.();
  }, [pendingCommand, connected]);

  // Expose runApp, stopApp, clearTerminal to parent
  useEffect(() => { onRunReady?.(runApp); }, [runApp, onRunReady]);
  useEffect(() => { onClearReady?.(clearTerminal); }, [clearTerminal, onClearReady]);
  useEffect(() => { onStopReady?.(stopApp); }, [stopApp, onStopReady]);

  if (collapsed) {
    return (
      <button
        onClick={onToggle}
        className="w-full h-full flex items-center px-4 space-x-2 bg-gray-900 dark:bg-gray-950 border-t border-gray-700 hover:bg-gray-800 transition-colors"
      >
        <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="text-xs text-gray-400 font-mono">Terminal</span>
        {connected && <span className="w-1.5 h-1.5 rounded-full bg-green-400 ml-1" />}
      </button>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 dark:bg-gray-950">
      {!hideHeader && <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 border-t border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-300 font-mono">Terminal</span>
          {connected
            ? <span className="text-xs text-green-400">● connected</span>
            : <span className="text-xs text-gray-500">○ connecting...</span>
          }
        </div>
        <div className="flex items-center gap-1">
          {runChallenge?.start && connected && (
            <>
              {runStatus === 'running' ? (
                <>
                  <button onClick={stopApp} title="Stop" className="px-2 py-0.5 text-xs rounded bg-red-600/80 hover:bg-red-600 text-white transition-colors">
                    ⏹ Stop
                  </button>
                  <button onClick={runApp} title="Restart app" className="px-2 py-0.5 text-xs rounded bg-gray-600 hover:bg-gray-500 text-white transition-colors">
                    ⟳
                  </button>
                </>
              ) : (
                <button onClick={runApp} title={runChallenge.description || 'Run app'} className="px-2 py-0.5 text-xs rounded bg-green-600/80 hover:bg-green-600 text-white font-medium transition-colors flex items-center gap-1">
                  <span>▶ {runStatus === 'stopped' ? 'Restart' : 'Run App'}</span>
                  <kbd className="text-[10px] opacity-75">
                    {typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac') ? '⌘↵' : 'Ctrl+↵'}
                  </kbd>
                </button>
              )}
            </>
          )}
          <button onClick={clearTerminal} title="Clear terminal" className="px-1.5 py-0.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors">
            Clear
          </button>
          <button onClick={onToggle} title="Hide terminal" className="p-0.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>}
      <div ref={termRef} className="flex-1 overflow-hidden" style={{ minHeight: 0 }} />
    </div>
  );
}
