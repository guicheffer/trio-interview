'use client';

import { useEffect, useState } from 'react';

const KEY = 'trio_cc_show_cursors';
const EVENT = 'trio-cursors-pref';

export function getShowCursors(): boolean {
  try { return localStorage.getItem(KEY) !== '0'; } catch { return true; }
}

export function setShowCursors(show: boolean) {
  try { localStorage.setItem(KEY, show ? '1' : '0'); } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export function useShowCursors(): [boolean, (show: boolean) => void] {
  const [show, setShow] = useState(true);
  useEffect(() => {
    setShow(getShowCursors());
    const sync = () => setShow(getShowCursors());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return [show, setShowCursors];
}
