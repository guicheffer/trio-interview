'use client';

import { splitQuestions, type AiQuestion } from '../lib/questions';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ClaudeMessage, ClaudeModel } from '../hooks/useClaudeStream';
import { useRemoteKey } from '../hooks/useRemoteKey';
import { parseQuestionState, questionStateKey, planModeKey, chatScrollKey, questionsAreReadOnly, scrollFromRatio, scrollRatio, type QuestionState } from '../lib/questionSync';
import { MODELS, DEFAULT_MODEL, PLAN_MODEL, CONVERSATION_TOKEN_BUDGET, getModelOption } from '../../shared/models';
import { ChatThread } from '../hooks/useMultiChat';
import { ChatTabs } from './ChatTabs';
import { collab } from '../lib/collab';
import { linkFiles, parseFileLink } from '../lib/fileLinks';
import { currentSubagents } from '../lib/subagents';
import { AiChangesSummary } from './AiChangesSummary';
import type { AiChange } from '../hooks/useAiChanges';
import { sentHistory, stepHistory, typedText } from '../lib/chatHistory';
import { useAction } from '../lib/actions';

interface ChatInterfaceProps {
  /** Key of this chat; plan mode, the open questions and the scroll position are shared with the other screen under it */
  chatKey?: string;
  /** Files in the project: names the assistant mentions become links that open them */
  files?: string[];
  /** What the agent changed, for the summary pinned above the box */
  aiChanges?: AiChange[];
  onOpenFile?: (file: string) => void;
  messages: ClaudeMessage[];
  /** openFile is the file open in the editor; it goes to the assistant out of sight, not into the message */
  onSendMessage: (message: string, openFile?: string | null, plan?: boolean) => void;
  isThinking: boolean;
  onClearChat?: () => void;
  onStop?: () => void;
  selectedModel?: ClaudeModel;
  onModelChange?: (model: ClaudeModel) => void;
  currentFile?: string | null;
  contextTokens?: number | null;
  /** Everything this chat has used, across the context windows it went through */
  totalTokens?: number;
  onCommand?: (command: 'undo' | 'compact') => void;
  // Multi-chat
  threads?: ChatThread[];
  closedThreads?: ChatThread[];
  unreadThreadIds?: Set<string>;
  activeThreadId?: string;
  onSelectThread?: (id: string) => void;
  onCreateThread?: (model: ClaudeModel) => void;
  onDeleteThread?: (id: string) => void;
  onRenameThread?: (id: string, title: string) => void;
  onThreadModelChange?: (id: string, model: ClaudeModel) => void;
  onRestoreThread?: (id: string) => void;
  onReorderThreads?: (fromId: string, toId: string) => void;
}


const SLASH_COMMANDS = [
  { name: 'compact', hint: 'Summarize the conversation to free up context', arg: false },
  { name: 'undo', hint: 'Revert the files the AI changed in its last answer', arg: false },
  { name: 'clear', hint: 'Clear this chat', arg: false },
  { name: 'new', hint: 'Open a new chat', arg: false },
  { name: 'plan', hint: 'Plan first, with the planning model (Opus)', arg: false },
  { name: 'instant', hint: 'Act immediately', arg: false },
  { name: 'model', hint: 'Switch model, for example /model opus', arg: true },
  { name: 'stop', hint: 'Stop the current answer', arg: false },
  { name: 'help', hint: 'Show the commands', arg: false },
] as const;

const AGENT_COLORS = [
  'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/40 dark:text-purple-200 dark:border-purple-700',
  'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-700',
  'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/40 dark:text-orange-200 dark:border-orange-700',
  'bg-pink-100 text-pink-800 border-pink-300 dark:bg-pink-900/40 dark:text-pink-200 dark:border-pink-700',
  'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-900/40 dark:text-teal-200 dark:border-teal-700',
  'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-900/40 dark:text-indigo-200 dark:border-indigo-700',
];

function agentColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AGENT_COLORS[h % AGENT_COLORS.length];
}

function SubagentChip({ raw }: { raw: string }) {
  let info: { type?: string; description?: string } = {};
  try { info = JSON.parse(raw); } catch {}
  const name = info.type || 'subagent';
  return (
    <span className={`my-1 inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${agentColor(name)}`} data-testid="subagent-chip">
      <svg className="h-3 w-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
      <span className="font-semibold">{name}</span>
      {info.description && <span className="truncate opacity-80">{info.description}</span>}
    </span>
  );
}

