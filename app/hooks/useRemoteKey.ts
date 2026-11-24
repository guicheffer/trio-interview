'use client';

import { useEffect, useRef } from 'react';

/** Calls back when another screen changed this localStorage key. */
export function useRemoteKey(key: string | undefined, onChange: (value: string | null) => void) {
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (!key) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ key: string; value: string | null }>).detail;
      if (detail.key === key) cb.current(detail.value);
    };
    window.addEventListener('trio-kv', handler);
    return () => window.removeEventListener('trio-kv', handler);
  }, [key]);
}
