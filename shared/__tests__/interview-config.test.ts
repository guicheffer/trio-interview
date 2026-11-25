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
    const config = { tools: ['agent' as const, 'opencode' as const], exercises: ['fibonacci', 'gearshare'], tunnel: 'none' as const, pi: { provider: 'router' as const, model: 'sonnet' }, opencode: { provider: 'own-login' as const, model: '' }, sources: ['https://github.com/acme/interview-exercises.git', '../my-exercises'] };
    expect(parseConfig(renderConfig(config))).toEqual(config);
  });

  test('Pi is a tool that can be allowed, and Codex is not a tool at all, so a file that names it is ignored', () => {
    expect(DEFAULT_CONFIG.tools).toContain('pi');
    expect(parseConfig('tools:\n  - pi').tools).toEqual(['agent', 'pi']);
    expect(toolAllowed(parseConfig('tools:\n  - claude-code'), 'pi')).toBe(false);
    expect(parseConfig('tools:\n  - claude-code\n  - codex').tools).toEqual(['agent', 'claude-code']);
    const config = { tools: ['agent' as const, 'pi' as const], exercises: [], tunnel: 'none' as const, pi: { provider: 'auto' as const, model: '' }, opencode: { provider: 'auto' as const, model: '' }, sources: [] };
    expect(parseConfig(renderConfig(config))).toEqual(config);
  });

  test('the pi block chooses where Pi gets its model, auto by default, and nothing else can get in', () => {
    expect(parseConfig('').pi).toEqual({ provider: 'auto', model: '' });
    expect(parseConfig('pi:\n  provider: router\n  model: sonnet-x').pi).toEqual({ provider: 'router', model: 'sonnet-x' });
    expect(parseConfig('pi:\n  provider: Own-Login').pi.provider).toBe('own-login');
    // a typo or an unknown value keeps the default instead of stopping the interview
    expect(parseConfig('pi:\n  provider: cloud\n  model: "a;b"').pi).toEqual({ provider: 'auto', model: '' });
    expect(parseConfig('pi:\n  model: $(id)').pi.model).toBe('');
    expect(parseConfig('pi:\n  model: ' + 'x'.repeat(200)).pi.model).toBe('');
    // keys of another block are not read as Pi's
    expect(parseConfig('pi:\n  provider: router\ntunnel: none\nprovider: own-login').pi.provider).toBe('router');
    expect(parseConfig('tunnel: none\n  provider: router').pi.provider).toBe('auto');
  });

  test('OpenCode has the same block, and the two never read each other\'s keys', () => {
    expect(parseConfig('').opencode).toEqual({ provider: 'auto', model: '' });
    const config = parseConfig('pi:\n  provider: router\n  model: a\nopencode:\n  provider: own-login\n  model: b');
    expect(config.pi).toEqual({ provider: 'router', model: 'a' });
    expect(config.opencode).toEqual({ provider: 'own-login', model: 'b' });
    expect(parseConfig('opencode:\n  provider: nonsense\n  model: "x;y"').opencode).toEqual({ provider: 'auto', model: '' });
    const written = { ...DEFAULT_CONFIG, opencode: { provider: 'router' as const, model: 'm' } };
    expect(parseConfig(renderConfig(written)).opencode).toEqual(written.opencode);
  });

  test('the pi block is written and read back', () => {
    const config = { ...DEFAULT_CONFIG, pi: { provider: 'own-login' as const, model: 'm1' } };
    expect(parseConfig(renderConfig(config)).pi).toEqual(config.pi);
    expect(parseConfig(renderConfig(DEFAULT_CONFIG)).pi).toEqual(DEFAULT_CONFIG.pi);
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
    const config = { tools: ['agent' as const], exercises: [], tunnel: 'cloudflared' as const, pi: { provider: 'auto' as const, model: '' }, opencode: { provider: 'auto' as const, model: '' }, sources: [] };
    expect(parseConfig(renderConfig(config)).tunnel).toBe('cloudflared');
  });

  test('asks whether a tool is allowed', () => {
    expect(toolAllowed(parseConfig('tools:\n  - claude-code'), 'opencode')).toBe(false);
    expect(toolAllowed(DEFAULT_CONFIG, 'opencode')).toBe(true);
  });

  test('sources accept a git URL or a folder, and nothing that could turn into a command', () => {
    const ok = ['https://github.com/acme/exercises.git', 'git@github.com:acme/exercises.git', '../my-exercises', '~/work/exercises', '/srv/exercises', 'team-exercises'];
    for (const value of ok) expect(parseConfig(`sources:\n  - ${value}`).sources, value).toEqual([value]);
    const bad = ['--upload-pack=touch /tmp/x', '-oProxyCommand=id', 'https://x.test/a b', 'https://x.test/a;rm -rf ~', 'https://x.test/$(id)', 'ext::sh -c id', 'file:///etc', 'ftp://x.test/a', 'a`id`', '', 'x'.repeat(301)];
    for (const value of bad) expect(parseConfig(`sources:\n  - ${value}`).sources, value).toEqual([]);
  });

  test('sources are empty by default and survive a write and a read', () => {
    expect(parseConfig('').sources).toEqual([]);
    const config = { ...DEFAULT_CONFIG, sources: ['https://github.com/acme/exercises.git'] };
    expect(parseConfig(renderConfig(config)).sources).toEqual(config.sources);
  });
});
