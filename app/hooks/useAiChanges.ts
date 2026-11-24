'use client';

import { useEffect, useState } from 'react';

export interface AiChange {
  file: string;
  /** The file as it was before the AI's last turn changed it (null: it did not exist) */
  before: string | null;
}

const REFRESH_MS = 1500;

/** What the AI changed in its last turns, from either screen, and whether it is writing files right now; refreshed when an answer ends and every moment */
export function useAiChanges(enabled: boolean, turn: number): { changes: AiChange[]; writing: boolean } {
  const [changes, setChanges] = useState<AiChange[]>([]);
  const [writing, setWriting] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const load = () => {
      fetch('/api/chat/changes').then(r => r.json()).then(d => {
        if (!live) return;
        const next: AiChange[] = Array.isArray(d.changes) ? d.changes : [];
        setChanges(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
        setWriting(!!d.writing);
      }).catch(() => {});
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => { live = false; clearInterval(timer); };
  }, [enabled, turn]);
  return { changes, writing };
}
