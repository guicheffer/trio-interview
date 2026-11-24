'use client';

import { TrioLogo } from './TrioLogo';
import { useTheme } from '../context/ThemeContext';
import { useState, useEffect } from 'react';

interface LandingPageProps {
  onWebInterface: () => void;
  onInterviewer?: () => void;
}

const ENV_CHOICE_KEY = 'trio_cc_env_choice';
const ENV_CHOICE_TTL = 10 * 60 * 1000; // 10 minutes

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}
function MonitorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="3" width="20" height="14" rx="2"/><polyline points="8 21 12 17 16 21"/><line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  );
}
function ArrowRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2">
      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
    </svg>
  );
}

export function LandingPage({ onWebInterface, onInterviewer }: LandingPageProps) {
  const [isLocalHost, setIsLocalHost] = useState(false);
  useEffect(() => {
    setIsLocalHost(/^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname));
  }, []);
  const { theme, toggleTheme } = useTheme();

  // Auto-skip to web interface if user chose it recently
  useEffect(() => {
    try {
      const stored = localStorage.getItem(ENV_CHOICE_KEY);
      if (stored) {
        const { choice, timestamp } = JSON.parse(stored);
        const isRecent = Date.now() - timestamp < ENV_CHOICE_TTL;
        if (choice === 'web' && isRecent) {
          onWebInterface();
        }
      }
    } catch {}
  }, [onWebInterface]);

  const handleWebInterface = () => {
    try {
      localStorage.setItem(ENV_CHOICE_KEY, JSON.stringify({
        choice: 'web',
        timestamp: Date.now(),
      }));
    } catch {}
    onWebInterface();
  };

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center px-4 py-12 ${
      theme === 'dark' ? 'trio-login-bg-dark' : 'trio-login-bg-light'
    }`}>

      {/* Top-right controls */}
      <div className="fixed top-4 right-4 flex items-center gap-2">
        <button
          onClick={toggleTheme}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 shadow-sm text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 transition-colors"
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
      </div>

      {/* Logo */}
      <div className="text-center mb-10">
        <TrioLogo size={40} className="mx-auto mb-4" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Live coding interviews with an AI assistant</p>
      </div>

      {/* Two-column split */}
      <div className="grid grid-cols-1 md:grid-cols-[1.35fr_1fr] gap-5 w-full max-w-4xl items-stretch">

        {/* Left: Web Interface */}
        <button
          onClick={handleWebInterface}
          className="group text-left bg-white dark:bg-gray-900 rounded-2xl border-2 border-gray-100 dark:border-gray-800 hover:border-green-500 dark:hover:border-green-500 shadow-lg hover:shadow-xl transition-all duration-200 p-9 cursor-pointer ring-2 ring-green-500/30"
        >
          <div className="flex items-center justify-between mb-6">
          <div className="w-14 h-14 rounded-xl bg-green-500 flex items-center justify-center">
            <MonitorIcon />
          </div>
          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-300">Recommended</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors mb-2">
            Use Web Interface
          </h2>
          <p className="text-base text-gray-600 dark:text-gray-300 leading-relaxed mb-6">
            Code directly in the browser with a pre-configured editor, terminal, and an AI agent. No setup required, it takes a few seconds.
          </p>
          <span className="inline-flex items-center gap-1.5 text-base font-semibold text-green-600 dark:text-green-400">
            Start coding now
            <ArrowRight />
          </span>
        </button>

      </div>

      {isLocalHost && onInterviewer && (
        <button
          onClick={onInterviewer}
          className="mt-6 rounded-xl border border-gray-200 bg-white/80 px-5 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-purple-400 hover:text-purple-600 dark:border-gray-700 dark:bg-gray-900/80 dark:text-gray-300 dark:hover:border-purple-500 dark:hover:text-purple-400"
        >
          I&apos;m an interviewer
        </button>
      )}

    </div>
  );
}
