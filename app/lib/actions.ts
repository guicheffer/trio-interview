'use client';

import { useEffect, useRef } from 'react';

const EVENT = 'trio-action';

/** Trigger something owned by another component (new terminal, focus the chat, create a file...) */
export function runAction(name: string, payload?: unknown) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { name, payload } }));
}

/** Handle one named action in the component that owns the behaviour */
export function useAction(name: string, handler: (payload: any) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const listener = (e: Event) => {
      const detail = (e as CustomEvent<{ name: string; payload: unknown }>).detail;
      if (detail.name === name) ref.current(detail.payload);
    };
    window.addEventListener(EVENT, listener);
    return () => window.removeEventListener(EVENT, listener);
  }, [name]);
}
