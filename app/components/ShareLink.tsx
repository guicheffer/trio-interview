'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

type Link = { state: 'loading' } | { state: 'ready'; url: string } | { state: 'none' } | { state: 'error' };

/**
 * Interviewer only. Shows the link to send the candidate and a Copy button. The link is asked for when the box opens,
 * so the private code is not in the page until the interviewer wants it. The button pulses for a few seconds when it
 * first appears (right after the candidate is picked) so it is easy to find.
 */
export function ShareLink({ candidateName }: { candidateName: string }) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(true);
  const [link, setLink] = useState<Link>({ state: 'loading' });
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxId = useId();

  useEffect(() => {
    setHighlight(true);
    const t = setTimeout(() => setHighlight(false), 5000);
    return () => clearTimeout(t);
  }, [candidateName]);

  const load = useCallback(async () => {
    setLink({ state: 'loading' });
    try {
      const res = await fetch('/api/interviewer/share-link', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const { url } = await res.json();
      setLink(url ? { state: 'ready', url } : { state: 'none' });
    } catch {
      setLink({ state: 'error' });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    load();
    const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, load]);

  useEffect(() => {
    if (link.state === 'ready') inputRef.current?.select();
  }, [link]);

  const copy = async () => {
    if (link.state !== 'ready') return;
    try {
      await navigator.clipboard.writeText(link.url);
    } catch {
      inputRef.current?.select();
      document.execCommand?.('copy');
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div ref={rootRef} className="relative hidden flex-shrink-0 md:block">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => { setOpen(o => !o); setHighlight(false); }}
        aria-expanded={open}
        aria-controls={boxId}
        title="Copy the link to send the candidate"
        className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-500 ${
          highlight
            ? 'animate-pulse border-pink-400 bg-pink-100 text-pink-800 ring-2 ring-pink-400 dark:border-pink-500 dark:bg-pink-900/50 dark:text-pink-200'
            : 'border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
        }`}
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
        Share
      </button>

      {open && (
        <div
          id={boxId}
          role="dialog"
          aria-label="Share the candidate link"
          className="absolute right-0 top-full z-50 mt-2 w-[min(28rem,90vw)] rounded-lg border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-700 dark:bg-gray-800"
        >
          <p className="mb-2 text-xs text-gray-600 dark:text-gray-300">
            Send this whole link to the candidate. It is new for every interview.
          </p>
          {link.state === 'ready' ? (
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                readOnly
                value={link.url}
                aria-label="Candidate link"
                onFocus={e => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-md border border-gray-300 bg-gray-50 px-2 py-1.5 font-mono text-xs text-gray-800 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
              <button
                type="button"
                onClick={copy}
                className="flex-shrink-0 rounded-md bg-pink-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-pink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-500"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          ) : (
            <p className="text-xs text-gray-700 dark:text-gray-200">
              {link.state === 'loading' && 'Getting the link...'}
              {link.state === 'none' && 'There is no link to share yet. Start the interview with make start and install ngrok (brew install ngrok, then ngrok config add-authtoken), so there is a tunnel.'}
              {link.state === 'error' && 'Could not get the link. Is the server running?'}
            </p>
          )}
          <span role="status" aria-live="polite" className="sr-only">{copied ? 'Link copied' : ''}</span>
        </div>
      )}
    </div>
  );
}
