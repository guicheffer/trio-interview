import { describe, expect, test } from 'vitest';
import { DEFAULT_CONFIG, parseConfig, renderConfig, toolAllowed } from '../interview-config.js';

describe('interview config', () => {
  test('an empty file allows everything, like before', () => {
    expect(parseConfig('')).toEqual(DEFAULT_CONFIG);
  });

  test('reads the tools and the exercises', () => {
    const config = parseConfig(`
# comment
tools:
  - agent
  - claude-code
exercises:
  - fibonacci
`);
    expect(config.tools).toEqual(['agent', 'claude-code']);
    expect(config.exercises).toEqual(['fibonacci']);
  });

  test('the chat can never be removed, so a candidate always has an assistant', () => {
    expect(parseConfig('tools:\n  - opencode').tools).toEqual(['agent', 'opencode']);
    expect(parseConfig('tools:\n').tools).toEqual(['agent']);
  });

  test('unknown tools, bad folder names and nonsense are ignored instead of stopping the interview', () => {
    const config = parseConfig('tools:\n  - claude-code\n  - notatool\nexercises:\n  - ../etc\n  - ok_1\n::: junk\nallowOwnSetup: no');
    expect(config.tools).toEqual(['agent', 'claude-code']);
    expect(config.exercises).toEqual(['ok_1']);
  });

  test('writing the file and reading it back gives the same settings', () => {
    const config = { tools: ['agent' as const, 'opencode' as const], exercises: ['fibonacci', 'gearshare'] };
    expect(parseConfig(renderConfig(config))).toEqual(config);
  });

  test('asks whether a tool is allowed', () => {
    expect(toolAllowed(parseConfig('tools:\n  - claude-code'), 'opencode')).toBe(false);
    expect(toolAllowed(DEFAULT_CONFIG, 'opencode')).toBe(true);
  });
});
