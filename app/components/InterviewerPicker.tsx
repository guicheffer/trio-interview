'use client';

import { useCallback, useEffect, useState } from 'react';

export interface CandidateRow {
  name: string;
  exercise: string;
  lastActivity: number;
  active: boolean;
  connected: number;
}

interface InterviewerPickerProps {
  onPick: (candidate: CandidateRow, allCandidates: CandidateRow[]) => void;
  onBack: () => void;
}

const REFRESH_MS = 30_000;

function ago(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

function RowStatus({ row }: { row: { connected: number; active: boolean } }) {
  if (row.connected > 0) {
    return (
      <span className="flex flex-shrink-0 items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400">
        <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
        Online
      </span>
    );
  }
  if (row.active) return <span className="flex-shrink-0 text-xs text-gray-400">Active session</span>;
  return null;
}

export function InterviewerPicker({ onPick, onBack }: InterviewerPickerProps) {
  const [rows, setRows] = useState<CandidateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const remove = async (name: string) => {
    try {
      const res = await fetch(`/api/interviewer/candidates/${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      setConfirming(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the candidate');
      setConfirming(null);
    }
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/interviewer/candidates');
      if (!res.ok) throw new Error(res.status === 403 ? 'Interviewer view is only available on localhost' : `HTTP ${res.status}`);
      const data = await res.json();
      setRows(data.candidates);
      setUpdatedAt(Date.now());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load candidates');
    }
  }, []);

  // Candidates keep joining and saving while this page is open, so it refreshes on its own
  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Choose a candidate</p>
        <button
          onClick={load}
          className="text-xs text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
          title="Refreshes by itself every 30 seconds"
        >
          ↻ Refresh
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">{error}</p>}
      {!rows && !error && <p className="py-6 text-center text-xs text-gray-400">Loading...</p>}
      {rows && rows.length === 0 && (
        <p className="rounded-lg bg-gray-50 p-4 text-center text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          No candidates yet. They show up here as soon as they enter their name.
        </p>
      )}

      <ul className="max-h-72 space-y-1.5 overflow-y-auto">
        {rows?.map(row => (
          <li key={row.name} className="flex items-stretch gap-1.5">
            {confirming === row.name ? (
              <div className="flex w-full items-center justify-between gap-3 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 dark:border-red-700 dark:bg-red-900/20" data-testid="delete-confirm">
                <p className="min-w-0 text-xs text-red-700 dark:text-red-300">Delete <span className="font-semibold">{row.name}</span> and the exercise folder? This cannot be undone.</p>
                <div className="flex flex-shrink-0 gap-1.5">
                  <button onClick={() => setConfirming(null)} className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-600 dark:border-gray-600 dark:text-gray-300">Cancel</button>
                  <button onClick={() => remove(row.name)} className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700">Delete</button>
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={() => onPick(row, rows)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border border-gray-200 px-3.5 py-2.5 text-left transition-colors hover:border-accent-400 hover:bg-accent-50 dark:border-gray-700 dark:hover:border-green-600 dark:hover:bg-green-900/20"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{row.name}</p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">{row.exercise} · {ago(row.lastActivity)}</p>
                  </div>
                  <RowStatus row={row} />
                </button>
                {row.connected === 0 && !row.active && (
                  <button
                    onClick={() => setConfirming(row.name)}
                    title={`Delete ${row.name}`}
                    aria-label={`Delete ${row.name}`}
                    data-testid="delete-candidate"
                    className="flex w-9 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-400 transition-colors hover:border-red-400 hover:bg-red-50 hover:text-red-600 dark:border-gray-700 dark:hover:border-red-600 dark:hover:bg-red-900/20"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14M10 11v6M14 11v6" /></svg>
                  </button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between pt-1">
        <button onClick={onBack} className="text-xs text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300">← Back</button>
        {updatedAt && <span className="text-[11px] text-gray-400">Updated {new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
      </div>
    </div>
  );
}
