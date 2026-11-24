'use client';

import { useState } from 'react';

interface AiUnavailableProps {
  interviewer: boolean;
  message: string;
  onRecheck: () => Promise<void>;
}

/** Covers the chat with a blur when the assistant does not work, so nobody types into a chat that will not answer */
export function AiUnavailable({ interviewer, message, onRecheck }: AiUnavailableProps) {
  const [checking, setChecking] = useState(false);

  const recheck = async () => {
    setChecking(true);
    try { await onRecheck(); } finally { setChecking(false); }
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/60 p-6 backdrop-blur-md dark:bg-gray-900/60">
      <div className="max-w-xs rounded-xl border border-gray-200 bg-white p-5 text-center shadow-lg dark:border-gray-700 dark:bg-gray-800">
        {interviewer ? (
          <>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">The AI assistant is not working</h3>
            <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">{message || 'The check did not get an answer.'}</p>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Candidates see this panel blurred until it works. Check that the assistant is signed in and has budget left.</p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                onClick={recheck}
                disabled={checking}
                className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {checking ? 'Checking...' : 'Check again'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">The AI assistant is not available</h3>
            <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">Your interviewer has not set it up yet. Let them know. You can keep working in the editor and the terminal.</p>
          </>
        )}
      </div>
    </div>
  );
}
