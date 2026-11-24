'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { DEFAULT_MODEL, getModelOption, needsCompaction, type ModelKey } from '../../shared/models';
import { useRemoteKey } from './useRemoteKey';
import { interpretClaudeEvent, type ChatEffect } from '../lib/claudeEvents';
import { collab } from '../lib/collab';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** Who sent it, when the message is the person's own */
  from?: 'interviewer' | 'candidate';
}

function appendAssistant(prev: ClaudeMessage[], text: string): ClaudeMessage[] {
  if (!text) return prev;
  const last = prev[prev.length - 1];
  if (last && last.role === 'assistant') {
    return [...prev.slice(0, -1), { ...last, content: last.content + text }];
  }
  return [...prev, { role: 'assistant', content: text, timestamp: Date.now() }];
}

function replaceLastAssistant(prev: ClaudeMessage[], content: string): ClaudeMessage[] {
  const last = prev[prev.length - 1];
  if (last?.role === 'assistant') return [...prev.slice(0, -1), { ...last, content }];
  return [...prev, { role: 'assistant', content, timestamp: Date.now() }];
}

export type ClaudeModel = ModelKey;

function getFromStorage(key: string): ClaudeMessage[] {
  try {
    const s = localStorage.getItem(key);
    if (s) { const p = JSON.parse(s); if (Array.isArray(p)) return p; }
  } catch {}
  return [];
}

function saveToStorage(key: string, msgs: ClaudeMessage[]) {
  try { localStorage.setItem(key, JSON.stringify(msgs.slice(-100))); } catch {}
}

/** How long a chat counts as waiting for an answer after it was sent, when the page comes back or the stream reopens */
const WAITING_FLAG_MS = 600000;
const RECONNECT_MS = 1000;
/** Pings come every 10 s; this long without anything means the stream is dead */
const STREAM_SILENCE_MS = 35000;

