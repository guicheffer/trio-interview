import { describe, expect, test } from 'vitest';
import { PLAN_PREFIX, sentHistory, stepHistory, typedText } from '../chatHistory';

const user = (content: string) => ({ role: 'user' as const, content, timestamp: 0 });
const ai = (content: string) => ({ role: 'assistant' as const, content, timestamp: 0 });

describe('chat history', () => {
  test('keeps only what the person sent, in order', () => {
    expect(sentHistory([user('one'), ai('x'), user('two')])).toEqual(['one', 'two']);
  });

  test('plan mode wording is not part of what was typed', () => {
    expect(typedText(PLAN_PREFIX + ' Use the project first.\n\nadd tests')).toBe('add tests');
    expect(sentHistory([user(PLAN_PREFIX + ' Use the project first.\n\nadd tests')])).toEqual(['add tests']);
  });

  test('the same message twice in a row is kept once', () => {
    expect(sentHistory([user('hi'), ai('a'), user('hi')])).toEqual(['hi']);
  });

  test('arrow up goes back until the oldest, arrow down comes forward', () => {
    expect(stepHistory(0, 2, 'ArrowUp')).toBe(1);
    expect(stepHistory(2, 2, 'ArrowUp')).toBeNull();
    expect(stepHistory(1, 2, 'ArrowDown')).toBe(0);
    expect(stepHistory(0, 2, 'ArrowDown')).toBeNull();
    expect(stepHistory(0, 0, 'ArrowUp')).toBeNull();
  });
});
