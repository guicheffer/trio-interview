import { describe, expect, test } from 'vitest';
import { currentSubagents } from '../subagents';

const chip = (type: string, description: string) => '```trio-subagent\n' + JSON.stringify({ type, description }) + '\n```';
const user = (content: string) => ({ role: 'user' as const, content, timestamp: 1 });
const bot = (content: string) => ({ role: 'assistant' as const, content, timestamp: 2 });

describe('currentSubagents', () => {
  test('lists the subagents of the latest answer only', () => {
    const messages = [user('a'), bot(chip('old', 'earlier')), user('b'), bot(`Starting\n\n${chip('general-purpose', 'one')}\n\n${chip('Explore', 'two')}`)];
    expect(currentSubagents(messages)).toEqual([
      { type: 'general-purpose', description: 'one' },
      { type: 'Explore', description: 'two' },
    ]);
  });

  test('is empty without subagents or with a broken block', () => {
    expect(currentSubagents([user('a'), bot('plain')])).toEqual([]);
    expect(currentSubagents([user('a'), bot('```trio-subagent\nnot json\n```')])).toEqual([]);
  });
});
