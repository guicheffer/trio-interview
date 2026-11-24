'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { nanoid } from 'nanoid';
import { ClaudeModel } from './useClaudeStream';
import { DEFAULT_MODEL } from '../../shared/models';
import { useRemoteKey } from './useRemoteKey';

export interface ChatThread {
  id: string;
  title: string;
  model: ClaudeModel;
  createdAt: number;
  /** The title is a placeholder cut from the first message and may be replaced by a generated one */
  titleAuto?: boolean;
}

const DEFAULT_TITLE = 'New chat';

function loadThreads(baseKey: string): ChatThread[] {
  try {
    const stored = localStorage.getItem(`trio_cc_threads_${baseKey}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [];
}

function loadClosedThreads(baseKey: string): ChatThread[] {
  try {
    const stored = localStorage.getItem(`trio_cc_threads_closed_${baseKey}`);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

function saveThreads(baseKey: string, threads: ChatThread[]) {
  try {
    localStorage.setItem(`trio_cc_threads_${baseKey}`, JSON.stringify(threads));
  } catch {}
}

function saveClosedThreads(baseKey: string, threads: ChatThread[]) {
  try {
    localStorage.setItem(`trio_cc_threads_closed_${baseKey}`, JSON.stringify(threads.slice(0, 20)));
  } catch {}
}

function saveActiveThreadId(baseKey: string, id: string) {
  try {
    localStorage.setItem(`trio_cc_active_thread_${baseKey}`, id);
  } catch {}
}

function loadActiveThreadId(baseKey: string): string | null {
  try {
    return localStorage.getItem(`trio_cc_active_thread_${baseKey}`);
  } catch {}
  return null;
}

export function useMultiChat(baseKey: string | undefined) {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [closedThreads, setClosedThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadIdState] = useState<string>('');
  const [unreadThreadIds, setUnreadThreadIds] = useState<Set<string>>(new Set());
  const prevBaseKey = useRef<string | undefined>(undefined);

  // Another screen opened, renamed or switched chats
  useRemoteKey(baseKey ? `trio_cc_threads_${baseKey}` : undefined, (value) => {
    try {
      const parsed = value ? JSON.parse(value) : [];
      if (Array.isArray(parsed) && parsed.length > 0) setThreads(parsed);
    } catch {}
  });
  useRemoteKey(baseKey ? `trio_cc_threads_closed_${baseKey}` : undefined, (value) => {
    try {
      const parsed = value ? JSON.parse(value) : [];
      if (Array.isArray(parsed)) setClosedThreads(parsed);
    } catch {}
  });
  useRemoteKey(baseKey ? `trio_cc_active_thread_${baseKey}` : undefined, (value) => {
    if (value) setActiveThreadIdState(value);
  });

  // Which chat is in front is always written down, so a screen that turns Follow on can see it even if it was never clicked
  useEffect(() => {
    if (baseKey && activeThreadId) saveActiveThreadId(baseKey, activeThreadId);
  }, [baseKey, activeThreadId]);

  const setActiveThreadId = useCallback((id: string) => {
    setActiveThreadIdState(id);
    // Clear unread when switching to a thread
    setUnreadThreadIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    if (baseKey) saveActiveThreadId(baseKey, id);
  }, [baseKey]);

  const markThreadUnread = useCallback((chatKey: string) => {
    // chatKey is like `candidateName_exerciseId_threadId`
    // extract threadId = last segment
    const threadId = chatKey.split('_').pop();
    if (threadId) {
      setUnreadThreadIds(prev => {
        const next = new Set(prev);
        next.add(threadId);
        return next;
      });
    }
  }, []);

  // When baseKey becomes available or changes (candidate/exercise switch), load threads
  useEffect(() => {
    if (!baseKey) return;
    if (baseKey === prevBaseKey.current) return;
    prevBaseKey.current = baseKey;

    const loaded = loadThreads(baseKey);
    const closed = loadClosedThreads(baseKey);
    setClosedThreads(closed);

    if (loaded.length > 0) {
      setThreads(loaded);
      // Restore last active thread
      const savedActiveId = loadActiveThreadId(baseKey);
      const restored = savedActiveId && loaded.find(t => t.id === savedActiveId);
      setActiveThreadIdState(restored ? savedActiveId! : loaded[0].id);
    } else {
      const first: ChatThread = { id: nanoid(), title: DEFAULT_TITLE, model: DEFAULT_MODEL, createdAt: Date.now() };
      setThreads([first]);
      setActiveThreadIdState(first.id);
      saveThreads(baseKey, [first]);
    }
  }, [baseKey]);

  // Persist threads whenever they change
  useEffect(() => {
    if (!baseKey || threads.length === 0) return;
    saveThreads(baseKey, threads);
  }, [threads, baseKey]);

  const createThread = useCallback((model: ClaudeModel = DEFAULT_MODEL): string => {
    const thread: ChatThread = { id: nanoid(), title: DEFAULT_TITLE, model, createdAt: Date.now() };
    setThreads(prev => [...prev, thread]);
    setActiveThreadId(thread.id);
    return thread.id;
  }, [setActiveThreadId]);

  const deleteThread = useCallback((id: string) => {
    setThreads(prev => {
      const thread = prev.find(t => t.id === id);
      if (!thread) return prev;

      const next = prev.filter(t => t.id !== id);

      // Move to closed list, use functional update to avoid duplicates
      setClosedThreads(prevClosed => {
        // Prevent duplicate: skip if already in closed list
        if (prevClosed.some(t => t.id === id)) return prevClosed;
        const updated = [thread, ...prevClosed];
        if (baseKey) saveClosedThreads(baseKey, updated);
        return updated;
      });

      if (next.length === 0) {
        const fresh: ChatThread = { id: nanoid(), title: DEFAULT_TITLE, model: DEFAULT_MODEL, createdAt: Date.now() };
        if (baseKey) saveThreads(baseKey, [fresh]);
        setActiveThreadId(fresh.id);
        return [fresh];
      }
      setActiveThreadId(next[0].id);
      return next;
    });
  }, [baseKey, setActiveThreadId]);

  const restoreThread = useCallback((id: string) => {
    setClosedThreads(prev => {
      const thread = prev.find(t => t.id === id);
      if (!thread) return prev;
      setThreads(prevThreads => {
        const updated = [thread, ...prevThreads];
        if (baseKey) saveThreads(baseKey, updated);
        return updated;
      });
      setActiveThreadId(id);
      const updated = prev.filter(t => t.id !== id);
      if (baseKey) saveClosedThreads(baseKey, updated);
      return updated;
    });
  }, [baseKey, setActiveThreadId]);

  const renameThread = useCallback((id: string, title: string) => {
    setThreads(prev => prev.map(t => t.id === id ? { ...t, title: title.trim() || DEFAULT_TITLE, titleAuto: false } : t));
  }, []);

  const reorderThreads = useCallback((fromId: string, toId: string) => {
    setThreads(prev => {
      const from = prev.findIndex(t => t.id === fromId);
      const to = prev.findIndex(t => t.id === toId);
      if (from < 0 || to < 0 || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const setThreadModel = useCallback((id: string, model: ClaudeModel) => {
    setThreads(prev => prev.map(t => t.id === id ? { ...t, model } : t));
  }, []);

  // Auto-title a thread from its first user message (simple local truncation)
  const autoTitleThread = useCallback((id: string, firstMessage: string) => {
    setThreads(prev => prev.map(t => {
      if (t.id !== id || t.title !== DEFAULT_TITLE) return t;
      const clean = firstMessage.replace(/@\S+\s*/g, '').replace(/^(Before making.*\n\n)/s, '').trim();
      const title = clean.slice(0, 40) || DEFAULT_TITLE;
      return { ...t, title, titleAuto: true };
    }));
  }, []);

  // Replace the placeholder with a generated title, unless somebody renamed the chat meanwhile
  const applyGeneratedTitle = useCallback((id: string, title: string) => {
    const clean = title.trim();
    if (!clean) return;
    setThreads(prev => prev.map(t => (t.id === id && t.titleAuto ? { ...t, title: clean, titleAuto: false } : t)));
  }, []);

  const activeThread = threads.find(t => t.id === activeThreadId) ?? threads[0];

  // Full chat key scoped to the active thread
  const activeChatKey = baseKey && activeThread ? `${baseKey}_${activeThread.id}` : undefined;

  return {
    threads,
    closedThreads,
    activeThread,
    activeThreadId,
    setActiveThreadId,
    activeChatKey,
    unreadThreadIds,
    markThreadUnread,
    createThread,
    deleteThread,
    restoreThread,
    renameThread,
    reorderThreads,
    setThreadModel,
    autoTitleThread,
    applyGeneratedTitle,
  };
}
