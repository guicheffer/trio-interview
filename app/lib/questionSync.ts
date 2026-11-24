import type { ClaudeMessage } from '../hooks/useClaudeStream';

/** What the question panel holds, shared by both screens so each sees the other's choices and typing */
export interface QuestionState {
  /** Which set of questions this belongs to (the panel's pinned key) */
  key: string;
  step: number;
  picked: Record<number, string[]>;
  other: Record<number, string>;
  dismissed: boolean;
}

export const questionStateKey = (chatKey: string) => `trio_cc_qa_${chatKey}`;
export const planModeKey = (chatKey: string) => `trio_cc_plan_${chatKey}`;
export const chatScrollKey = (chatKey: string) => `trio_cc_scroll_chat_${chatKey}`;

export function emptyQuestionState(key: string): QuestionState {
  return { key, step: 0, picked: {}, other: {}, dismissed: false };
}

export function parseQuestionState(raw: string | null | undefined, key: string): QuestionState {
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && parsed.key === key && typeof parsed.step === 'number') return { ...emptyQuestionState(key), ...parsed };
  } catch {}
  return emptyQuestionState(key);
}

/**
 * Whether this person must only watch the questions. The questions answer the last message, so only the person who
 * wrote it answers; the other side sees the choices and the typing live but cannot use the panel.
 */
export function questionsAreReadOnly(role: 'interviewer' | 'candidate' | null, messages: ClaudeMessage[]): boolean {
  if (!role) return false;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return !!messages[i].from && messages[i].from !== role;
  }
  return false;
}

/** Scroll position as a share of the way down, so two screens of different heights land on the same place */
export function scrollRatio(el: { scrollTop: number; scrollHeight: number; clientHeight: number }): number {
  const room = el.scrollHeight - el.clientHeight;
  return room <= 0 ? 0 : Math.round((el.scrollTop / room) * 1000) / 1000;
}

export function scrollFromRatio(el: { scrollHeight: number; clientHeight: number }, ratio: number): number {
  return Math.max(0, el.scrollHeight - el.clientHeight) * Math.min(1, Math.max(0, ratio));
}
