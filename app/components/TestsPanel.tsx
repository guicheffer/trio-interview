'use client';

import { useEffect, useRef, useState } from 'react';
import { summarize, summaryText, testsPassed, type TestCase, type TestsConfig } from '../../shared/exercise-tests';

interface TestsPanelProps {
  tests: TestsConfig;
  cases: TestCase[];
  /** A test command is running in a terminal right now */
  running: boolean;
  /** The last run ended without any result, for example the runner could not start */
  unreadable: boolean;
  onRunAll: () => void;
  onRunOne: (name: string) => void;
  /** Why the buttons cannot be used now, or null */
  blockedReason: string | null;
}

const MARK: Record<TestCase['status'], { icon: string; color: string; label: string }> = {
  pass: { icon: '✓', color: 'text-green-400', label: 'passed' },
  fail: { icon: '✗', color: 'text-red-400', label: 'failed' },
  skip: { icon: '-', color: 'text-gray-500', label: 'skipped' },
  todo: { icon: '-', color: 'text-gray-500', label: 'to do' },
  idle: { icon: '○', color: 'text-gray-500', label: 'not run yet' },
};

/**
 * A small chip in the terminal bar with the result of the last test run ("✓ 9 passed", "✗ 2 failed, 7 passed"). It opens a list of
 * the tests, each with how it ended and a button to run only that one. Calm colors, the same as the terminal's own.
 */
export function TestsPanel({ tests, cases, running, unreadable, onRunAll, onRunOne, blockedReason }: TestsPanelProps) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ top?: number; bottom?: number; right: number } | null>(null);

  const ran = cases.some(c => c.status !== 'idle');
  const summary = summarize(cases);
  const failed = summary.failed > 0;
  const passed = ran && testsPassed(summary);

  useEffect(() => {
    if (!open) return;
    const r = button.current?.getBoundingClientRect();
    // The bar sits at the bottom of the screen, so the list opens upward unless there is more room below
    if (r) {
      const right = Math.max(8, window.innerWidth - r.right);
      setPlace(r.top > window.innerHeight - r.bottom ? { bottom: window.innerHeight - r.top + 4, right } : { top: r.bottom + 4, right });
    }
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || button.current?.contains(t)) return;
      setOpen(false);
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key); };
  }, [open]);

  const label = running ? 'Running tests...'
    : unreadable && !ran ? 'No result'
    : !ran ? `${cases.length} tests`
    : summaryText(summary);
  const tone = running ? 'text-gray-300' : failed ? 'text-red-300' : passed ? 'text-green-300' : 'text-gray-300';
  const mark = running ? '…' : failed ? '✗' : passed ? '✓' : '○';

  return (
    <>
      <button
        ref={button}
        onClick={() => setOpen(o => !o)}
        data-testid="tests-chip"
        aria-expanded={open}
        title={tests.description ?? 'Show the tests'}
        className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-gray-700 hover:bg-gray-600 transition-colors ${tone}`}
      >
        <span aria-hidden="true">{mark}</span>
        <span data-testid="tests-summary">{label}</span>
      </button>
      {open && place && (
        <div
          ref={box}
          role="dialog"
          aria-label="Tests"
          data-testid="tests-list"
          style={{ position: 'fixed', top: place.top, bottom: place.bottom, right: place.right, zIndex: 60 }}
          className="w-80 max-w-[calc(100vw-16px)] rounded-md border border-gray-700 bg-gray-900 text-gray-200 shadow-xl"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-700">
            <span className="text-xs font-medium">{tests.description ?? 'Tests'}</span>
            <button
              onClick={onRunAll}
              disabled={!!blockedReason || running}
              title={blockedReason ?? 'Run all the tests'}
              className="px-2 py-0.5 text-xs rounded bg-green-600/80 hover:bg-green-600 text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Run all
            </button>
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {cases.map(c => {
              const m = MARK[c.status];
              return (
                <li key={c.name} className="group flex items-start gap-2 px-3 py-1 text-xs hover:bg-gray-800">
                  <span className={`w-3 flex-shrink-0 text-center font-bold ${m.color}`} aria-label={m.label} data-status={c.status}>{m.icon}</span>
                  <span className={`flex-1 min-w-0 break-words ${c.status === 'fail' ? 'text-red-200' : ''}`}>
                    {c.suite.length > 0 && <span className="text-gray-500">{c.suite.join(' › ')} › </span>}{c.name}
                  </span>
                  <button
                    onClick={() => onRunOne(c.name)}
                    disabled={!!blockedReason || running}
                    title={blockedReason ?? `Run only: ${c.name}`}
                    aria-label={`Run only ${c.name}`}
                    className="flex-shrink-0 px-1 rounded text-gray-500 hover:text-green-300 opacity-50 group-hover:opacity-100 focus:opacity-100 transition-opacity disabled:cursor-not-allowed"
                  >
                    ▶
                  </button>
                </li>
              );
            })}
            {cases.length === 0 && <li className="px-3 py-2 text-xs text-gray-500">No tests yet. Press Run tests.</li>}
          </ul>
        </div>
      )}
    </>
  );
}
