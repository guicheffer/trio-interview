import { describe, expect, test } from 'vitest';
import { AUTO_COMPACT_AT, CONVERSATION_TOKEN_BUDGET, DEFAULT_MODEL, MODELS, MODEL_KEYS, PLAN_MODEL, getModelOption, needsCompaction } from '../models.js';

describe('model catalog', () => {
  test('keys are unique and listed for validation', () => {
    const keys = MODELS.map(m => m.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...MODEL_KEYS]).toEqual(keys);
  });

  test('the default and the planning model exist', () => {
    expect(MODELS.some(m => m.key === DEFAULT_MODEL)).toBe(true);
    expect(MODELS.some(m => m.key === PLAN_MODEL)).toBe(true);
  });

  test('every model has a context window', () => {
    for (const m of MODELS) expect(m.contextWindow).toBeGreaterThan(0);
  });

  test('an unknown key falls back to the first model', () => {
    expect(getModelOption('nope')).toBe(MODELS[0]);
    expect(getModelOption('haiku').key).toBe('haiku');
  });
});


describe('conversation budget and compaction', () => {
  test('a conversation is meant to reach 20M tokens', () => {
    expect(CONVERSATION_TOKEN_BUDGET).toBe(20_000_000);
  });

  test('compacts once the context passes the threshold of the window, not before', () => {
    expect(needsCompaction(700_000, 1_000_000)).toBe(true);
    expect(needsCompaction(AUTO_COMPACT_AT * 200_000 - 1, 200_000)).toBe(false);
    expect(needsCompaction(150_000, 200_000)).toBe(true);
    expect(needsCompaction(null, 200_000)).toBe(false);
    expect(needsCompaction(0, 200_000)).toBe(false);
  });
});
