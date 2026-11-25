'use client';

import { useState } from 'react';
import type { AgentMode, ToolView } from '../hooks/useAgentMode';
import { ClaudeCodeIcon } from './ClaudeCodeIcon';
import { OpenCodeIcon } from './OpenCodeIcon';
import { PiIcon } from './PiIcon';
import { CodexIcon } from './CodexIcon';

interface AgentModePickerProps {
  /** Whether this screen may choose. Both may; the server decides and still refuses a tool that is switched off. */
  canChoose: boolean;
  /** True on the interviewer's screen, which also learns why a tool cannot open */
  interviewer?: boolean;
  tools: ToolView[];
  onChoose: (mode: AgentMode) => Promise<string | null>;
  onRecheck: () => Promise<void>;
}

const LABELS: Record<'claude-code' | 'opencode' | 'pi', { name: string; hint: string }> = {
  'claude-code': { name: 'Claude Code', hint: 'The real terminal program, Sonnet by default.' },
  opencode: { name: 'OpenCode', hint: 'The OpenCode terminal program, Sonnet by default.' },
  pi: { name: 'Pi', hint: 'The Pi terminal program, a small agent with four tools.' },
};

function ToolIcon({ tool }: { tool: 'claude-code' | 'opencode' | 'pi' }) {
  const className = 'mt-0.5 h-4 w-4 flex-shrink-0';
  if (tool === 'claude-code') return <ClaudeCodeIcon className={className} />;
  if (tool === 'pi') return <PiIcon className={className} />;
  return <OpenCodeIcon className={className} />;
}

/** Shown in the side panel before any assistant is opened. The candidate picks; the interviewer watches. */
export function AgentModePicker({ canChoose, interviewer = false, tools, onChoose, onRecheck }: AgentModePickerProps) {
  const [busy, setBusy] = useState<AgentMode | 'check' | null>(null);
  const [error, setError] = useState('');

  const choose = async (mode: AgentMode) => {
    setBusy(mode);
    setError('');
    const problem = await onChoose(mode);
    if (problem) setError(problem);
    setBusy(null);
  };

  const recheck = async () => {
    setBusy('check');
    await onRecheck();
    setBusy(null);
  };

  const card = 'flex w-full items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 text-left disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800';
  const hover = canChoose ? 'hover:border-accent-500' : '';
  // Only tools the interviewer allowed are offered, and the candidate sees nothing about why one cannot open
  const offered = tools.filter(t => t.allowed);
  const problems = interviewer ? offered.filter(t => t.ok === false) : [];

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-5">
      <div className="w-full max-w-xs">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {interviewer ? 'Which assistant should the candidate work with?' : 'How do you want to work with the assistant?'}
        </h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {interviewer ? 'The candidate can pick too. Whoever picks last decides, and you both see the same screen.' : 'Pick the one you are most comfortable with.'}
        </p>

        <div className="mt-4 space-y-2">
          <button onClick={() => choose('agent')} disabled={!canChoose || busy !== null} className={`${card} ${hover}`}>
            <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded bg-accent-500 text-[10px] font-bold text-white">A</span>
            <span>
              <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">Agent mode</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">The chat panel, with model choice and plan mode.</span>
            </span>
          </button>

          {offered.map(t => (
            <button key={t.tool} onClick={() => choose(t.tool)} disabled={!canChoose || busy !== null || t.ok === false} className={`${card} ${hover}`}>
              <ToolIcon tool={t.tool} />
              <span>
                <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">{LABELS[t.tool].name}</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">{busy === t.tool ? 'Opening...' : t.ok === false ? 'Not available right now.' : LABELS[t.tool].hint}</span>
              </span>
            </button>
          ))}

          {/* Shown to everybody and never selectable: there is no server route behind it */}
          <button type="button" disabled aria-disabled="true" data-testid="assistant-codex" className={`${card} opacity-50`}>
            <CodexIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>
              <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">Codex</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">Coming soon.</span>
            </span>
          </button>
        </div>

        {problems.map(t => (
          <div key={t.tool} className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            <p>{LABELS[t.tool].name} cannot open.</p>
            <p className="mt-1">{t.line || t.message || 'the check failed'}</p>
            <button onClick={recheck} disabled={busy !== null} className="mt-2 rounded bg-amber-600 px-2 py-1 font-medium text-white hover:bg-amber-700 disabled:opacity-50">
              {busy === 'check' ? 'Checking...' : 'Check again'}
            </button>
          </div>
        ))}
        {error && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </div>
  );
}
