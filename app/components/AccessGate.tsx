'use client';

import { useEffect, useState } from 'react';
import { tokenFromLocation, withoutToken } from '../lib/accessLink';

type State = 'checking' | 'granted' | 'missing' | 'expired';

/**
 * A candidate needs the link the interviewer sent, which carries this interview's secret. The page trades it once for a
 * cookie; the server refuses everything else. The interviewer on localhost goes straight through.
 */
export function AccessGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>('checking');

  useEffect(() => {
    let cancelled = false;
    const finish = (next: State) => { if (!cancelled) setState(next); };
    const tidy = () => { try { window.history.replaceState(null, '', withoutToken(window.location)); } catch {} };

    (async () => {
      try {
        const status = await (await fetch('/api/access')).json() as { required: boolean; granted: boolean };
        if (!status.required || status.granted) { tidy(); return finish('granted'); }
        const token = tokenFromLocation(window.location);
        if (!token) return finish('missing');
        const res = await fetch('/api/access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
        if (!res.ok) return finish('expired');
        tidy();
        finish('granted');
      } catch {
        // The server is not answering: the app shows its own errors. Nothing is exposed, the server does the refusing.
        finish('granted');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (state === 'granted') return <>{children}</>;
  if (state === 'checking') {
    return <div className="h-screen bg-gray-50 dark:bg-gray-900" role="status" aria-label="Loading" />;
  }

  const expired = state === 'expired';
  return (
    <main className="flex h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
      <div className="max-w-md rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {expired ? 'This link is not valid anymore' : 'Open the link your interviewer sent you'}
        </h1>
        <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
          {expired
            ? 'Each interview has its own link. Ask your interviewer for the current one.'
            : 'The address alone is not enough, the link has a private part at the end. Use the full link exactly as you received it.'}
        </p>
      </div>
    </main>
  );
}
