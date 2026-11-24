'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { ClaudeCodeIcon } from './ClaudeCodeIcon';
import { OpenCodeIcon } from './OpenCodeIcon';

interface AgentTerminalProps {
  interviewer: boolean;
  tool: 'claude-code' | 'opencode';
  /** Candidate only: go back and pick another assistant */
  onChange?: () => void;
}

/**
 * Claude Code in a real terminal. The server owns the process; every screen attached sees the same output and can type.
 * Nothing here says who typed, it is one terminal.
 */
export function AgentTerminal({ interviewer, tool, onChange }: AgentTerminalProps) {
  const termRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [restartKey, setRestartKey] = useState(0);
  const { theme } = useTheme();

  useEffect(() => {
    if (!termRef.current) return;
    let term: any;
    let fit: any;
    let ws: WebSocket | null = null;
    let destroyed = false;
    let attempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let observer: ResizeObserver | null = null;

    Promise.all([
      import('@xterm/xterm').then(m => m.Terminal),
      import('@xterm/addon-fit').then(m => m.FitAddon),
      import('@xterm/addon-web-links').then(m => m.WebLinksAddon),
      import('@xterm/xterm/css/xterm.css' as any).catch(() => {}),
    ]).then(([XTerm, FitAddon, WebLinksAddon]) => {
      if (destroyed || !termRef.current) return;
      const dark = theme === 'dark';
      term = new XTerm({
        fontFamily: '"Cascadia Code", "Fira Code", "Monaco", "Menlo", monospace',
        fontSize: 13,
        cursorBlink: true,
        scrollback: 5000,
        theme: dark
          ? { background: '#1a1a2e', foreground: '#e2e8f0', cursor: '#D97757', selectionBackground: 'rgba(96, 165, 250, 0.45)' }
          : { background: '#f8fafc', foreground: '#1e293b', cursor: '#D97757', selectionBackground: 'rgba(37, 99, 235, 0.3)' },
      });
      fit = new FitAddon();
      term.loadAddon(fit);
      term.loadAddon(new WebLinksAddon());
      term.open(termRef.current);
      fit.fit();

      // Copy with a selection; without one the key goes to the program (Ctrl+C interrupts it)
      term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
        if (e.type === 'keydown' && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && term.hasSelection()) {
          navigator.clipboard?.writeText(term.getSelection()).catch(() => {});
          return false;
        }
        return true;
      });

      const send = (frame: Record<string, unknown>) => {
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame));
      };

      const open = () => {
        ws = new WebSocket(`${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api/agent-terminal`);
        wsRef.current = ws;
        ws.onopen = () => {
          attempts = 0;
          setConnected(true);
          try { fit.fit(); } catch {}
          send({ type: 'resize', cols: term.cols, rows: term.rows });
        };
        ws.onmessage = (e: MessageEvent<string>) => {
          let frame: any;
          try { frame = JSON.parse(e.data); } catch { return; }
          if (frame.type === 'replay') { term.reset(); term.write(frame.data ?? ''); }
          else if (frame.type === 'output') term.write(frame.data);
        };
        ws.onclose = () => {
          setConnected(false);
          wsRef.current = null;
          if (destroyed) return;
          attempts++;
          reconnectTimer = setTimeout(open, Math.min(1000 * attempts, 5000));
        };
        ws.onerror = () => {};
      };
      open();

      term.onData((data: string) => send({ type: 'data', data }));
      observer = new ResizeObserver(() => {
        try { fit.fit(); } catch {}
        send({ type: 'resize', cols: term.cols, rows: term.rows });
      });
      observer.observe(termRef.current);
    });

    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      observer?.disconnect();
      try { term?.dispose(); } catch {}
      try { ws?.close(); } catch {}
      wsRef.current = null;
    };
  }, [theme, restartKey, tool]);

  const restart = async () => {
    try { await fetch('/api/agent-terminal/restart', { method: 'POST' }); } catch {}
    setRestartKey(k => k + 1);
  };

  return (
    <div className="flex h-full flex-col bg-gray-900 dark:bg-gray-950">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-700 bg-gray-800 px-3 py-1.5">
        <div className="flex items-center gap-2">
          {tool === 'claude-code' ? <ClaudeCodeIcon /> : <OpenCodeIcon />}
          <span className="text-xs font-medium text-gray-200">{tool === 'claude-code' ? 'Claude Code' : 'OpenCode'}</span>
          {connected ? <span className="text-xs text-green-400">● connected</span> : <span className="text-xs text-gray-500">○ connecting...</span>}
        </div>
        {!interviewer && onChange && (
          <button onClick={onChange} title="Choose another assistant" className="rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-300 transition-colors hover:bg-gray-600">
            Change
          </button>
        )}
        {interviewer && (
          <button onClick={restart} title="Start the assistant again" className="rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-300 transition-colors hover:bg-gray-600">
            Restart
          </button>
        )}
      </div>
      <div ref={termRef} className="flex-1 overflow-hidden p-1" style={{ minHeight: 0 }} />
    </div>
  );
}
