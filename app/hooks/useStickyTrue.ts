'use client';

import { useEffect, useState } from 'react';

/** True while the value is true and for a short while after, so a lock does not flicker between two writes */
export function useStickyTrue(value: boolean, holdMs: number): boolean {
  const [held, setHeld] = useState(value);
  useEffect(() => {
    if (value) { setHeld(true); return; }
    const t = setTimeout(() => setHeld(false), holdMs);
    return () => clearTimeout(t);
  }, [value, holdMs]);
  return value || held;
}
