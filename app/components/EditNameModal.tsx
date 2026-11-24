'use client';

import { useState } from 'react';
import { toSlug } from '../lib/slug';

interface EditNameModalProps {
  currentName: string;
  onSave: (newName: string) => void;
  onCancel: () => void;
  isLoading: boolean;
  error: string | null;
}

export function EditNameModal({ currentName, onSave, onCancel }: EditNameModalProps) {
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Spaces and accents are fine to type, the folder name is made from them
    const trimmed = toSlug(name);

    if (!trimmed) { setError('Please enter a name'); return; }
    if (trimmed.length < 2) { setError('Name must be at least 2 characters'); return; }
    if (trimmed === currentName) { onCancel(); return; }

    setChecking(true);
    setError(null);

    try {
      // 1. Check if the new name already exists
      const checkRes = await fetch(
        `/api/candidate/exists?name=${encodeURIComponent(trimmed)}`
      );
      const { exists } = await checkRes.json();
      if (exists) {
        setError(`"${trimmed}" is already taken, choose a different name`);
        setChecking(false);
        return;
      }

      // 2. Rename .solutions/oldName → .solutions/newName on the backend
      const renameRes = await fetch('/api/candidate/rename', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(localStorage.getItem('trio_cc_role') === 'interviewer' ? { 'x-trio-role': 'interviewer' } : {}),
        },
        body: JSON.stringify({ oldName: currentName, newName: trimmed }),
      });
      if (!renameRes.ok) {
        const body = await renameRes.json().catch(() => ({ error: `HTTP ${renameRes.status}` }));
        setError(body.error || 'Rename failed');
        setChecking(false);
        return;
      }

      // 3. Update localStorage + notify parent (triggers reload)
      localStorage.setItem('trio_cc_candidate', trimmed);
      onSave(trimmed);
    } catch {
      setError('Cannot reach backend');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
          Change your name
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          Your session folder will be renamed to match.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              disabled={checking}
              className={`w-full px-4 py-2.5 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 ${
                error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
              }`}
              autoFocus
            />
            {!error && toSlug(name) && toSlug(name) !== name.trim() && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Saved as <span className="font-mono">{toSlug(name)}</span></p>
            )}
            {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={checking}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={checking || !toSlug(name) || toSlug(name) === currentName}
              className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {checking ? 'Checking...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
