import { afterEach, describe, expect, test, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { hasPiHistory, piArgs, piEnvironment, piHomeDir, PI_BLOCKED_ENVIRONMENT, readPiLogin, seedPiHome, writePiRules } from '../pi-pty.js';

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'pi-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

/** A fake interviewer home with Pi's own setup in it */
function piSetup(files: { settings?: unknown; auth?: unknown; models?: unknown }) {
  const home = tmp();
  const agent = join(home, '.pi', 'agent');
  mkdirSync(agent, { recursive: true });
  if (files.settings) writeFileSync(join(agent, 'settings.json'), JSON.stringify(files.settings));
  if (files.auth) writeFileSync(join(agent, 'auth.json'), JSON.stringify(files.auth));
  if (files.models) writeFileSync(join(agent, 'models.json'), JSON.stringify(files.models));
  return home;
}

describe('where the Pi login comes from', () => {
  test('from Pi\'s own settings and auth file, the provider it already uses', () => {
    const home = piSetup({ settings: { defaultProvider: 'openai', defaultModel: 'gpt-x' }, auth: { openai: { type: 'api_key', key: 'sk-test' }, anthropic: { type: 'api_key', key: 'other' } } });
    const { login } = readPiLogin(home, {});
    expect(login?.provider).toBe('openai');
    expect(login?.model).toBe('gpt-x');
    expect(login?.auth).toEqual({ type: 'api_key', key: 'sk-test' });
    expect(login?.source).toBe('your own Pi setup');
  });

  test('never from another tool: an Anthropic key in the environment, the Claude settings or OpenCode\'s login are not used', () => {
    const home = tmp();
    mkdirSync(join(home, '.claude'), { recursive: true });
    writeFileSync(join(home, '.claude', 'settings.json'), JSON.stringify({ env: { ANTHROPIC_API_KEY: 'from-claude', ANTHROPIC_AUTH_TOKEN: 'tok' } }));
    mkdirSync(join(home, '.local', 'share', 'opencode'), { recursive: true });
    writeFileSync(join(home, '.local', 'share', 'opencode', 'auth.json'), JSON.stringify({ anthropic: { type: 'api', key: 'from-opencode' } }));
    mkdirSync(join(home, '.config', 'opencode'), { recursive: true });
    writeFileSync(join(home, '.config', 'opencode', 'opencode.json'), JSON.stringify({ model: 'anthropic/claude' }));
    const result = readPiLogin(home, { ANTHROPIC_API_KEY: 'from-env', OPENAI_API_KEY: 'x', TRIO_OPENCODE_API_KEY: 'y' });
    expect(result.login).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/from-claude|from-opencode|from-env/);
  });

  test('Pi\'s settings name a provider but the auth file has no entry for it: no login, and it says which provider', () => {
    const home = piSetup({ settings: { defaultProvider: 'openai' }, auth: { anthropic: { type: 'api_key', key: 'k' } } });
    const result = readPiLogin(home, {});
    expect(result.login).toBeNull();
    expect(result.problem).toContain('openai');
  });

  test('no Pi setup at all says how to make one, and a key without a provider is not guessed', () => {
    expect(readPiLogin(tmp(), {}).problem).toMatch(/\/login/);
    const result = readPiLogin(tmp(), { TRIO_PI_API_KEY: 'k' });
    expect(result.login).toBeNull();
    expect(result.problem).toContain('TRIO_PI_PROVIDER');
  });

  test('an explicit key and provider work without any Pi setup', () => {
    const { login } = readPiLogin(tmp(), { TRIO_PI_API_KEY: 'k', TRIO_PI_PROVIDER: 'groq', TRIO_PI_MODEL: 'm' });
    expect(login).toMatchObject({ provider: 'groq', model: 'm', auth: { type: 'api_key', key: 'k' }, source: 'TRIO_PI_API_KEY' });
  });

  test('a key that is a shell command is refused, because it would run inside the sandbox and fail or reach for the interviewer\'s keychain', () => {
    const home = piSetup({ settings: { defaultProvider: 'anthropic' }, auth: { anthropic: { type: 'api_key', key: '!security find-generic-password -ws anthropic' } } });
    const result = readPiLogin(home, {});
    expect(result.login).toBeNull();
    expect(result.problem).toContain('shell command');
  });

  test('a custom provider keeps its definition (an address of your own)', () => {
    const home = piSetup({ settings: { defaultProvider: 'local' }, models: { providers: { local: { baseUrl: 'http://localhost:1/v1', api: 'openai-completions', apiKey: 'x', models: [{ id: 'm' }] } } } });
    expect((readPiLogin(home, {}).login?.providerConfig as { baseUrl: string }).baseUrl).toBe('http://localhost:1/v1');
  });
});

