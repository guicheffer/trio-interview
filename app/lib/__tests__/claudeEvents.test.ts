import { describe, expect, test } from 'vitest';
import { friendlyError, interpretClaudeEvent } from '../claudeEvents';

const interpret = (data: Record<string, unknown>, streamed = false) => interpretClaudeEvent(data, streamed);

describe('friendlyError', () => {
  test('explains a spent budget and leaves other text alone', () => {
    expect(friendlyError('Error: Daily AI budget is used up for key x')).toMatch(/interviewer/);
    expect(friendlyError('plain')).toBe('plain');
  });
});

describe('interpretClaudeEvent', () => {
  test('ignores system events and anything a subagent says to itself', () => {
    expect(interpret({ type: 'system' }).effects).toEqual([]);
    expect(interpret({ type: 'text', text: 'x', parent_tool_use_id: 'tu1' }).effects).toEqual([]);
    expect(interpret({ type: 'unknown' }).effects).toEqual([]);
  });

  test('a new message starts thinking and resets streaming', () => {
    expect(interpret({ type: 'message_start' }, true)).toEqual({ effects: [{ kind: 'thinking', value: true }], streamed: false });
  });

  test('streamed text stops thinking and marks the answer as streamed', () => {
    const result = interpret({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } } });
    expect(result.streamed).toBe(true);
    expect(result.effects).toEqual([{ kind: 'thinking', value: false }, { kind: 'append', text: 'Hi' }]);
  });

  test('a second text block after streaming starts a new paragraph', () => {
    const result = interpret({ type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'text' } } }, true);
    expect(result.effects).toEqual([{ kind: 'append', text: '\n\n' }]);
    expect(interpret({ type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'text' } } }, false).effects).toEqual([]);
  });

  test('plain deltas and text events append, empty ones do nothing', () => {
    expect(interpret({ type: 'content_block_delta', delta: { text: 'a' } }).effects).toEqual([{ kind: 'append', text: 'a' }]);
    expect(interpret({ type: 'content_block_delta', delta: { text_delta: 'b' } }).effects).toEqual([{ kind: 'append', text: 'b' }]);
    expect(interpret({ type: 'content_block_delta', delta: {} }).effects).toEqual([]);
    expect(interpret({ type: 'text', text: 'c' }).effects).toEqual([{ kind: 'append', text: 'c' }]);
    expect(interpret({ type: 'text' }).effects).toEqual([]);
  });

  test('message_stop stops the turn', () => {
    expect(interpret({ type: 'message_stop' }).effects).toEqual([{ kind: 'stopped' }]);
  });

  test('an assistant message reports the context used', () => {
    const result = interpret({ type: 'assistant', message: { usage: { input_tokens: 10, cache_read_input_tokens: 20, cache_creation_input_tokens: 30, output_tokens: 40 } } });
    expect(result.effects).toEqual([{ kind: 'context', total: 100 }]);
  });

  test('a subagent call becomes a chip', () => {
    const result = interpret({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Agent', input: { subagent_type: 'Explore', description: 'look' } }, { type: 'tool_use', name: 'Read', input: {} }] } });
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toMatchObject({ kind: 'append' });
    expect((result.effects[0] as { text: string }).text).toContain('```trio-subagent');
    expect((result.effects[0] as { text: string }).text).toContain('"type":"Explore"');
  });

  test('a finished assistant message replaces the last answer unless it already streamed', () => {
    const content = [{ type: 'text', text: 'Done' }];
    expect(interpret({ type: 'assistant', message: { content } }).effects).toEqual([{ kind: 'thinking', value: false }, { kind: 'replaceLast', text: 'Done' }]);
    expect(interpret({ type: 'assistant', message: { content } }, true).effects).toEqual([{ kind: 'thinking', value: false }]);
  });

  test('thinking without text keeps thinking', () => {
    expect(interpret({ type: 'assistant', message: { content: [{ type: 'thinking' }] } }).effects).toEqual([{ kind: 'thinking', value: true }]);
  });

  test('the result finishes the turn and fills the answer only if nothing streamed', () => {
    expect(interpret({ type: 'result', text: 'Final' }).effects).toEqual([{ kind: 'thinking', value: false }, { kind: 'replaceLast', text: 'Final' }, { kind: 'done' }]);
    expect(interpret({ type: 'result', text: 'Final' }, true).effects).toEqual([{ kind: 'thinking', value: false }, { kind: 'done' }]);
  });

  test('errors are shown, and a lost session is reported for a fresh start', () => {
    expect(interpret({ type: 'error', message: 'boom' }).effects).toEqual([{ kind: 'append', text: '\nAgent error: boom' }]);
    expect(interpret({ type: 'stderr', message: 'No conversation found with session abc' }).effects).toEqual([{ kind: 'sessionExpired' }]);
    expect(interpret({ type: 'error', error: 'daily AI budget is used up' }).effects[0]).toMatchObject({ kind: 'append' });
  });
});
