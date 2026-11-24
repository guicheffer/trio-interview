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
    const config = { tools: ['agent' as const, 'opencode' as const], exercises: ['fibonacci', 'gearshare'], tunnel: 'none' as const };
    expect(parseConfig(renderConfig(config))).toEqual(config);
  });

  test('the tunnel defaults to ngrok, accepts the known ones, and ignores anything else instead of stopping the interview', () => {
    expect(parseConfig('').tunnel).toBe('ngrok');
    expect(parseConfig('tunnel: cloudflared').tunnel).toBe('cloudflared');
    expect(parseConfig('tunnel: "none"').tunnel).toBe('none');
    expect(parseConfig('tunnel: Cloudflared  # my choice').tunnel).toBe('cloudflared');
    expect(parseConfig('tunnel: localtunnel').tunnel).toBe('ngrok');
    expect(parseConfig('tunnel:').tunnel).toBe('ngrok');
  });

  test('the tunnel is written to the file and read back', () => {
    const config = { tools: ['agent' as const], exercises: [], tunnel: 'cloudflared' as const };
    expect(parseConfig(renderConfig(config)).tunnel).toBe('cloudflared');
  });

  test('asks whether a tool is allowed', () => {
    expect(toolAllowed(parseConfig('tools:\n  - claude-code'), 'opencode')).toBe(false);
    expect(toolAllowed(DEFAULT_CONFIG, 'opencode')).toBe(true);
  });
});
