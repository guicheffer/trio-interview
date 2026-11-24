'use client';

import { useEffect, useState } from 'react';

const REFRESH_MS = 5000;

export interface SessionStatus {
  /** False when the platform is working on another candidate than the one this screen shows */
  isActive: boolean;
  /** The candidate the platform is working on (interviewer only) */
  active: string | null;
}

/** Whether this screen's candidate is still the active session */
export function useSessionStatus(name: string | null | undefined): SessionStatus {
  const [status, setStatus] = useState<SessionStatus>({ isActive: true, active: null });
  useEffect(() => {
    if (!name) return;
    let live = true;
    const load = () => {
      fetch(`/api/session/status?name=${encodeURIComponent(name)}`).then(r => r.json()).then(d => {
        if (live) setStatus({ isActive: d.isActive !== false, active: typeof d.active === 'string' ? d.active : null });
      }).catch(() => {});
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => { live = false; clearInterval(timer); };
  }, [name]);
  return status;
}
