'use client';

import { useState } from 'react';

interface CandidateNameModalProps {
  onSubmit: (name: string) => void;
  isLoading: boolean;
  error: string | null;
}

export function CandidateNameModal({ onSubmit, isLoading, error }: CandidateNameModalProps) {
  const [name, setName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate name
    if (!name.trim()) {
      setLocalError('Name is required');
      return;
    }

    if (name.length < 2) {
      setLocalError('Name must be at least 2 characters');
      return;
    }

    if (!/^[a-zA-Z0-9-_]+$/.test(name)) {
      setLocalError('Name can only contain letters, numbers, hyphens, and underscores');
      return;
    }

    setLocalError(null);
    onSubmit(name.trim());
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
        {/* Header */}
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Welcome to your interview
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Please enter your name to begin the coding challenge
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="candidate-name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              Your Name
            </label>
            <input
              id="candidate-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setLocalError(null);
              }}
              placeholder="john-doe"
              disabled={isLoading}
              className={`w-full px-4 py-3 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-500 disabled:opacity-50 ${
                localError || error
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
              autoFocus
            />
            {(localError || error) && (
              <p className="mt-2 text-sm text-red-500 dark:text-red-400">
                {localError || error}
              </p>
            )}
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Use letters, numbers, hyphens, or underscores only
            </p>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={isLoading || !name.trim()}
            className="w-full px-6 py-3 bg-accent-500 text-white rounded-lg font-medium hover:bg-accent-600 dark:bg-accent-600 dark:hover:bg-accent-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <span className="flex items-center justify-center">
                <svg
                  className="animate-spin h-5 w-5 mr-2"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Creating session...
              </span>
            ) : (
              'Start Interview'
            )}
          </button>
        </form>

        {/* Info */}
        <div className="mt-6 p-4 bg-blue-50 dark:bg-gray-800 border border-blue-200 dark:border-gray-700 rounded-lg">
          <p className="text-xs text-blue-800 dark:text-gray-300">
            <strong>Tip:</strong> If you have already done another challenge, please use the{' '}
            <strong>same name</strong> to keep your session history linked.
          </p>
        </div>
      </div>
    </div>
  );
}