describe('the private Pi home', () => {
  const setup = () => {
    const work = join(tmp(), '.solutions', 'maya', 'fibonacci');
    const home = piHomeDir(work);
    const login = readPiLogin(tmp(), { TRIO_PI_API_KEY: 'sk-secret-value', TRIO_PI_PROVIDER: 'anthropic' });
    expect(seedPiHome(home, login)).toBeNull();
    return { work, home };
  };

  test('sits next to the candidate\'s folder and holds the login readable by the owner only', () => {
    const { work, home } = setup();
    expect(home).toBe(join(work, '..', '.agent-pi-fibonacci'));
    expect(statSync(join(home, 'agent', 'auth.json')).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(join(home, 'agent', 'auth.json'), 'utf-8'))).toEqual({ anthropic: { type: 'api_key', key: 'sk-secret-value' } });
  });

  test('the key is in no other file, so nothing world readable holds it', () => {
    const { home } = setup();
    for (const file of ['settings.json']) expect(readFileSync(join(home, 'agent', file), 'utf-8')).not.toContain('sk-secret-value');
    expect(piArgs(false).join(' ')).not.toContain('sk-secret-value');
    expect(JSON.stringify(piEnvironment(home))).not.toContain('sk-secret-value');
  });

  test('the settings carry no packages, extensions, skills, prompts or themes, and no install ping', () => {
    const { home } = setup();
    const settings = JSON.parse(readFileSync(join(home, 'agent', 'settings.json'), 'utf-8'));
    for (const key of ['packages', 'extensions', 'skills', 'prompts', 'themes']) expect(settings[key]).toEqual([]);
    expect(settings.enableInstallTelemetry).toBe(false);
    expect(settings.defaultProvider).toBe('anthropic');
  });

  test('nothing is written when there is no login, and the reason is returned', () => {
    const home = join(tmp(), '.agent-pi-x');
    const reason = seedPiHome(home, readPiLogin(tmp(), {}));
    expect(reason).toMatch(/default provider/);
    expect(() => statSync(home)).toThrow();
  });

  test('the interview rules are Pi\'s appended system prompt', () => {
    const { home } = setup();
    writePiRules(home, 'A React app.');
    const rules = readFileSync(join(home, 'agent', 'APPEND_SYSTEM.md'), 'utf-8');
    expect(rules).toMatch(/exercise folder/i);
    expect(rules).toContain('A React app.');
    expect(rules).not.toContain('trio-question');
  });

  test('Pi\'s config, sessions and small files all live in the private home, and it starts offline', () => {
    const { home } = setup();
    const env = piEnvironment(home);
    expect(env.PI_CODING_AGENT_DIR).toBe(join(home, 'agent'));
    expect(env.PI_CODING_AGENT_SESSION_DIR).toBe(join(home, 'sessions'));
    for (const key of ['TMPDIR', 'TEMP', 'TMP']) expect(env[key]).toBe(join(home, 'tmp'));
    expect(env.PI_OFFLINE).toBe('1');
    expect(env.PI_TELEMETRY).toBe('0');
  });

  test('it starts with nothing from the interviewer\'s machine and continues the conversation only when there is one', () => {
    const args = piArgs(false);
    for (const flag of ['--no-extensions', '--no-skills', '--no-prompt-templates', '--no-themes', '--no-context-files', '--offline']) expect(args).toContain(flag);
    expect(args).not.toContain('--continue');
    expect(piArgs(true)).toContain('--continue');
    const { home } = setup();
    expect(hasPiHistory(home)).toBe(false);
    writeFileSync(join(home, 'sessions', 'a.jsonl'), '{}');
    expect(hasPiHistory(home)).toBe(true);
  });

  test('keys other tools left in the environment are listed to be taken out', () => {
    for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_OAUTH_TOKEN', 'OPENAI_API_KEY']) expect(PI_BLOCKED_ENVIRONMENT).toContain(key);
  });
});

