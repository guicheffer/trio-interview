'use client';

import { useEffect, useState } from 'react';
import { countChanges } from '../../shared/line-diff';
import type { AiChange } from '../hooks/useAiChanges';
import { loadCounts, saveCounts } from '../lib/reviewStore';

interface FileCount { file: string; added: number; removed: number }

const REFRESH_MS = 2500;

async function currentText(file: string): Promise<string> {
  try {
    const res = await fetch(`/api/files/${encodeURIComponent(file)}`);
    if (!res.ok) return '';
    return (await res.json()).content ?? '';
  } catch { return ''; }
}

/**
 * Pinned above the message box once the agent has changed files: how many files and how many lines were added and
 * removed by its last answer. The numbers follow the agent's work while it answers and stay fixed after that, whatever the person keeps, undoes or edits.
 */
export function AiChangesSummary({ changes, busy, onOpenFile }: { changes: AiChange[]; busy: boolean; onOpenFile?: (file: string) => void }) {
  const [counts, setCounts] = useState<FileCount[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (changes.length === 0) { setCounts([]); return; }
    let live = true;
    const measure = async () => {
      const next: FileCount[] = [];
      for (const change of changes) {
        // What the agent proposed is fixed once its answer ends, even when the person later keeps, undoes or edits
        const settled = busy ? null : loadCounts(change.file, change.before);
        if (settled) { if (settled.added > 0 || settled.removed > 0) next.push({ file: change.file, ...settled }); continue; }
        const found = countChanges(change.before ?? '', await currentText(change.file));
        if (!found) continue;
        if (!busy) saveCounts(change.file, change.before, found);
        if (found.added > 0 || found.removed > 0) next.push({ file: change.file, ...found });
      }
      if (live) setCounts(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    measure();
    const timer = setInterval(measure, REFRESH_MS);
    return () => { live = false; clearInterval(timer); };
  }, [changes, busy]);

  if (counts.length === 0) return null;
  const added = counts.reduce((n, c) => n + c.added, 0);
  const removed = counts.reduce((n, c) => n + c.removed, 0);

  return (
    <div className="mx-3 mb-2 rounded-lg border border-amber-300 bg-amber-50 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100" data-testid="ai-summary">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-1.5 text-left">
        <span className="font-semibold">{counts.length} {counts.length === 1 ? 'file' : 'files'} changed by the agent</span>
        <span className="font-mono text-green-700 dark:text-green-400" data-testid="ai-summary-added">+{added}</span>
        <span className="font-mono text-red-700 dark:text-red-400" data-testid="ai-summary-removed">-{removed}</span>
        <span className="ml-auto" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ul className="border-t border-amber-200 px-3 py-1 dark:border-amber-800">
          {counts.map(c => (
            <li key={c.file} className="flex items-center gap-2 py-0.5">
              <button type="button" onClick={() => onOpenFile?.(c.file)} className="truncate font-mono text-accent-700 underline decoration-dotted hover:text-accent-800 dark:text-accent-300">{c.file}</button>
              <span className="ml-auto font-mono text-accent-700 dark:text-accent-300">+{c.added}</span>
              <span className="font-mono text-red-700 dark:text-red-400">-{c.removed}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