export function useClaudeStream(
  sessionId: string,
  onClaudeDone?: () => void,
  chatKey?: string,
  onUnreadThread?: (threadChatKey: string) => void,
  onFileChanged?: (filePath: string) => void,
) {
  const onFileChangedRef = useRef(onFileChanged);
  useEffect(() => { onFileChangedRef.current = onFileChanged; }, [onFileChanged]);
  const streamedRef = useRef(false);
  const [contextTokens, setContextTokens] = useState<number | null>(null);
  // Tokens of the earlier context windows of this chat, which were summarized away: the chat total is these plus the window in use
  const [archivedTokens, setArchivedTokens] = useState(0);
  const contextRef = useRef<number | null>(null);
  contextRef.current = contextTokens;
  const archivedRef = useRef(0);
  archivedRef.current = archivedTokens;
  const storageKey = `trio_cc_chat_${chatKey || sessionId}`;

  // Use a ref so the connect() closure always reads the current storageKey
  const storageKeyRef = useRef(storageKey);
  useEffect(() => { storageKeyRef.current = storageKey; }, [storageKey]);

  const [messages, setMessages] = useState<ClaudeMessage[]>([]);
  const [selectedModel, setSelectedModel] = useState<ClaudeModel>(DEFAULT_MODEL);
  const [isConnected, setIsConnected] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  // Per-thread thinking: tracks which storageKey is currently pending a response
  const pendingKeyRef = useRef<string | null>(null);
  const [editingFile, setEditingFile] = useState<string | null>(null);

  const prevStorageKey = useRef<string | null>(null);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // Load history when chatKey / storageKey changes
  useEffect(() => {
    if (!chatKey) return;

    if (!initialLoadDone) {
      setInitialLoadDone(true);
      const msgs = getFromStorage(storageKey);
      if (msgs.length > 0) setMessages(msgs);
      prevStorageKey.current = storageKey;
      return;
    }

    if (storageKey === prevStorageKey.current) return;
    prevStorageKey.current = storageKey;

    // Load messages for the newly active thread
    const msgs = getFromStorage(storageKey);
    setMessages(msgs);

    // Only reset thinking if the pending response is NOT for this thread
    if (pendingKeyRef.current !== storageKey) {
      setIsThinking(false);
      setEditingFile(null);
    } else {
      // Switched to the thread that IS waiting, show thinking state
      setIsThinking(true);
    }
  }, [storageKey, chatKey, initialLoadDone]);

  useEffect(() => {
    if (!chatKey) return;
    try {
      const v = Number(localStorage.getItem(`trio_cc_ctx_${chatKey}`));
      setContextTokens(v > 0 ? v : null);
    } catch { setContextTokens(null); }
  }, [storageKey, chatKey]);

  useEffect(() => {
    if (!chatKey) return;
    try { setArchivedTokens(Number(localStorage.getItem(`trio_cc_ctxarch_${chatKey}`)) || 0); } catch { setArchivedTokens(0); }
  }, [storageKey, chatKey]);
  useRemoteKey(chatKey ? `trio_cc_ctxarch_${chatKey}` : undefined, (value) => setArchivedTokens(Number(value) || 0));

  // The other screen's token count for this chat
  useRemoteKey(chatKey ? `trio_cc_ctx_${chatKey}` : undefined, (value) => {
    const n = Number(value);
    setContextTokens(n > 0 ? n : null);
  });

  // Persist messages whenever they change
  useEffect(() => { saveToStorage(storageKey, messages); }, [messages, storageKey]);

  // The other screen (candidate or interviewer) added to this same chat
  useRemoteKey(chatKey ? storageKey : undefined, (value) => {
    // The screen that is receiving the answer is the source of truth, a copy coming back from the other screen is older
    if (pendingKeyRef.current === storageKeyRef.current) return;
    try {
      const parsed = value ? JSON.parse(value) : [];
      if (Array.isArray(parsed)) setMessages(parsed);
    } catch {}
  });

  // Whoever sends a message flags the thread as busy, so both screens show it and lock Send.
  // The SSE handler is created once, so the flag key lives in a ref set when the message is sent.
  const thinkingKey = chatKey ? `trio_cc_thinking_${chatKey}` : undefined;
  const thinkingFlagKeyRef = useRef<string | null>(null);
  const thinkingKeyRef = useRef(thinkingKey);
  thinkingKeyRef.current = thinkingKey;
  const flagThinking = (busy: boolean) => {
    const key = thinkingFlagKeyRef.current;
    if (!key) return;
    try { localStorage.setItem(key, busy ? String(Date.now()) : '0'); } catch {}
  };
  useRemoteKey(thinkingKey, (value) => {
    const startedAt = Number(value) || 0;
    setIsThinking(startedAt > 0 && Date.now() - startedAt < WAITING_FLAG_MS);
  });

  const esRef = useRef<EventSource | null>(null);
  const lastEventAt = useRef(Date.now());
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHistory = useCallback(() => {
    localStorage.removeItem(storageKey);
    try { if (chatKey) { localStorage.removeItem(`trio_cc_ctx_${chatKey}`); localStorage.removeItem(`trio_cc_ctxarch_${chatKey}`); } } catch {}
    setContextTokens(null);
    setArchivedTokens(0);
    setMessages([]);
  }, [storageKey, chatKey]);

  const handleClaudeEvent = (data: Record<string, any>) => {
    if (data.type === 'system') return;
    // Messages a subagent writes to itself are not part of this conversation
    if (data.parent_tool_use_id) return;

    // The target key is where this response should land (locked at send time)
    const targetKey = pendingKeyRef.current ?? storageKeyRef.current;
    const isActive = targetKey === storageKeyRef.current;

    const updateMessages = (updater: (prev: ClaudeMessage[]) => ClaudeMessage[]) => {
      if (isActive) {
        setMessages(updater);
      } else {
        // Background thread: write to localStorage directly
        const prev = getFromStorage(targetKey);
        const next = updater(prev);
        saveToStorage(targetKey, next);
        // Notify unread, extract thread chatKey from targetKey
        if (onUnreadThread) {
          const threadChatKey = targetKey.replace(/^trio_cc_chat_/, '');
          onUnreadThread(threadChatKey);
        }
      }
    };

    const applyEffect = (effect: ChatEffect) => {
      switch (effect.kind) {
        case 'thinking':
          if (isActive) setIsThinking(effect.value);
          break;
        case 'append':
          updateMessages(prev => appendAssistant(prev, effect.text));
          break;
        case 'replaceLast':
          updateMessages(prev => replaceLastAssistant(prev, effect.text));
          break;
        case 'context':
          if (isActive) {
            setContextTokens(effect.total);
            try { localStorage.setItem(`trio_cc_ctx_${targetKey.replace(/^trio_cc_chat_/, '')}`, String(effect.total)); } catch {}
          }
          break;
        case 'stopped':
          if (isActive) { setIsThinking(false); setEditingFile(null); }
          flagThinking(false);
          pendingKeyRef.current = null;
          break;
        case 'done':
          pendingKeyRef.current = null;
          onClaudeDone?.();
          break;
        case 'sessionExpired':
          try { localStorage.removeItem(`trio_cc_claude_sid_${targetKey}`); } catch {}
          updateMessages(prev => appendAssistant(prev, '\nSession expired, send your message again to start a new conversation.'));
          break;
      }
    };

    const { effects, streamed } = interpretClaudeEvent(data, streamedRef.current);
    streamedRef.current = streamed;
    for (const effect of effects) applyEffect(effect);
  };
  const handleClaudeEventRef = useRef(handleClaudeEvent);
  handleClaudeEventRef.current = handleClaudeEvent;

  const connect = useCallback(() => {
    if (esRef.current) esRef.current.close();

    // If this chat is waiting for an answer, or was when the page went away, ask the server for that turn again:
    // whatever it said while the stream was down comes back from the turn it keeps
    let replay = pendingKeyRef.current !== null;
    try {
      const flagKey = thinkingKeyRef.current;
      const startedAt = flagKey ? Number(localStorage.getItem(flagKey)) || 0 : 0;
      if (startedAt > 0 && Date.now() - startedAt < WAITING_FLAG_MS) {
        replay = true;
        thinkingFlagKeyRef.current = flagKey ?? null;
      }
    } catch {}
    lastEventAt.current = Date.now();
    const eventSource = new EventSource(`/api/stream?sessionId=${sessionId}${replay ? '&replay=1' : ''}`);
    esRef.current = eventSource;

    eventSource.addEventListener('connection', () => { lastEventAt.current = Date.now(); setIsConnected(true); });
    // The server pings every few seconds; each ping proves the stream is alive and is what the watchdog below looks for
    eventSource.addEventListener('ping', () => { lastEventAt.current = Date.now(); setIsConnected(true); });

    eventSource.addEventListener('editing-file', (event) => {
      try {
        const { filePath } = JSON.parse((event as MessageEvent).data);
        setEditingFile(filePath);
        setTimeout(() => setEditingFile(null), 4000);
      } catch {}
    });

    eventSource.addEventListener('file-changed', (event) => {
      try {
        const { filePath } = JSON.parse((event as MessageEvent).data);
        if (filePath) onFileChangedRef.current?.(filePath);
      } catch {}
    });

    eventSource.addEventListener('session-id', (event) => {
      try {
        const sid = (event as MessageEvent).data;
        const key = storageKeyRef.current;
        if (sid && key) localStorage.setItem(`trio_cc_claude_sid_${key}`, sid.replace(/"/g, ''));
      } catch {}
    });

    // A reloaded page asks for the turn again; it starts by dropping the half answer it saved
    eventSource.addEventListener('replay-start', (event) => {
      try {
        const { busy, count } = JSON.parse((event as MessageEvent).data);
        const key = storageKeyRef.current;
        if (!count && !busy) {
          // The answer is gone (server restarted), nothing is coming
          setIsThinking(false);
          flagThinking(false);
          pendingKeyRef.current = null;
          return;
        }
        pendingKeyRef.current = key;
        streamedRef.current = false;
        setMessages(prev => {
          let end = prev.length;
          while (end > 0 && prev[end - 1].role === 'assistant') end--;
          return prev.slice(0, end);
        });
        setIsThinking(true);
      } catch {}
    });

    eventSource.addEventListener('claude-response', (event) => {
      lastEventAt.current = Date.now();
      try { handleClaudeEventRef.current(JSON.parse(event.data)); } catch (err) {
        console.error('[useClaudeStream] Parse error:', event.data, err);
      }
    });

    eventSource.onopen = () => setIsConnected(true);
    eventSource.onerror = () => {
      setIsConnected(false);
      eventSource.close();
      esRef.current = null;
      reconnectTimer.current = setTimeout(() => connect(), RECONNECT_MS);
    };
  }, [sessionId]);

  useEffect(() => {
    connect();
    // A stream can die without an error (a proxy or the network drops it silently). With no ping for a while, reopen it.
    const watchdog = setInterval(() => {
      if (esRef.current && Date.now() - lastEventAt.current > STREAM_SILENCE_MS) {
        setIsConnected(false);
        connect();
      }
    }, 5000);
    return () => {
      clearInterval(watchdog);
      esRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  // The chat of this screen can change right after load (the thread list arrives from the other screen), and the
  // messages are then swapped for the saved ones. If an answer is still coming, ask for it again for the final chat.
  useEffect(() => {
    if (!thinkingKey) return;
    try {
      const startedAt = Number(localStorage.getItem(thinkingKey)) || 0;
      if (startedAt > 0 && Date.now() - startedAt < WAITING_FLAG_MS) connect();
    } catch {}
  }, [thinkingKey, connect]);

  const say = useCallback((text: string, replace = false) => setMessages(prev => {
    const msg: ClaudeMessage = { role: 'assistant', content: text, timestamp: Date.now() };
    return replace ? [...prev.slice(0, -1), msg] : [...prev, msg];
  }), []);

  /**
   * Summarizes the conversation so the window has room again. What the window held is added to the chat's running total,
   * so the counter keeps climbing across windows. Resolves true when the conversation was summarized.
   */
  const compactConversation = useCallback(async (auto: boolean): Promise<boolean> => {
    const key = storageKeyRef.current;
    const chat = key.replace(/^trio_cc_chat_/, '');
    const sid = localStorage.getItem(`trio_cc_claude_sid_${key}`) || undefined;
    say(auto ? 'The conversation is getting long. Summarizing it to keep going...' : 'Compacting the conversation...');
    try {
      const res = await fetch('/api/chat/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, command: 'compact', claudeSessionId: sid }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) { say(auto ? 'Could not summarize, continuing.' : 'Nothing to compact yet.', true); return false; }
      const archived = archivedRef.current + (contextRef.current ?? 0);
      setArchivedTokens(archived);
      try {
        localStorage.setItem(`trio_cc_ctxarch_${chat}`, String(archived));
        localStorage.removeItem(`trio_cc_ctx_${chat}`);
      } catch {}
      setContextTokens(null);
      say(auto ? 'Earlier messages were summarized to keep going.' : 'Conversation compacted.', true);
      return true;
    } catch {
      say('That command failed.', true);
      return false;
    }
  }, [sessionId, say]);

  const sendMessage = useCallback(
    async (content: string, openFile?: string | null, plan?: boolean, terminals?: { tabs: Array<{ id: string; label: string }>; active?: string }) => {
      const targetKey = storageKeyRef.current;
      // Lock this response to the current thread
      pendingKeyRef.current = targetKey;
      thinkingFlagKeyRef.current = `trio_cc_thinking_${targetKey.replace(/^trio_cc_chat_/, '')}`;
      // A window that is getting full is summarized first, so a conversation never runs out of room
      if (needsCompaction(contextRef.current, getModelOption(selectedModel).contextWindow) && localStorage.getItem(`trio_cc_claude_sid_${targetKey}`)) {
        setIsThinking(true);
        flagThinking(true);
        await compactConversation(true);
      }
      setMessages(prev => [...prev, { role: 'user', content, timestamp: Date.now(), ...(collab.role ? { from: collab.role } : {}) }]);
      setIsThinking(true);
      flagThinking(true);

      const storedSid = typeof window !== 'undefined'
        ? (localStorage.getItem(`trio_cc_claude_sid_${targetKey}`) || undefined)
        : undefined;

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: content, sessionId, claudeSessionId: storedSid, model: selectedModel, openFile: openFile ?? undefined, plan: plan || undefined, terminals }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          setMessages(prev => appendAssistant(prev, `${body.error || 'Failed to send message'}`));
          setIsThinking(false);
          pendingKeyRef.current = null;
        }
      } catch {
        setMessages(prev => appendAssistant(prev, `Network error: cannot reach backend`));
        setIsThinking(false);
        pendingKeyRef.current = null;
      }
    },
    [sessionId, selectedModel, compactConversation]
  );

  const runCommand = useCallback(async (command: 'undo' | 'compact') => {
    if (command === 'compact') { await compactConversation(false); return; }
    const key = storageKeyRef.current;
    const sid = localStorage.getItem(`trio_cc_claude_sid_${key}`) || undefined;
    say('Undoing the last AI changes...');
    try {
      const res = await fetch('/api/chat/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, command, claudeSessionId: sid }),
      });
      const data = await res.json().catch(() => ({}));
      say(data.ok ? `Restored ${data.files.length} file(s): ${data.files.join(', ')}` : 'Nothing to undo.', true);
      if (data.ok) onClaudeDone?.();
    } catch {
      say('That command failed.', true);
    }
  }, [sessionId, onClaudeDone, compactConversation, say]);

  const stopCurrent = useCallback(async () => {
    setIsThinking(false);
    flagThinking(false);
    pendingKeyRef.current = null;
    try {
      await fetch('/api/chat/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
    } catch {}
  }, [sessionId]);

  return { messages, sendMessage, isConnected, isThinking, editingFile, clearHistory, stopCurrent, selectedModel, setSelectedModel, contextTokens, totalTokens: archivedTokens + (contextTokens ?? 0), runCommand };
}
