'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export interface PaletteAction {
  id: string;
  title: string;
  category: string;
  keywords?: string;
  shortcut?: string[];
  /** Hidden unless the palette is in "files" mode */
  fileMode?: boolean;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  mode: 'commands' | 'files';
  actions: PaletteAction[];
  onClose: () => void;
}

const KEY_LABEL: Record<string, string> = { Shift: '⇧', Enter: '↵', Alt: '⌥', Ctrl: '⌃' };
const label = (k: string) => KEY_LABEL[k] ?? k;

const RECENT_KEY = 'trio_local_palette_recent';

function score(query: string, action: PaletteAction): number {
  if (!query) return 1;
  const hay = `${action.title} ${action.category} ${action.keywords ?? ''}`.toLowerCase();
  const q = query.toLowerCase().trim();
  if (hay.includes(q)) return 100 - hay.indexOf(q) * 0.5 + (action.title.toLowerCase().startsWith(q) ? 50 : 0);
  // every word must appear somewhere
  const words = q.split(/\s+/);
  if (words.every(w => hay.includes(w))) return 60;
  // subsequence
  let i = 0;
  for (const ch of hay) if (ch === q[i]) i++;
  return i === q.length ? 20 : 0;
}

function readRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}

export function CommandPalette({ open, mode, actions, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open, mode]);

  const results = useMemo(() => {
    const pool = actions.filter(a => (mode === 'files' ? a.fileMode : !a.fileMode));
    if (!query) {
      const recent = readRecent();
      if (mode === 'files') return pool.slice(0, 60);
      return [...pool].sort((a, b) => {
        const ra = recent.indexOf(a.id);
        const rb = recent.indexOf(b.id);
        if (ra !== rb) return (ra === -1 ? 999 : ra) - (rb === -1 ? 999 : rb);
        return 0;
      });
    }
    return pool
      .map(a => ({ a, s: score(query, a) }))
      .filter(x => x.s > 0)
      .sort((x, y) => y.s - x.s)
      .slice(0, 60)
      .map(x => x.a);
  }, [actions, query, mode, open]);

  useEffect(() => { setIndex(0); }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  if (!open) return null;

  const execute = (action: PaletteAction | undefined) => {
    if (!action) return;
    try {
      const recent = [action.id, ...readRecent().filter(id => id !== action.id)].slice(0, 12);
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    } catch {}
    onClose();
    // Let the palette close and give focus back before the action runs
    setTimeout(() => action.run(), 30);
  };

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-start justify-center bg-black/40 px-4 pt-[14vh] backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-label="Command palette"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => Math.min(results.length - 1, i + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(0, i - 1)); }
            else if (e.key === 'Enter') { e.preventDefault(); execute(results[index]); }
            else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
          }}
          placeholder={mode === 'files' ? 'Go to file...' : 'Type a command, or a file name to open it...'}
          className="w-full border-b border-gray-200 bg-transparent px-4 py-3.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none dark:border-gray-700 dark:text-gray-100"
          data-testid="palette-input"
        />
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1" data-testid="palette-list">
          {results.length === 0 && <div className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">No matching command</div>}
          {results.map((a, i) => (
            <button
              key={a.id}
              data-index={i}
              type="button"
              onMouseEnter={() => setIndex(i)}
              onClick={() => execute(a)}
              className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm ${i === index ? 'bg-green-50 text-gray-900 dark:bg-green-900/30 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}
            >
              <span className="truncate">{a.title}</span>
              <span className="flex flex-shrink-0 items-center gap-2">
                {a.shortcut && (
                  <span className="flex items-center gap-0.5">
                    {a.shortcut.map(k => (
                      <kbd key={k} className="min-w-[20px] rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-center text-[11px] font-mono text-gray-700 shadow-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">{label(k)}</kbd>
                    ))}
                  </span>
                )}
                <span className="text-[11px] text-gray-400 dark:text-gray-500">{a.category}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-2 text-[11px] text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
          <span>Up and down to move, Enter to run, Esc to close. Keys on the right are the shortcuts for that action.</span>
          <span>{results.length} result{results.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  );
}