/** The subagents of the latest answer, pinned above the box: spinning while the agent works, ticked when it is done */
function SubagentBar({ messages, working }: { messages: ClaudeMessage[]; working: boolean }) {
  const agents = currentSubagents(messages);
  if (agents.length === 0) return null;
  return (
    <div className="mx-3 mb-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-100" data-testid="subagent-bar">
      <div className="mb-1 flex items-center gap-2 font-semibold">
        {working
          ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" aria-hidden="true" />
          : <span aria-hidden="true">✓</span>}
        {agents.length} {agents.length === 1 ? 'subagent' : 'subagents'} {working ? 'running' : 'finished'}
      </div>
      <ul className="space-y-0.5">
        {agents.map((a, i) => (
          <li key={i} className="flex min-w-0 items-center gap-2">
            <span className="font-mono font-semibold">{a.type}</span>
            <span className="truncate opacity-80">{a.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TokenCount({ tokens, budget, onClick }: { tokens: number; budget: number; onClick: () => void }) {
  const color = usageColor(tokens / budget);
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${formatTokens(tokens)} of ${formatTokens(budget)} tokens used in this conversation`}
      className={`flex-shrink-0 rounded px-1 text-[10px] font-mono tabular-nums hover:bg-gray-100 dark:hover:bg-gray-700 ${color}`}
      data-testid="token-count"
    >
      {formatTokens(tokens)} / {formatTokens(budget)}
    </button>
  );
}

function usageColor(pct: number): string {
  if (pct < 0.6) return 'text-gray-500 dark:text-gray-400';
  if (pct < 0.85) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n < 1000) return String(n);
  const digits = n >= 100000 ? 0 : 1;
  return `${(n / 1000).toFixed(digits)}k`;
}

/**
 * The assistant's questions, pinned above the input, one at a time. Skip leaves one unanswered; the answers go back as one message.
 * Keyboard: Tab and the arrow keys move between options, Enter in the text field moves on, Escape closes the panel.
 * Focus moves to the first option when a question appears and back to the chat input when the panel is done.
 */
function QuestionPanel({ questions, stateKey, pinnedKey, readOnly, onSubmit, onDismiss, onDone }: { questions: AiQuestion[]; stateKey: string | null; pinnedKey: string; readOnly: boolean; onSubmit: (answer: string) => void; onDismiss: () => void; onDone: () => void }) {
  // The choices and the typing live in a shared key, so the other screen watches them as they happen
  const [state, setLocal] = useState<QuestionState>(() => parseQuestionState(stateKey ? localStorage.getItem(stateKey) : null, pinnedKey));
  const stateRef = useRef(state);
  stateRef.current = state;
  const commit = (patch: Partial<QuestionState>) => {
    const next = { ...stateRef.current, ...patch };
    stateRef.current = next;
    setLocal(next);
    if (stateKey) { try { localStorage.setItem(stateKey, JSON.stringify(next)); } catch {} }
  };
  useRemoteKey(stateKey ?? undefined, (value) => setLocal(parseQuestionState(value, pinnedKey)));
  const { step, picked, other } = state;
  const panelRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const q = questions[Math.min(step, questions.length - 1)];
  const multi = !!q.multiSelect;
  const last = step >= questions.length - 1;
  const headingId = `q-heading-${step}`;

  // Each question starts with the keyboard on its first option, unless the person is typing a message
  useEffect(() => {
    if (readOnly) return;
    const active = document.activeElement;
    const typing = active instanceof HTMLTextAreaElement && active.value.length > 0;
    if (!typing) panelRef.current?.querySelector<HTMLInputElement>('input[name^="q-"]')?.focus();
  }, [step, readOnly]);

  // The answer box grows with what is typed, here and on the other screen
  useEffect(() => {
    const box = textRef.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = Math.min(box.scrollHeight, 140) + 'px';
  }, [other[step], step]);

  const answerFor = (qi: number) => [...(picked[qi] ?? []), ...(other[qi]?.trim() ? [other[qi].trim()] : [])];
  const answered = answerFor(step).length > 0;
  const toggle = (opt: string) => {
    const cur = picked[step] ?? [];
    const next = multi ? (cur.includes(opt) ? cur.filter(o => o !== opt) : [...cur, opt]) : [opt];
    commit({ picked: { ...picked, [step]: next } });
  };

  const finish = () => {
    const lines = questions.flatMap((item, qi) => (answerFor(qi).length > 0 ? [`${item.question} ${answerFor(qi).join(', ')}`] : []));
    if (lines.length === 0) { commit({ dismissed: true }); onDismiss(); } else onSubmit(lines.join('\n'));
    onDone();
  };
  const advance = () => (last ? finish() : commit({ step: step + 1 }));
  const skip = () => {
    commit({ picked: { ...picked, [step]: [] }, other: { ...other, [step]: '' } });
    advance();
  };
  const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-800';

  if (state.dismissed) return null;
  return (
    <section
      ref={panelRef}
      data-testid="question-panel"
      aria-labelledby="q-title"
      onKeyDown={e => { if (e.key === 'Escape' && !readOnly) { e.stopPropagation(); commit({ dismissed: true }); onDismiss(); onDone(); } }}
      className="mx-3 mb-2 max-h-[55%] overflow-y-auto rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
        <svg aria-hidden="true" className="h-4 w-4 flex-shrink-0 text-green-700 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h4 id="q-title" className="text-sm font-semibold">Questions</h4>
        <span className="ml-auto text-xs font-normal text-gray-600 dark:text-gray-300" aria-label={`Question ${step + 1} of ${questions.length}`}>{step + 1}/{questions.length}</span>
      </div>
      {readOnly && (
        <p className="mb-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100" data-testid="question-watching">
          Only the {collab.role === 'interviewer' ? 'candidate' : 'interviewer'} can answer these questions. You can watch the choices as they are made.
        </p>
      )}
      <fieldset aria-describedby={multi ? `${headingId}-hint` : undefined} className="min-w-0 border-0 p-0">
        <legend id={headingId} className="mb-2 text-sm text-gray-900 dark:text-gray-100">{q.question}</legend>
        {multi && <p id={`${headingId}-hint`} className="sr-only">Select all that apply.</p>}
        <div className="space-y-1">
          {q.options.map(opt => {
            const on = (picked[step] ?? []).includes(opt);
            return (
              <label key={opt} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-green-500 ${on ? 'border-green-600 bg-green-50 dark:bg-green-900/20' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50 dark:border-gray-600 dark:hover:border-gray-500 dark:hover:bg-gray-700/50'}`}>
                <input type={multi ? 'checkbox' : 'radio'} name={`q-${step}`} checked={on} disabled={readOnly} onChange={() => toggle(opt)} className="mt-0.5 h-4 w-4 flex-shrink-0 accent-green-600 focus:outline-none" />
                <span className="text-gray-900 dark:text-gray-100">{opt}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <textarea
        ref={textRef}
        rows={1}
        aria-label="Or type your own answer"
        autoComplete="off"
        value={other[step] ?? ''}
        readOnly={readOnly}
        onChange={e => commit({ other: { ...other, [step]: e.target.value } })}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && answered && !readOnly) { e.preventDefault(); advance(); } }}
        placeholder={readOnly ? '' : 'Or type your own answer (Shift+Enter for a new line)'}
        className="mt-2 w-full resize-none overflow-hidden rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm leading-5 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 read-only:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-400 dark:read-only:bg-gray-800"
      />
      {!readOnly && <div className="mt-2 flex items-center justify-end gap-2">
        <button type="button" onClick={skip} aria-label={last ? 'Skip this question and finish' : 'Skip this question'} className={`rounded-lg px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700 ${ring}`}>Skip</button>
        <button
          type="button"
          disabled={!answered}
          onClick={advance}
          aria-label={last ? 'Submit answers' : 'Next question'}
          title={answered ? undefined : 'Pick or type an answer first'}
          className={`rounded-lg bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50 ${ring}`}
        >
          {last ? 'Submit' : 'Next'}
        </button>
      </div>}
    </section>
  );
}

export function ChatInterface({
  chatKey,
  files = [],
  aiChanges = [],
  onOpenFile,
  messages,
  onSendMessage,
  isThinking,
  onClearChat,
  onStop,
  selectedModel = DEFAULT_MODEL,
  onModelChange,
  currentFile,
  contextTokens,
  totalTokens = 0,
  onCommand,
  threads,
  closedThreads,
  unreadThreadIds,
  activeThreadId,
  onSelectThread,
  onCreateThread,
  onDeleteThread,
  onRenameThread,
  onThreadModelChange,
  onRestoreThread,
  onReorderThreads,
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  // What was typed and not sent is kept in this browser, so a closed tab or a reload gives it back
  const draftKey = chatKey ? `trio_draft_chat_${chatKey}` : null;
  const draftLoadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!draftKey) return;
    try { setInput(localStorage.getItem(draftKey) ?? ''); } catch {}
    draftLoadedFor.current = draftKey;
    skipNextDraftWrite.current = true;
  }, [draftKey]);
  const skipNextDraftWrite = useRef(false);
  useEffect(() => {
    // The pass right after loading still sees the old text; writing it would erase the draft just read
    if (skipNextDraftWrite.current) { skipNextDraftWrite.current = false; return; }
    if (!draftKey || draftLoadedFor.current !== draftKey) return;
    try { if (input) localStorage.setItem(draftKey, input); else localStorage.removeItem(draftKey); } catch {}
  }, [input, draftKey]);
  // Arrow up in the box brings back what was sent before, like a terminal (0 = the box as it was left)
  const historyPosition = useRef(0);
  const draftBeforeHistory = useRef('');
  // Plan mode is shared: switching it on one screen switches it on the other
  const planKey = chatKey ? planModeKey(chatKey) : null;
  const [planMode, setPlanModeState] = useState(false);
  const setPlanMode = (on: boolean) => {
    setPlanModeState(on);
    if (planKey) { try { localStorage.setItem(planKey, on ? '1' : '0'); } catch {} }
  };
  useEffect(() => {
    if (!planKey) { setPlanModeState(false); return; }
    try { setPlanModeState(localStorage.getItem(planKey) === '1'); } catch {}
  }, [planKey]);
  useRemoteKey(planKey ?? undefined, (value) => setPlanModeState(value === '1'));
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const lastMessage = messages[messages.length - 1];
  const pinnedQuestions = lastMessage?.role === 'assistant' ? splitQuestions(lastMessage.content).questions : [];
  const pinnedKey = `${messages.length}:${JSON.stringify(pinnedQuestions)}`;
  const [dismissedQuestions, setDismissedQuestions] = useState<string | null>(null);
  const [ctxOpen, setCtxOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [remoteDraft, setRemoteDraft] = useState<{ label: string; role: string; text: string; thread: string; at: number } | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const threadKey = activeThreadId ?? '';

  const shareDraft = useCallback((text: string) => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      collab.send({ type: 'peer', kind: 'draft', thread: threadKey, text: text.slice(0, 4000) });
    }, text ? 120 : 0);
  }, [threadKey]);

  useEffect(() => {
    const off = collab.on('peer', (msg) => {
      if (msg.kind === 'leave') { setRemoteDraft(null); return; }
      if (msg.kind !== 'draft') return;
      setRemoteDraft(msg.text ? { label: msg.label, role: msg.role, text: msg.text, thread: msg.thread, at: Date.now() } : null);
    });
    const sweep = setInterval(() => {
      setRemoteDraft(d => (d && Date.now() - d.at > 12000 ? null : d));
    }, 2000);
    return () => { off(); clearInterval(sweep); };
  }, []);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const applyingScroll = useRef(false);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Where this chat is scrolled to goes to the other screen; it only follows when Follow is on (see follow.ts)
  const scrollKey = chatKey ? chatScrollKey(chatKey) : null;
  const shareScroll = () => {
    const area = scrollAreaRef.current;
    if (!area || !scrollKey || applyingScroll.current) return;
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => { try { localStorage.setItem(scrollKey, String(scrollRatio(area))); } catch {} }, 120);
  };
  useRemoteKey(scrollKey ?? undefined, (value) => {
    const area = scrollAreaRef.current;
    const ratio = Number(value);
    if (!area || value === null || Number.isNaN(ratio)) return;
    applyingScroll.current = true;
    area.scrollTop = scrollFromRatio(area, ratio);
    setTimeout(() => { applyingScroll.current = false; }, 200);
  });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const modeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!modeMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (!modeMenuRef.current?.contains(e.target as Node)) setModeMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [modeMenuOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus input after Claude responds (if sidebar still has focus)
  useEffect(() => {
    if (isThinking || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    // Only auto-focus if last message is from assistant and focus is still within the chat; questions take the focus themselves
    if (lastMsg.role !== 'assistant' || splitQuestions(lastMsg.content).questions.length > 0) return;
    if (!document.activeElement?.closest('.flex.flex-col.h-full')) return;
    // Cancelled when the next update arrives, so the final text with questions is not stolen from
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [isThinking, messages]);

  const slashQuery = input.startsWith('/') && !input.includes(' ') ? input.slice(1).toLowerCase() : null;
  const slashMatches = slashQuery === null ? [] : SLASH_COMMANDS.filter(c => c.name.startsWith(slashQuery));

  const runSlash = (text: string): boolean => {
    if (!text.startsWith('/')) return false;
    const [name, ...rest] = text.slice(1).trim().split(/\s+/);
    const arg = rest.join(' ').toLowerCase();
    const known = SLASH_COMMANDS.find(c => c.name === name.toLowerCase());
    if (!known) return false;
    setInput('');
    shareDraft('');
    switch (known.name) {
      case 'compact': onCommand?.('compact'); break;
      case 'undo': onCommand?.('undo'); break;
      case 'clear': setConfirmClear(true); break;
      case 'new': onCreateThread?.(selectedModel); break;
      case 'plan': setPlanMode(true); if (selectedModel === DEFAULT_MODEL) onModelChange?.(PLAN_MODEL); break;
      case 'instant': setPlanMode(false); if (selectedModel === PLAN_MODEL) onModelChange?.(DEFAULT_MODEL); break;
      case 'stop': onStop?.(); break;
      case 'help': setInput('/'); break;
      case 'model': {
        const found = MODELS.find(m => m.key === arg || m.label.toLowerCase().startsWith(arg));
        if (found && arg) onModelChange?.(found.key as ClaudeModel);
        else setInput('/model ');
        break;
      }
    }
    return true;
  };

  const goPlan = () => { setPlanMode(true); if (selectedModel === DEFAULT_MODEL) onModelChange?.(PLAN_MODEL); };
  const goInstant = () => { setPlanMode(false); if (selectedModel === PLAN_MODEL) onModelChange?.(DEFAULT_MODEL); };
  useAction('chat:focus', () => inputRef.current?.focus());
  useAction('chat:prefill', (text: string) => { setInput(text ?? ''); shareDraft(text ?? ''); setTimeout(() => inputRef.current?.focus(), 0); });
  useAction('chat:plan', goPlan);
  useAction('chat:instant', goInstant);
  useAction('chat:clear', () => setConfirmClear(true));
  useAction('chat:compact', () => onCommand?.('compact'));
  useAction('chat:undo', () => onCommand?.('undo'));
  useAction('chat:stop', () => onStop?.());
  useAction('chat:new', () => onCreateThread?.(selectedModel));
  useAction('chat:close', () => { if (activeThreadId) onDeleteThread?.(activeThreadId); });
  useAction('chat:model', (key: string) => { if (!isThinking) onModelChange?.(key as ClaudeModel); });
  useAction('chat:send', (text: string) => { if (text && !isThinking) onSendMessage(text); });

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (input.trim().startsWith('/') && runSlash(input.trim())) return;
    if (input.trim() && !isThinking) {
      onSendMessage(input.trim(), currentFile, planMode);
      historyPosition.current = 0;
      setInput('');
      shareDraft('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashMatches.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIndex(i => (i + 1) % slashMatches.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIndex(i => (i - 1 + slashMatches.length) % slashMatches.length); return; }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && slashQuery !== slashMatches[Math.min(slashIndex, slashMatches.length - 1)].name)) {
        e.preventDefault();
        const pick = slashMatches[Math.min(slashIndex, slashMatches.length - 1)];
        setInput(`/${pick.name}${pick.arg ? ' ' : ''}`);
        return;
      }
      if (e.key === 'Escape') { setInput(''); return; }
    }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
      const box = e.currentTarget;
      const browsing = historyPosition.current > 0;
      const onEdge = e.key === 'ArrowUp' ? !box.value.slice(0, box.selectionStart).includes('\n') : !box.value.slice(box.selectionEnd).includes('\n');
      if ((input === '' || browsing) && onEdge) {
        const sent = sentHistory(messages);
        const next = stepHistory(historyPosition.current, sent.length, e.key);
        if (next !== null) {
          e.preventDefault();
          if (!browsing) draftBeforeHistory.current = input;
          historyPosition.current = next;
          const text = next === 0 ? draftBeforeHistory.current : sent[sent.length - next];
          setInput(text);
          shareDraft(text);
          requestAnimationFrame(() => { box.selectionStart = box.selectionEnd = text.length; });
          return;
        }
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    // Shift+Enter inserts newline naturally (default textarea behavior)
  };

  return (
    <div
      ref={containerRef}
      data-chat-root
      className="relative flex flex-col h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700"
      onMouseDown={(e) => {
        // Focus input only when clicking on the messages area, not on controls, tabs, or the form
        const target = e.target as HTMLElement;
        const inMessages = target.closest('[data-messages-area]');
        if (inMessages && !target.closest('button, input, textarea, select, a, [contenteditable]')) {
          setTimeout(() => inputRef.current?.focus(), 0);
        }
      }}
    >
      {/* Thread tabs */}
      {threads && threads.length > 0 && activeThreadId && onSelectThread && onCreateThread && onDeleteThread && onRenameThread && onThreadModelChange && (
        <ChatTabs
          threads={threads}
          closedThreads={closedThreads}
          unreadThreadIds={unreadThreadIds}
          activeThreadId={activeThreadId}
          onSelect={onSelectThread}
          onCreate={onCreateThread}
          onDelete={onDeleteThread}
          onRename={onRenameThread}
          onModelChange={onThreadModelChange}
          onRestore={onRestoreThread}
          onReorder={onReorderThreads}
        />
      )}

      {/* Confirm clear dialog */}
      {confirmClear && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onKeyDown={e => {
            if (e.key === 'Enter') { onClearChat?.(); setConfirmClear(false); }
            if (e.key === 'Escape') setConfirmClear(false);
          }}
          tabIndex={-1}
          ref={el => el?.focus()}
        >
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-5 mx-4 max-w-xs w-full">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">Clear chat history?</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">This will delete all messages in this thread. This cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmClear(false)}
                className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors font-medium"
              >
                Cancel <span className="opacity-50 ml-1">Esc</span>
              </button>
              <button
                onClick={() => { onClearChat?.(); setConfirmClear(false); }}
                className="px-3 py-1.5 text-xs text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors font-medium"
              >
                Clear <span className="opacity-70 ml-1">↵</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              AI Assistant
            </h3>
            <p className="text-xs text-purple-600 dark:text-purple-400 font-mono mt-0.5">
              {getModelOption(selectedModel).id}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {isThinking && onStop && (
              <button
                onClick={onStop}
                className="flex items-center gap-1.5 text-xs text-white bg-red-500 hover:bg-red-600 px-2.5 py-1.5 rounded-lg font-medium transition-colors shadow-sm"
                title="Stop current request"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
                Stop
              </button>
            )}
            {messages.length === 0 && !isThinking ? (
              <button
                onClick={() => onSendMessage(
                  'Please read the @AGENTS.md file in this directory and give me a friendly welcome message summarizing the key interface tips. Be concise and encouraging. Use bullet points.'
                )}
                className="text-xs bg-green-500 hover:bg-green-600 text-white px-2.5 py-1.5 rounded-lg font-medium transition-colors shadow-sm"
                title="Start session, the agent will introduce the interface"
              >
                ▶ Start
              </button>
            ) : (
              onClearChat && !isThinking && (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2.5 py-1.5 rounded-lg font-medium transition-colors"
                  title="Clear chat history"
                >
                  Clear
                </button>
              )
            )}
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Ask questions or request help
        </p>
      </div>

      {/* Messages */}
      <div ref={scrollAreaRef} onScroll={shareScroll} className="flex-1 overflow-y-auto p-4 space-y-4" data-messages-area>
        {messages.length === 0 && (
          <div className="text-center text-gray-500 dark:text-gray-400 mt-8">
            <svg className="mx-auto h-10 w-10 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <p className="text-sm">Click ▶ Start to get a guided introduction</p>
          </div>
        )}
        {messages.map((msg, idx) => {
          const split = msg.role === 'assistant' ? splitQuestions(msg.content) : { text: msg.content, questions: [] as AiQuestion[] };
          return (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg px-4 py-2.5 ${
              msg.role === 'user'
                ? 'bg-green-500 text-white dark:bg-green-600'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
            }`}>
              {msg.role === 'user' ? (
                <>
                  {msg.from && <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/80">{msg.from === 'interviewer' ? 'Interviewer' : 'Candidate'}</div>}
                  <div className="text-sm whitespace-pre-wrap break-words">{typedText(msg.content)}</div>
                </>
              ) : (
                <div className="text-sm prose prose-sm dark:prose-invert max-w-none
                  prose-p:my-1 prose-headings:my-1 prose-ul:my-1 prose-ol:my-1
                  prose-li:my-0.5 prose-code:text-xs prose-code:before:content-none prose-code:after:content-none prose-pre:my-2
                  prose-code:bg-gray-200 prose-code:dark:bg-gray-700
                  prose-code:px-1 prose-code:rounded prose-code:font-mono
                  prose-pre:bg-gray-200 prose-pre:dark:bg-gray-700 prose-pre:p-3 prose-pre:rounded-lg prose-pre:overflow-x-auto
                ">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    urlTransform={(url) => (url.startsWith('trio-file:') ? url : defaultUrlTransform(url))}
                    components={{
                      a({ href, children, ...props }) {
                        const target = parseFileLink(href);
                        if (!target) return <a href={href} target="_blank" rel="noreferrer" {...props}>{children}</a>;
                        return (
                          <button type="button" data-testid="file-link" title={`Open ${target.file}`} onClick={() => onOpenFile?.(target.file)}
                            className="cursor-pointer font-medium text-green-700 underline decoration-dotted underline-offset-2 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300">
                            {children}
                          </button>
                        );
                      },
                      pre({ children }) {
                        const child = React.Children.toArray(children)[0] as React.ReactElement<{ className?: string }> | undefined;
                        if (child?.props?.className === 'language-trio-subagent') return <>{children}</>;
                        return <pre>{children}</pre>;
                      },
                      code({ className, children, ...props }) {
                        if (className === 'language-trio-subagent') return <SubagentChip raw={String(children)} />;
                        const isBlock = className?.startsWith('language-');
                        if (isBlock) {
                          return (
                            <code className={`block text-xs font-mono ${className ?? ''}`} {...props}>
                              {children}
                            </code>
                          );
                        }
                        return (
                          <code className="bg-gray-200 dark:bg-gray-700 px-1 py-0.5 rounded text-xs font-mono" {...props}>
                            {children}
                          </code>
                        );
                      },
                    }}
                  >
                    {linkFiles(split.text, files)}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
          );
        })}
        {remoteDraft && remoteDraft.thread === threadKey && (
          <div className="flex justify-end">
            <div className={`max-w-[85%] rounded-lg border border-dashed px-4 py-2.5 ${remoteDraft.role === 'interviewer' ? 'border-purple-400 bg-purple-50 dark:bg-purple-900/20' : 'border-green-500 bg-green-50 dark:bg-green-900/20'}`}>
              <div className={`mb-0.5 text-[10px] font-semibold ${remoteDraft.role === 'interviewer' ? 'text-purple-600 dark:text-purple-300' : 'text-green-700 dark:text-green-300'}`}>
                {remoteDraft.label} is typing
              </div>
              <div className="text-sm whitespace-pre-wrap break-words text-gray-800 dark:text-gray-100">{remoteDraft.text}</div>
            </div>
          </div>
        )}
        {isThinking && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-4 py-2">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-gray-600 dark:bg-gray-400 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-gray-600 dark:bg-gray-400 rounded-full animate-bounce delay-100" />
                <div className="w-2 h-2 bg-gray-600 dark:bg-gray-400 rounded-full animate-bounce delay-200" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {pinnedQuestions.length > 0 && dismissedQuestions !== pinnedKey && !isThinking
          ? `The assistant has ${pinnedQuestions.length} ${pinnedQuestions.length === 1 ? 'question' : 'questions'} for you, above the message box.`
          : ''}
      </div>
      {pinnedQuestions.length > 0 && dismissedQuestions !== pinnedKey && !isThinking && (
        <QuestionPanel key={pinnedKey} questions={pinnedQuestions} stateKey={chatKey ? questionStateKey(chatKey) : null} pinnedKey={pinnedKey} readOnly={questionsAreReadOnly(collab.role, messages)} onSubmit={(a) => onSendMessage(a)} onDismiss={() => setDismissedQuestions(pinnedKey)} onDone={() => inputRef.current?.focus()} />
      )}

      <SubagentBar messages={messages} working={isThinking} />
      {messages.some(m => m.role === 'assistant') && <AiChangesSummary changes={aiChanges} busy={isThinking} onOpenFile={onOpenFile} />}

      {/* Input form */}
      <form onSubmit={handleSubmit} className="border-t border-gray-200 dark:border-gray-700 p-3 md:p-4">
        <div className="relative flex flex-col gap-2">
          {slashMatches.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 z-40 mb-1 max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-800" data-testid="slash-menu">
              {slashMatches.map((c, i) => (
                <button
                  key={c.name}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); setInput(`/${c.name}${c.arg ? ' ' : ''}`); inputRef.current?.focus(); }}
                  className={`flex w-full items-baseline gap-3 px-3 py-1.5 text-left text-xs ${i === Math.min(slashIndex, slashMatches.length - 1) ? 'bg-green-50 dark:bg-green-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                >
                  <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">/{c.name}</span>
                  <span className="text-gray-500 dark:text-gray-400">{c.hint}</span>
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => {
              historyPosition.current = 0;
              setInput(e.target.value);
              shareDraft(e.target.value);
              // Auto-grow: reset height then set to scrollHeight
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={handleKeyDown}
            placeholder={planMode ? 'Describe what to build, the agent will plan first...' : 'Ask AI for help… (Shift+Enter for new line)'}
            className={`w-full px-3 md:px-4 py-2 border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 text-sm transition-colors resize-none overflow-hidden leading-5 ${
              planMode
                ? 'border-amber-400 dark:border-amber-500 focus:ring-amber-400'
                : 'border-gray-300 dark:border-gray-600 focus:ring-green-500'
            }`}
            style={{ minHeight: '36px', maxHeight: '120px' }}
          />
          <div className="flex gap-2 justify-between items-center">
            <div className="relative flex-shrink-0">
              <TokenCount tokens={totalTokens} budget={CONVERSATION_TOKEN_BUDGET} onClick={() => setCtxOpen(o => !o)} />
              {ctxOpen && (
                <div className="absolute bottom-full left-0 z-40 mb-1 w-64 rounded-xl border border-gray-200 bg-white p-3 text-xs shadow-xl dark:border-gray-700 dark:bg-gray-800">
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Conversation</div>
                  <div className="mt-1 text-gray-600 dark:text-gray-300" data-testid="token-total">
                    {formatTokens(totalTokens)} of {formatTokens(CONVERSATION_TOKEN_BUDGET)} tokens used in total
                  </div>
                  <div className="mt-1 text-gray-600 dark:text-gray-300" data-testid="token-window">
                    Now in the window: {formatTokens(contextTokens ?? 0)} of {formatTokens(getModelOption(selectedModel).contextWindow)} ({Math.round(((contextTokens ?? 0) / getModelOption(selectedModel).contextWindow) * 100)}%) on {getModelOption(selectedModel).label}
                  </div>
                  <div className="mt-1 text-gray-500 dark:text-gray-400">When the window gets full the conversation is summarized by itself and goes on, so there is no limit to hit.</div>
                  <div className="mt-2 text-gray-500 dark:text-gray-400">Type <span className="font-mono">/</span> for commands. <span className="font-mono">/compact</span> frees up context, <span className="font-mono">/undo</span> reverts the last file changes.</div>
                </div>
              )}
            </div>

            {/* Model selector */}
            <select
              value={selectedModel}
              onChange={(e) => onModelChange?.(e.target.value as ClaudeModel)}
              disabled={isThinking}
              className="flex-shrink-0 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-2 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed min-w-[120px]"
              title="Select model"
            >
              {(['Claude'] as const).map(group => (
                <optgroup key={group} label={group}>
                  {MODELS.filter(m => m.group === group).map(m => (
                    <option key={m.key} value={m.key}>{m.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>

            <div className="flex-1" />

            {/* Send + mode dropdown (fused) */}
            <div className="relative flex items-stretch flex-shrink-0" ref={modeMenuRef}>
              <button
                type="submit"
                disabled={!input.trim() || isThinking}
                className={`px-4 py-2 text-white text-sm font-medium transition-colors rounded-l-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                  planMode
                    ? 'bg-amber-500 hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-700'
                    : 'bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700'
                }`}
              >
                {planMode ? 'Plan' : 'Send'}
              </button>
              <button
                type="button"
                onClick={() => setModeMenuOpen(o => !o)}
                className={`px-1.5 py-2 text-white text-sm border-l border-white/30 rounded-r-lg transition-colors ${
                  planMode
                    ? 'bg-amber-500 hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-700'
                    : 'bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700'
                }`}
                title="Switch mode"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {modeMenuOpen && (
                <div className="absolute bottom-full right-0 mb-1 w-52 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50">
                  <button
                    type="button"
                    onClick={() => { setPlanMode(false); setModeMenuOpen(false); if (selectedModel === PLAN_MODEL) onModelChange?.(DEFAULT_MODEL); }}
                    className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${!planMode ? 'bg-green-50 dark:bg-green-900/20' : ''}`}
                  >
                    <span className="text-base mt-0.5"></span>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100 text-xs">Instant</div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">The agent acts immediately</div>
                    </div>
                    {!planMode && <svg className="w-3.5 h-3.5 text-green-500 ml-auto mt-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                  </button>
                  <div className="border-t border-gray-100 dark:border-gray-700" />
                  <button
                    type="button"
                    onClick={() => { setPlanMode(true); setModeMenuOpen(false); if (selectedModel === DEFAULT_MODEL) onModelChange?.(PLAN_MODEL); }}
                    className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${planMode ? 'bg-amber-50 dark:bg-amber-900/20' : ''}`}
                  >
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100 text-xs">Plan first</div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">The agent drafts a plan, waits for approval</div>
                    </div>
                    {planMode && <svg className="w-3.5 h-3.5 text-amber-500 ml-auto mt-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
