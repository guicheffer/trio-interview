'use client';

import { useEffect, useState } from 'react';

const REFRESH_MS = 5000;

/** The project's file paths, kept fresh, for the chat to turn file names into links */
export function useProjectFiles(enabled: boolean): string[] {
  const [files, setFiles] = useState<string[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const load = () => {
      fetch('/api/files').then(r => r.json()).then(d => {
        if (!live) return;
        const list: string[] = (d.files ?? []).filter((f: { type: string }) => f.type === 'file').map((f: { path: string }) => f.path);
        setFiles(prev => (prev.length === list.length && prev.every((f, i) => f === list[i]) ? prev : list));
      }).catch(() => {});
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => { live = false; clearInterval(timer); };
  }, [enabled]);
  return files;
}
