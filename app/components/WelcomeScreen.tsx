'use client';

import { toSlug } from '../lib/slug';
import { useState, useEffect } from 'react';
import { TrioLogo } from './TrioLogo';
import { useTheme } from '../context/ThemeContext';
import { InterviewerPicker, type CandidateRow } from './InterviewerPicker';
import { ConfirmDialog } from './ConfirmDialog';

const LS_ROLE = 'trio_cc_role';

const LS_KEY = 'trio_cc_candidate';
const LS_LAST_SEEN = 'trio_cc_last_seen';
const SESSION_TTL_MS = 20 * 60 * 1000; // 20 minutes

interface WelcomeScreenProps {
  onReady: (name: string, isNew: boolean) => void;
  startAsInterviewer?: boolean;
}

export function WelcomeScreen({ onReady, startAsInterviewer }: WelcomeScreenProps) {
  const { theme, toggleTheme } = useTheme();
  const [existingName, setExistingName] = useState<string | null>(null);
  const [showNewInput, setShowNewInput] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [slug, setSlug] = useState('');
  const [existsWarning, setExistsWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [ready, setReady] = useState(false);
  const [isLocalHost, setIsLocalHost] = useState(false);
  const [interviewerMode, setInterviewerMode] = useState(false);
  const [confirmSwitch, setConfirmSwitch] = useState<{ row: CandidateRow; online: string[] } | null>(null);

  useEffect(() => {
    setIsLocalHost(/^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname));
    const stored = localStorage.getItem(LS_KEY);
    const lastSeen = Number(localStorage.getItem(LS_LAST_SEEN) ?? 0);
    const recent = Date.now() - lastSeen < SESSION_TTL_MS;

    if (startAsInterviewer) {
      setInterviewerMode(true);
      setReady(true);
      return;
    }

    if (stored && recent) {
      activateAndProceed(stored, false);
    } else if (stored) {
      setExistingName(stored);
      setReady(true);
    } else {
      setShowNewInput(true);
      setReady(true);
    }
  }, []);

  const activateAndProceed = async (name: string, isNew: boolean, asInterviewer?: boolean) => {
    const interviewer = asInterviewer ?? localStorage.getItem(LS_ROLE) === 'interviewer';
    if (interviewer) localStorage.setItem(LS_ROLE, 'interviewer');
    else localStorage.removeItem(LS_ROLE);
    try {
      const res = await fetch('/api/candidate/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(`Session init failed: ${body.error || res.status}. Is the server running?`);
        setChecking(false);
        return;
      }
      // Store exerciseId so chat scoping works immediately on reload
      const { exerciseId } = await res.json().catch(() => ({}));
      if (exerciseId) localStorage.setItem('trio_cc_exercise', exerciseId);
    } catch {
      setError('Cannot reach backend, is the server running?');
      setChecking(false);
      return;
    }
    localStorage.setItem(LS_KEY, name);
    localStorage.setItem(LS_LAST_SEEN, String(Date.now()));
    onReady(name, isNew);
  };

  const handleDisplayNameChange = (value: string) => {
    setDisplayName(value);
    setSlug(toSlug(value));
    setError(null);
    setExistsWarning(null);
  };

  const checkAndCreate = async () => {
    const finalSlug = slug || toSlug(displayName);
    if (!finalSlug) { setError('Please enter your name'); return; }
    if (finalSlug.length < 2) { setError('Name too short'); return; }

    setChecking(true);
    setError(null);
    setExistsWarning(null);
    try {
      const res = await fetch(
        `/api/candidate/exists?name=${encodeURIComponent(finalSlug)}`
      );
      const { exists } = await res.json();

      if (exists) {
        // Show soft warning, allow continuing (might be returning from another browser)
        setExistsWarning(finalSlug);
        setChecking(false);
        return;
      }
      await activateAndProceed(finalSlug, true, false);
    } catch {
      setError('Cannot reach backend, is the server running?');
    } finally {
      setChecking(false);
    }
  };

  const pickCandidate = (row: CandidateRow, all: CandidateRow[]) => {
    const online = all.filter(r => r.name !== row.name && r.connected > 0).map(r => r.name);
    if (!row.active && online.length > 0) setConfirmSwitch({ row, online });
    else activateAndProceed(row.name, false, true);
  };

  const clearAndSwitch = () => {
    localStorage.removeItem(LS_ROLE);
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LS_LAST_SEEN);
    setExistingName(null);
    setShowNewInput(true);
    setDisplayName('');
    setSlug('');
    setError(null);
    setExistsWarning(null);
  };

  if (!ready) return null;

  return (
    <div className={`flex items-center justify-center min-h-screen px-4 ${
      theme === 'dark' ? 'trio-login-bg-dark' : 'trio-login-bg-light'
    }`}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-sm border border-gray-100 dark:border-gray-800 overflow-hidden">

        {/* Header with logo + theme toggle */}
        <div className="px-8 pt-8 pb-6 text-center relative">
          {/* The Trio logo follows the theme by itself */}
          <div className="mb-5 flex justify-center">
            <TrioLogo size={36} animate />
          </div>

          <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Welcome
          </h1>
          {!interviewerMode && (
            <p className="mx-auto mt-3 max-w-xs text-xs text-gray-500 dark:text-gray-400">
              Your interviewer sees your work live. You will pick the assistant you want to work with once you are in.
            </p>
          )}
        </div>

        <div className="px-8 pb-8">
          {interviewerMode ? (
            <InterviewerPicker onPick={pickCandidate} onBack={() => setInterviewerMode(false)} />
          ) : (
            <>
          {/* Returning user */}
          {existingName && !showNewInput && (
            <div className="space-y-3">
              <div className="p-3.5 bg-accent-50 dark:bg-accent-900/20 rounded-xl border border-accent-100 dark:border-accent-800">
                <p className="text-xs text-accent-600 dark:text-accent-300">Welcome back</p>
                <p className="text-sm font-bold text-accent-900 dark:text-accent-200 mt-0.5">{existingName}</p>
              </div>

              <button
                onClick={() => activateAndProceed(existingName, false)}
                className="w-full py-2.5 bg-accent-500 hover:bg-accent-600 text-white font-semibold rounded-xl transition-colors text-sm"
              >
                Continue as {existingName}
              </button>

              <button
                onClick={clearAndSwitch}
                className="w-full py-2 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                title="Only clears this browser's memory, your files are safe"
              >
                Continue as someone else →
              </button>
            </div>
          )}

          {/* New name input */}
          {showNewInput && (
            <div className="space-y-3">
              <div>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => handleDisplayNameChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !existsWarning && checkAndCreate()}
                  placeholder="Your name (e.g. Jane Smith)"
                  autoFocus
                  className={`w-full px-3.5 py-2.5 border rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                    placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent-500 text-sm transition-colors ${
                    error ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'
                  }`}
                />

                {slug && (
                  <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                    Session ID:{' '}
                    <span className="font-mono text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                      {slug}
                    </span>
                  </p>
                )}

                {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
              </div>

              {/* Name already exists warning */}
              {existsWarning && !isLocalHost && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 space-y-2" data-testid="name-needs-more">
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                    Please add your last name or a number to your name, so we can tell you apart.
                  </p>
                  <button
                    onClick={() => setExistsWarning(null)}
                    className="w-full py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    OK
                  </button>
                </div>
              )}

              {existsWarning && isLocalHost && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 space-y-2">
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                    &ldquo;{existsWarning}&rdquo; already has a session.
                  </p>
                  <div className="flex gap-2">
                    {/* Primary: continue as this person */}
                    <button
                      onClick={() => activateAndProceed(existsWarning, false)}
                      className="flex-1 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      Yes, that&apos;s me
                    </button>
                    <button
                      onClick={() => { setExistsWarning(null); setDisplayName(''); setSlug(''); }}
                      className="flex-1 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 text-xs rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      Different name
                    </button>
                  </div>
                  {/* Force-enter: blurred, revealed on hover, for interviewer emergency access */}
                  <button
                    onClick={() => activateAndProceed(existsWarning, false)}
                    className="group w-full py-1 text-xs transition-all"
                    title="Force load this candidate's session (interviewer use)"
                  >
                    <span className="blur-sm group-hover:blur-none text-gray-400 dark:text-gray-600 group-hover:text-gray-500 transition-all">
                      Force open {existsWarning}&apos;s session →
                    </span>
                  </button>
                </div>
              )}

              {!existsWarning && (
                <button
                  onClick={checkAndCreate}
                  disabled={checking || !slug}
                  className="w-full py-2.5 bg-accent-500 hover:bg-accent-600 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors text-sm"
                >
                  {checking ? 'Checking...' : 'Start Challenge →'}
                </button>
              )}

              {existingName && (
                <button
                  onClick={() => { setShowNewInput(false); setError(null); setExistsWarning(null); }}
                  className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  ← Back to {existingName}
                </button>
              )}
            </div>
          )}

              {isLocalHost && (
                <button
                  onClick={() => setInterviewerMode(true)}
                  className="mt-4 w-full rounded-xl border border-gray-200 py-2 text-xs font-medium text-gray-500 transition-colors hover:border-pink-400 hover:text-pink-600 dark:border-gray-700 dark:text-gray-400 dark:hover:border-pink-500 dark:hover:text-pink-400"
                >
                  I&apos;m an interviewer
                </button>
              )}
            </>
          )}
        </div>

        {/* Footer: setup link + theme toggle */}
        <div className="px-8 pb-5 flex items-center justify-between border-t border-gray-100 dark:border-gray-800 pt-4">
          <span />
          <button onClick={toggleTheme} className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex items-center gap-1">
            {theme === 'dark'
              ? <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              : <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            }
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </div>

      {confirmSwitch && (
        <ConfirmDialog
          title={`Switch to ${confirmSwitch.row.name}?`}
          message={`${confirmSwitch.online.join(', ')} ${confirmSwitch.online.length > 1 ? 'are' : 'is'} online right now. The tool serves one candidate at a time, so opening ${confirmSwitch.row.name} switches everyone to their files.`}
          confirmLabel="Switch"
          danger
          onCancel={() => setConfirmSwitch(null)}
          onConfirm={() => { const name = confirmSwitch.row.name; setConfirmSwitch(null); activateAndProceed(name, false, true); }}
        />
      )}
    </div>
  );
}
