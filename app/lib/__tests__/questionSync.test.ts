import { describe, expect, test } from 'vitest';
import { parseQuestionState, questionsAreReadOnly, scrollFromRatio, scrollRatio } from '../questionSync';

const user = (from?: 'interviewer' | 'candidate') => ({ role: 'user' as const, content: 'q', timestamp: 1, from });
const bot = { role: 'assistant' as const, content: 'a', timestamp: 2 };

describe('question state', () => {
  test('keeps the stored state only for the same questions', () => {
    const raw = JSON.stringify({ key: 'k1', step: 1, picked: { 0: ['A'] }, other: { 1: 'typing' }, dismissed: false });
    expect(parseQuestionState(raw, 'k1')).toMatchObject({ step: 1, picked: { 0: ['A'] }, other: { 1: 'typing' } });
    expect(parseQuestionState(raw, 'k2')).toEqual({ key: 'k2', step: 0, picked: {}, other: {}, dismissed: false });
    expect(parseQuestionState('not json', 'k1').step).toBe(0);
    expect(parseQuestionState(null, 'k1').step).toBe(0);
  });
});

describe('who answers the questions', () => {
  test('only the person who wrote the last message answers', () => {
    expect(questionsAreReadOnly('interviewer', [user('candidate'), bot])).toBe(true);
    expect(questionsAreReadOnly('candidate', [user('candidate'), bot])).toBe(false);
    expect(questionsAreReadOnly('candidate', [user('interviewer'), bot])).toBe(true);
  });

  test('stays open when nobody is known', () => {
    expect(questionsAreReadOnly(null, [user('candidate'), bot])).toBe(false);
    expect(questionsAreReadOnly('interviewer', [user(), bot])).toBe(false);
    expect(questionsAreReadOnly('interviewer', [bot])).toBe(false);
  });
});

describe('scroll position', () => {
  test('goes from pixels to a share and back on a screen of another height', () => {
    expect(scrollRatio({ scrollTop: 300, scrollHeight: 1000, clientHeight: 400 })).toBe(0.5);
    expect(scrollFromRatio({ scrollHeight: 2000, clientHeight: 500 }, 0.5)).toBe(750);
    expect(scrollRatio({ scrollTop: 0, scrollHeight: 300, clientHeight: 400 })).toBe(0);
  });
});
