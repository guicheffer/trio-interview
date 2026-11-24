import type { ClaudeMessage } from '../hooks/useClaudeStream';

/** Older chats stored the plan instruction in the message itself; it is hidden when shown or recalled */
export const PLAN_PREFIX = 'Plan first, do not change any project files yet.';

export function typedText(content: string): string {
  const end = content.startsWith(PLAN_PREFIX) ? content.indexOf('\n\n') : -1;
  return end >= 0 ? content.slice(end + 2) : content;
}

/** The messages a person sent in this chat, oldest first, as they typed them. Repeats in a row are kept once. */
export function sentHistory(messages: ClaudeMessage[]): string[] {
  const sent: string[] = [];
  for (const message of messages) {
    if (message.role !== 'user') continue;
    const text = typedText(message.content).trim();
    if (text && sent[sent.length - 1] !== text) sent.push(text);
  }
  return sent;
}

/**
 * Arrow up and down in the empty box, like a terminal. `position` is how many steps back we are (0 = the box as
 * the person left it). Returns the new position, or null when the key does nothing.
 */
export function stepHistory(position: number, total: number, key: 'ArrowUp' | 'ArrowDown'): number | null {
  if (key === 'ArrowUp') return position < total ? position + 1 : null;
  return position > 0 ? position - 1 : null;
}
