const BUDGET_RE = /daily AI budget is used up/i;
const BUDGET_MESSAGE = 'The AI assistant is unavailable right now: the daily AI budget of the interviewer running this session is used up. Please let your interviewer know.';
const SESSION_GONE = 'No conversation found with session';

export function friendlyError(text: string): string {
  return BUDGET_RE.test(text) ? BUDGET_MESSAGE : text;
}

/** What one event from the Claude Code stream means for the chat */
export type ChatEffect =
  | { kind: 'thinking'; value: boolean }
  | { kind: 'append'; text: string }
  | { kind: 'replaceLast'; text: string }
  | { kind: 'context'; total: number }
  | { kind: 'stopped' }
  | { kind: 'done' }
  | { kind: 'sessionExpired' };

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: { subagent_type?: string; description?: string };
}

interface Interpretation {
  effects: ChatEffect[];
  /** Whether text has streamed in for the current answer, so the final message is not written twice */
  streamed: boolean;
}

const append = (text: string): ChatEffect => ({ kind: 'append', text });

function streamEvent(inner: Record<string, any> | undefined, streamed: boolean): Interpretation {
  const effects: ChatEffect[] = [];
  let nowStreamed = streamed;
  if (inner?.type === 'content_block_start' && inner.content_block?.type === 'text' && streamed) {
    effects.push(append('\n\n'));
  }
  if (inner?.type === 'content_block_delta' && inner.delta?.type === 'text_delta' && inner.delta.text) {
    nowStreamed = true;
    effects.push({ kind: 'thinking', value: false }, append(inner.delta.text));
  }
  return { effects, streamed: nowStreamed };
}

function contextTotal(usage: Record<string, number | undefined>): number {
  return (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.output_tokens ?? 0);
}

function subagentChips(content: ContentBlock[]): ChatEffect[] {
  return content
    .filter(block => block.type === 'tool_use' && (block.name === 'Task' || block.name === 'Agent'))
    .map(block => {
      const info = JSON.stringify({ type: block.input?.subagent_type || 'general-purpose', description: block.input?.description || '' });
      return append('\n\n```trio-subagent\n' + info + '\n```\n\n');
    });
}

function assistantMessage(message: Record<string, any>, streamed: boolean): Interpretation {
  const effects: ChatEffect[] = [];
  if (message.usage) {
    const total = contextTotal(message.usage);
    if (total > 0) effects.push({ kind: 'context', total });
  }
  const content: ContentBlock[] | null = Array.isArray(message.content) ? message.content : null;
  if (content) effects.push(...subagentChips(content));
  if (!message.content) return { effects, streamed };

  const blocks = (content ?? []) as ContentBlock[];
  if (streamed && blocks.some(block => block.type === 'text')) {
    effects.push({ kind: 'thinking', value: false });
    return { effects, streamed };
  }
  const text = friendlyError(blocks.filter(block => block.type === 'text').map(block => block.text ?? '').join(''));
  if (text) effects.push({ kind: 'thinking', value: false }, { kind: 'replaceLast', text });
  else if (blocks.some(block => block.type === 'thinking')) effects.push({ kind: 'thinking', value: true });
  return { effects, streamed };
}

function failure(data: Record<string, any>): ChatEffect[] {
  const message = friendlyError(String(data.message || data.text || data.error || JSON.stringify(data)));
  if (message.includes(SESSION_GONE)) return [{ kind: 'sessionExpired' }];
  return [append(`\nAgent error: ${message}`)];
}

function resultEvent(data: Record<string, any>, streamed: boolean): ChatEffect[] {
  const effects: ChatEffect[] = [{ kind: 'thinking', value: false }];
  if (data.text && !streamed) effects.push({ kind: 'replaceLast', text: data.text });
  effects.push({ kind: 'done' });
  return effects;
}

/**
 * Turns one parsed event of the Claude Code stream into effects on the chat. It knows nothing about React or
 * storage, so the hook only applies what it returns.
 */
export function interpretClaudeEvent(data: Record<string, any>, streamed: boolean): Interpretation {
  const none: Interpretation = { effects: [], streamed };
  if (data.type === 'system' || data.parent_tool_use_id) return none;

  switch (data.type) {
    case 'message_start':
      return { effects: [{ kind: 'thinking', value: true }], streamed: false };
    case 'stream_event':
      return streamEvent(data.event, streamed);
    case 'content_block_delta': {
      const text = data.delta?.text ?? data.delta?.text_delta ?? '';
      return { effects: text ? [append(text)] : [], streamed };
    }
    case 'message_stop':
      return { effects: [{ kind: 'stopped' }], streamed };
    case 'assistant':
      return assistantMessage(data.message ?? {}, streamed);
    case 'result':
      return { effects: resultEvent(data, streamed), streamed };
    case 'text':
      return { effects: data.text ? [append(data.text)] : [], streamed };
    case 'stderr':
    case 'error':
      return { effects: failure(data), streamed };
    default:
      return none;
  }
}
