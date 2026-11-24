'use client';

import { useFollowing } from '../lib/follow';
import { useOtherSideOnline } from '../hooks/useOtherSideOnline';
import { ShareLink } from './ShareLink';
import { useAction } from '../lib/actions';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { TrioLogo } from './TrioLogo';
import { useTheme } from '../context/ThemeContext';
import { useShowCursors } from '../lib/cursorPrefs';
import { HelpModal } from './HelpModal';

const HELP_SEEN_KEY = 'trio_cc_help_seen';

import type { SaveState } from './MonacoCodeViewer';

interface HeaderProps {
  isConnected: boolean;
  /** The platform works on another candidate than the one shown here; the dot says so and offers a way back */
  inactive?: boolean;
  onResolveInactive?: () => void;
  exerciseTitle: string;
  candidateName: string | null;
  onSave?: () => Promise<void>;
  onEditName?: () => void;
  saveState?: SaveState;
  onShowShortcuts?: () => void;
  /** Interviewer looking at a candidate's workspace */
  interviewerView?: boolean;
  onSwitchCandidate?: () => void;
  /** Back to the first page, where the web interface or the person's own IDE is chosen */
  onGoHome?: () => void;
}

function FollowSwitch({ interviewerView }: { interviewerView?: boolean }) {
  const [following, setFollowing] = useFollowing();
  return (
    <button
      onClick={() => setFollowing(!following)}
      role="switch"
      aria-checked={following}
      title={following
        ? 'Following: your view mirrors the other person (open files, scroll, preview, tabs). Click to stop.'
        : 'Not following: you navigate on your own. Content and cursors stay live. Click to follow the other person.'}
      className={`hidden flex-shrink-0 items-center gap-2 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors md:inline-flex ${
        following
          ? 'border-purple-400 bg-purple-100 text-purple-800 dark:border-purple-500 dark:bg-purple-900/40 dark:text-purple-200'
          : 'border-gray-300 text-gray-500 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700'
      }`}
    >
      Follow {interviewerView ? 'candidate' : 'interviewer'}
      <span className={`relative inline-block h-3.5 w-6 rounded-full transition-colors ${following ? 'bg-purple-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
        <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white shadow transition-all ${following ? 'left-3' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

export function Header({ isConnected, inactive, onResolveInactive, exerciseTitle, candidateName, onSave, onEditName, saveState = 'idle', onShowShortcuts, interviewerView, onSwitchCandidate, onGoHome }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const otherOnline = useOtherSideOnline();
  const [following, setFollowing] = useFollowing();
  const [showCursors, setShowCursors] = useShowCursors();
  useAction('view:theme', () => toggleTheme());
  useAction('view:cursors', () => setShowCursors(!showCursors));
  useAction('view:follow', () => setFollowing(!following));
  useAction('session:switch', () => onSwitchCandidate?.());

  const [isManualSaving, setIsManualSaving] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [helpFirstVisit, setHelpFirstVisit] = useState(false);
  useAction('help:open', () => { setHelpFirstVisit(false); setShowHelp(true); });

  // A candidate sees the help once, the first time they open the tool; the interviewer never gets it pushed
  useEffect(() => {
    if (interviewerView || !candidateName) return;
    try {
      if (localStorage.getItem(HELP_SEEN_KEY)) return;
      localStorage.setItem(HELP_SEEN_KEY, '1');
    } catch { return; }
    setHelpFirstVisit(true);
    setShowHelp(true);
  }, [interviewerView, candidateName]);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!showMenu) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (menuBtnRef.current?.contains(e.target as Node)) return;
      setShowMenu(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showMenu]);

  return (
    <>
    <header className="h-16 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 lg:px-6 flex items-center justify-between gap-2 overflow-visible" style={{ zIndex: 50, position: 'relative' }}>
      {/* Left: Logo */}
      <div className="flex items-center space-x-2 lg:space-x-4 flex-shrink-0">
        <TrioLogo size={28} />
        <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 hidden md:block" />
        <h1 className="text-sm lg:text-lg font-semibold text-gray-900 dark:text-gray-100 truncate max-w-[150px] lg:max-w-none hidden md:block">
          {exerciseTitle || 'Live Coding Interview'}
        </h1>
        {candidateName && (
          <>
            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 hidden md:block" />
            <button
              onClick={interviewerView ? undefined : onEditName}
              disabled={interviewerView}
              className={`flex items-center space-x-1.5 lg:space-x-2 px-2 lg:px-3 py-1 rounded transition-colors flex-shrink-0 ${interviewerView ? 'cursor-default' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
              title={interviewerView ? 'Candidate name (read only in interviewer view)' : 'Click to edit name'}
            >
              <svg
                className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-gray-600 dark:text-gray-400 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              <span className="text-xs lg:text-sm font-medium text-gray-700 dark:text-gray-300 truncate max-w-[80px] lg:max-w-[120px]">
                {candidateName}
              </span>
            </button>
            {otherOnline && <FollowSwitch interviewerView={interviewerView} />}
            {interviewerView && (
              <>
                <span className="hidden flex-shrink-0 rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 md:inline">
                  Interviewer view
                </span>
                <button
                  onClick={onSwitchCandidate}
                  className="hidden flex-shrink-0 text-xs text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline dark:text-gray-400 dark:hover:text-gray-200 md:inline"
                >
                  Switch candidate
                </button>
                <ShareLink candidateName={candidateName} />
              </>
            )}
          </>
        )}
      </div>

      {/* Right: Save + Theme toggle + Connection status */}
      <div className="flex items-center space-x-2 lg:space-x-4 flex-shrink-0">
        {/* Save indicator / manual save button */}
        {saveState === 'saving' && (
          <div className="flex items-center space-x-1 lg:space-x-1.5 text-xs lg:text-sm text-gray-500 dark:text-gray-400">
            <svg className="w-3 h-3 lg:w-3.5 lg:h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <span className="hidden lg:inline">Saving...</span>
          </div>
        )}
        {saveState === 'saved' && (
          <div className="flex items-center space-x-1 lg:space-x-1.5 text-xs lg:text-sm text-green-600 dark:text-green-400">
            <svg className="w-3 h-3 lg:w-3.5 lg:h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
            </svg>
            <span className="hidden lg:inline">Saved</span>
          </div>
        )}
        {saveState === 'unsaved' && onSave && (
          <button
            onClick={async () => {
              if (isManualSaving) return;
              setIsManualSaving(true);
              try { await onSave(); } catch {}
              finally { setIsManualSaving(false); }
            }}
            disabled={isManualSaving}
            className="flex items-center space-x-1 lg:space-x-1.5 px-2 lg:px-3 py-1 lg:py-1.5 rounded-lg bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/40 text-orange-600 dark:text-orange-400 transition-colors text-xs lg:text-sm font-medium disabled:opacity-50 whitespace-nowrap"
            title="Unsaved changes, click to save now"
          >
            <svg className="w-3 h-3 lg:w-3.5 lg:h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/>
            </svg>
            <span className="hidden md:inline">Save now</span>
            <span className="md:hidden">Save</span>
          </button>
        )}

        {/* Connection status */}
        {inactive ? (
          <button onClick={onResolveInactive} data-testid="session-inactive" title="This session is not the active one. Click to fix it."
            className="flex items-center space-x-1.5 rounded-lg px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-900/30 lg:text-sm">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span>Not active</span>
          </button>
        ) : (
          <div className="flex items-center space-x-1.5 lg:space-x-2">
            <div className={`w-2 h-2 rounded-full ${!isConnected ? 'bg-red-500' : interviewerView && !otherOnline ? 'bg-gray-400' : 'bg-green-500'}`} />
            <span className="text-xs lg:text-sm text-gray-600 dark:text-green-300 hidden sm:inline">
              {!isConnected ? 'Disconnected' : interviewerView && !otherOnline ? 'Candidate offline' : 'Connected'}
            </span>
          </div>
        )}

        {interviewerView && (
          <button
            onClick={() => { setHelpFirstVisit(false); setShowHelp(true); }}
            className="rounded-lg px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Help
          </button>
        )}

        <button
          onClick={() => onShowShortcuts?.()}
          title="Shortcuts and commands (?)"
          aria-label="Shortcuts and commands"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 text-xs font-bold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
        >
          ?
        </button>

        {/* Settings menu */}
        <div className="relative">
          <button
            ref={menuBtnRef}
            data-help-target
            onClick={() => {
              if (!showMenu && menuBtnRef.current) {
                const rect = menuBtnRef.current.getBoundingClientRect();
                setMenuPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
              }
              setShowMenu(!showMenu);
            }}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Settings"
          >
            {/* Hamburger menu */}
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-gray-600 dark:text-gray-400" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" strokeLinecap="round"/>
              <line x1="3" y1="12" x2="21" y2="12" strokeLinecap="round"/>
              <line x1="3" y1="18" x2="21" y2="18" strokeLinecap="round"/>
            </svg>
          </button>

          {showMenu && menuPos && typeof document !== 'undefined' && createPortal(
            <div ref={menuRef} className="w-80 max-w-[calc(100vw-1rem)] bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-1"
              style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 99999 }}>
              <button
                onClick={() => { onShowShortcuts?.(); setShowMenu(false); }}
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="4" width="20" height="16" rx="2"/>
                    <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h8M6 16h12" strokeLinecap="round"/>
                  </svg>
                  Keyboard Shortcuts
                </div>
                <kbd className="px-1.5 py-0.5 text-xs font-mono bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">?</kbd>
              </button>
              <button
                onClick={() => { setHelpFirstVisit(false); setShowHelp(true); setShowMenu(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01" strokeLinecap="round"/></svg>
                Help
              </button>
              <hr className="my-1 border-gray-100 dark:border-gray-700"/>
              <button
                onClick={() => { toggleTheme(); setShowMenu(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {theme === 'dark'
                  ? <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                  : <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                }
                Switch to {theme === 'dark' ? 'Light' : 'Dark'} Mode
              </button>
              <button
                onClick={() => { setShowCursors(!showCursors); setShowMenu(false); }}
                className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <span className="flex items-center gap-3 whitespace-nowrap text-left"><svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2"><path d="M4 3l7 17 2.5-7.5L21 10z" strokeLinejoin="round"/></svg>
                Show {interviewerView ? "candidate's" : "interviewer's"} cursor</span>
                <span className={`relative inline-block h-4 w-7 rounded-full transition-colors ${showCursors ? 'bg-purple-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                  <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${showCursors ? 'left-3.5' : 'left-0.5'}`} />
                </span>
              </button>
              {otherOnline && (
              <button
                onClick={() => setFollowing(!following)}
                className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <span className="flex items-center gap-3 whitespace-nowrap text-left">
                  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  Follow {interviewerView ? 'candidate' : 'interviewer'}
                </span>
                <span className={`relative inline-block h-4 w-7 rounded-full transition-colors ${following ? 'bg-purple-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                  <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${following ? 'left-3.5' : 'left-0.5'}`} />
                </span>
              </button>
              )}
              {onGoHome && (
                <>
                  <hr className="my-1 border-gray-100 dark:border-gray-700"/>
                  <button
                    onClick={() => { setShowMenu(false); onGoHome(); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2"><path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    Back to the home page
                  </button>
                </>
              )}
            </div>,
            document.body
          )}
        </div>
      </div>
    </header>

    {showHelp && <HelpModal role={interviewerView ? 'interviewer' : 'candidate'} animated={helpFirstVisit} onClose={() => { setShowHelp(false); setHelpFirstVisit(false); }} />}
    </>
  );
}
