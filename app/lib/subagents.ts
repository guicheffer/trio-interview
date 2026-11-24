import type { ClaudeMessage } from '../hooks/useClaudeStream';

export interface SubagentInfo { type: string; description: string }

const CHIP = /```trio-subagent\n([\s\S]*?)\n```/g;

/** The subagents the assistant started in its latest answer (everything after the last message the person sent) */
export function currentSubagents(messages: ClaudeMessage[]): SubagentInfo[] {
  let start = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') { start = i + 1; break; }
  }
  const found: SubagentInfo[] = [];
  for (const message of messages.slice(start)) {
    if (message.role !== 'assistant') continue;
    for (const match of message.content.matchAll(CHIP)) {
      try {
        const info = JSON.parse(match[1]);
        found.push({ type: String(info.type || 'subagent'), description: String(info.description || '') });
      } catch {}
    }
  }
  return found;
}
