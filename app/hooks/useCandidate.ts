'use client';

import { useState, useEffect, useCallback } from 'react';
import type { CandidateState } from '../../server/lib/candidate-manager';

export function useCandidate() {
  const [candidateName, setCandidateName] = useState<string | null>(null);
  const [candidateState, setCandidateState] = useState<CandidateState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsName, setNeedsName] = useState(false);

  // Check localStorage on mount
  useEffect(() => {
    const storedName = localStorage.getItem('trio_cc_candidate');

    if (storedName) {
      // Try to load candidate from backend
      loadCandidate(storedName);
    } else {
      // No stored name, show modal
      setNeedsName(true);
    }
  }, []);

  const loadCandidate = async (name: string) => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/candidate/${name}`);

      if (res.ok) {
        const data = await res.json();
        setCandidateState(data.state);
        setCandidateName(name);
        localStorage.setItem('trio_cc_candidate', name);
        setNeedsName(false);
      } else if (res.status === 404) {
        // Candidate doesn't exist, clear localStorage
        localStorage.removeItem('trio_cc_candidate');
        setNeedsName(true);
      }
    } catch (err) {
      console.error('Failed to load candidate:', err);
      setNeedsName(true);
    } finally {
      setIsLoading(false);
    }
  };

  const createCandidate = useCallback(async (name: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const res = await fetch('/api/candidate/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          exerciseId: localStorage.getItem('trio_cc_exercise') || 'fibonacci',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          // Candidate exists, try to load it
          await loadCandidate(name);
          return;
        }
        throw new Error(data.error || 'Failed to create candidate');
      }

      setCandidateState(data.state);
      setCandidateName(name);
      localStorage.setItem('trio_cc_candidate', name);
      setNeedsName(false);

      // Notify backend watcher about candidate
      fetch('/api/watcher/set-candidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateName: name }),
      }).catch((err) => console.error('Failed to set watcher candidate:', err));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updatePreferences = useCallback(
    async (updates: Partial<CandidateState>) => {
      if (!candidateName) return;

      try {
        const res = await fetch(
          `/api/candidate/${candidateName}/preferences`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
          }
        );

        if (res.ok) {
          const data = await res.json();
          setCandidateState(data.state);
        }
      } catch (err) {
        console.error('Failed to update preferences:', err);
      }
    },
    [candidateName]
  );

  const triggerManualSave = useCallback(async () => {
    if (!candidateName || !candidateState) return;

    try {
      const res = await fetch(
        `/api/candidate/${candidateName}/save`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            exerciseId: candidateState.currentExercise,
          }),
        }
      );

      if (!res.ok) {
        throw new Error('Failed to save');
      }

      return true;
    } catch (err) {
      console.error('Failed to save:', err);
      return false;
    }
  }, [candidateName, candidateState]);

  /** Call after WelcomeScreen confirms, avoids stale localStorage read */
  const setActiveName = useCallback((name: string) => {
    setCandidateName(name);
    setNeedsName(false);
    localStorage.setItem('trio_cc_candidate', name);
  }, []);

  return {
    candidateName,
    candidateState,
    needsName,
    isLoading,
    error,
    createCandidate,
    updatePreferences,
    triggerManualSave,
    setActiveName,
  };
}
