'use client';

import { useCallback, useEffect, useState } from 'react';

export interface AiStatusView {
  ok: boolean | null;
  message: string;
}

/** Whether the AI assistant works. Checked when the page opens and again every 30 seconds while it does not */
export function useAiStatus() {
  const [status, setStatus] = useState<AiStatusView>({ ok: null, message: '' });

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-status');
      if (res.ok) setStatus(await res.json());
    } catch {}
  }, []);

  const recheck = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-status/recheck', { method: 'POST' });
      if (res.ok) setStatus(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    load();
    if (status.ok === true) return;
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load, status.ok]);

  return { status, recheck };
}
