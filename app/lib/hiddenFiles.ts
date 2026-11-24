import { useSyncExternalStore } from 'react';

// The files the exercise starts without, which the interviewer has not shown the candidate yet. Kept here so every place that
// shows a file name on the interviewer's screen (tabs, the editor header) can hide it while the candidate cannot see the file,
// which matters when the interviewer shares their screen.
let hidden: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

export function setHiddenFiles(paths: string[]) {
  const same = paths.length === hidden.size && paths.every(p => hidden.has(p));
  if (same) return;
  hidden = new Set(paths);
  listeners.forEach(l => l());
}

export function isHiddenFile(path: string | null | undefined): boolean {
  return !!path && hidden.has(path);
}

export const REDACTED = '[redacted]';

export function useHiddenFiles(): ReadonlySet<string> {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => hidden,
    () => hidden,
  );
}