// The terminal session decides what to start. The sandbox is made unavailable here to see that Pi is then not started at all.
let sandboxWorks = false;
vi.mock('../os-sandbox.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../os-sandbox.js')>();
  return { ...original, sandboxed: (input: { bin: string; args: string[] }) => (sandboxWorks ? { bin: '/usr/bin/sandbox-exec', args: ['-f', 'p.sb', input.bin, ...input.args] } : original.sandboxMissing('linux')) };
});
const spawn = vi.fn();
vi.mock('../terminal-session.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../terminal-session.js')>();
  return { ...original, loadPty: () => ({ spawn }) };
});

describe('Pi without the operating system sandbox', () => {
  test('is not started, and the terminal says why', async () => {
    const { AgentPtySession } = await import('../agent-pty.js');
    const work = join(tmp(), '.solutions', 'maya', 'fibonacci');
    mkdirSync(work, { recursive: true });
    process.env.TRIO_PI_API_KEY = 'k';
    process.env.TRIO_PI_PROVIDER = 'anthropic';
    sandboxWorks = false;
    try {
      const session = new AgentPtySession({ key: 'k', tool: 'pi', workPath: work, assistantContext: '' });
      session.start();
      expect(spawn).not.toHaveBeenCalled();
      expect(session.running).toBe(false);
      expect(session.scrollback).toContain('Could not start Pi');
      expect(session.scrollback).toMatch(/sandbox/);
    } finally {
      delete process.env.TRIO_PI_API_KEY;
      delete process.env.TRIO_PI_PROVIDER;
    }
  });

  test('inside the sandbox it gets only the login copied into its home, not the keys of other tools, and the flags that keep the interviewer\'s setup out', async () => {
    const { AgentPtySession } = await import('../agent-pty.js');
    const work = join(tmp(), '.solutions', 'maya', 'fibonacci');
    mkdirSync(work, { recursive: true });
    spawn.mockReset().mockReturnValue({ onData: () => {}, onExit: () => {}, write: () => {}, resize: () => {}, kill: () => {} });
    process.env.TRIO_PI_API_KEY = 'k';
    process.env.TRIO_PI_PROVIDER = 'anthropic';
    process.env.ANTHROPIC_API_KEY = 'someone-elses-key';
    sandboxWorks = true;
    try {
      new AgentPtySession({ key: 'k2', tool: 'pi', workPath: work, assistantContext: '' }).start();
      expect(spawn).toHaveBeenCalledTimes(1);
      const [bin, args, options] = spawn.mock.calls[0];
      expect(bin).toBe('/usr/bin/sandbox-exec');
      expect(args).toEqual(expect.arrayContaining(['--no-extensions', '--no-skills', '--no-themes', '--no-context-files', '--offline']));
      expect(options.env.ANTHROPIC_API_KEY).toBeUndefined();
      expect(options.env.PI_CODING_AGENT_DIR).toBe(join(piHomeDir(work), 'agent'));
      expect(options.env.TMPDIR).toBe(join(piHomeDir(work), 'tmp'));
    } finally {
      delete process.env.TRIO_PI_API_KEY;
      delete process.env.TRIO_PI_PROVIDER;
      delete process.env.ANTHROPIC_API_KEY;
      sandboxWorks = false;
    }
  });
});
