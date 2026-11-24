'use client';

import { useCallback, useEffect, useState } from 'react';

export type AgentMode = 'agent' | 'claude-code' | 'opencode';

export interface ToolView {
  tool: 'claude-code' | 'opencode';
  /** The interviewer's settings allow it */
  allowed: boolean;
  ok: boolean | null;
  /** Why it cannot open. Only the interviewer is told. */
  message: string;
  version: string;
}

export interface AgentModeView {
  /** What the candidate chose, or null while nothing was chosen yet */
  mode: AgentMode | null;
  /** The candidate decides; the interviewer only watches */
  canChoose: boolean;
  tools: ToolView[];
  loaded: boolean;
}

const EMPTY: AgentModeView = { mode: null, canChoose: false, tools: [], loaded: false };

/** The candidate's choice of assistant. Both screens poll it, so the interviewer sees what the candidate picks. */
export function useAgentMode() {
  const [view, setView] = useState<AgentModeView>(EMPTY);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/agent-mode');
      if (!res.ok) return;
      const data = await res.json();
      setView({ mode: data.mode ?? null, canChoose: !!data.canChoose, tools: Array.isArray(data.tools) ? data.tools : [], loaded: true });
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [load]);

  /** Candidate only. Returns an error text when the choice was refused. */
  const choose = useCallback(async (mode: AgentMode): Promise<string | null> => {
    try {
      const res = await fetch('/api/agent-mode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) });
      if (!res.ok) return (await res.json().catch(() => ({})))?.error ?? 'Could not change the assistant';
      await load();
      return null;
    } catch {
      return 'Could not reach the server';
    }
  }, [load]);

  /** Candidate only: back to the picker */
  const reset = useCallback(async () => {
    try {
      await fetch('/api/agent-mode', { method: 'DELETE' });
      await load();
    } catch {}
  }, [load]);

  const recheck = useCallback(async () => {
    try {
      await fetch('/api/agent-mode/check', { method: 'POST' });
      await load();
    } catch {}
  }, [load]);

  return { ...view, choose, reset, recheck };
}
