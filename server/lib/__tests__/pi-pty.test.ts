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
  test('from what Pi saved itself: the default provider first, a key or a /login sign in, copied as it is', () => {
    const home = piSetup({ settings: { defaultProvider: 'openai', defaultModel: 'gpt-x' }, auth: { anthropic: { type: 'api_key', key: 'other' }, openai: { type: 'api_key', key: 'sk-test' } } });
    const { login } = readPiLogin(home, {});
    expect(login?.provider).toBe('openai');
    expect(login?.model).toBe('gpt-x');
    expect(login?.auth).toEqual({ type: 'api_key', key: 'sk-test' });
  });

  test('a subscription sign in (/login) is found with no settings at all, and Pi picks the model', () => {
    const home = piSetup({ auth: { anthropic: { type: 'oauth', access: 'a', refresh: 'r', expires: 1 } } });
    const { login } = readPiLogin(home, {});
    expect(login?.provider).toBe('anthropic');
    expect(login?.source).toBe('your Pi sign in');
    expect(login?.auth).toMatchObject({ type: 'oauth' });
  });

  test('a documented key in the environment is used when Pi has nothing saved, with a mid sized model where one is known', () => {
    const anthropic = readPiLogin(tmp(), { ANTHROPIC_API_KEY: 'k1' }).login;
    expect(anthropic).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-4-6', source: 'ANTHROPIC_API_KEY', auth: { type: 'api_key', key: 'k1' } });
    expect(readPiLogin(tmp(), { OPENAI_API_KEY: 'k2' }).login).toMatchObject({ provider: 'openai', model: '' });
    expect(readPiLogin(tmp(), { ANTHROPIC_OAUTH_TOKEN: 'o', ANTHROPIC_API_KEY: 'k' }).login?.source).toBe('ANTHROPIC_OAUTH_TOKEN');
  });

  test('what Pi saved wins over the environment', () => {
    const home = piSetup({ auth: { groq: { type: 'api_key', key: 'saved' } } });
    expect(readPiLogin(home, { ANTHROPIC_API_KEY: 'env' }).login?.provider).toBe('groq');
  });

  test('never from another tool: router and cloud variables, the Claude settings and OpenCode\'s login are not used', () => {
    const home = tmp();
    mkdirSync(join(home, '.claude'), { recursive: true });
    writeFileSync(join(home, '.claude', 'settings.json'), JSON.stringify({ env: { ANTHROPIC_API_KEY: 'from-claude', ANTHROPIC_AUTH_TOKEN: 'tok' } }));
    mkdirSync(join(home, '.local', 'share', 'opencode'), { recursive: true });
    writeFileSync(join(home, '.local', 'share', 'opencode', 'auth.json'), JSON.stringify({ anthropic: { type: 'api', key: 'from-opencode' } }));
    mkdirSync(join(home, '.config', 'opencode'), { recursive: true });
    writeFileSync(join(home, '.config', 'opencode', 'opencode.json'), JSON.stringify({ model: 'anthropic/claude' }));
    const result = readPiLogin(home, { ANTHROPIC_AUTH_TOKEN: 'router-token', ANTHROPIC_BASE_URL: 'http://router', AWS_PROFILE: 'company', AWS_REGION: 'x', TRIO_OPENCODE_API_KEY: 'y', CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: '1' });
    expect(result.login).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/from-claude|from-opencode|router-token|company/);
  });

  test('nothing signed in is one short human sentence and no raw variable names', () => {
    const result = readPiLogin(tmp(), {});
    expect(result.login).toBeNull();
    expect(result.problem).toBe('Sign in once: run pi, then /login.');
    expect(result.problem).not.toMatch(/TRIO_|_KEY/);
  });

  test('an explicit key for one run wins, with anthropic when no provider is named', () => {
    expect(readPiLogin(tmp(), { TRIO_PI_API_KEY: 'k', TRIO_PI_PROVIDER: 'groq', TRIO_PI_MODEL: 'm' }).login).toMatchObject({ provider: 'groq', model: 'm', auth: { type: 'api_key', key: 'k' }, source: 'TRIO_PI_API_KEY' });
    expect(readPiLogin(tmp(), { TRIO_PI_API_KEY: 'k' }).login?.provider).toBe('anthropic');
  });

  test('a key that is a shell command is skipped, because it would run inside the sandbox; another provider is used if there is one', () => {
    const only = piSetup({ settings: { defaultProvider: 'anthropic' }, auth: { anthropic: { type: 'api_key', key: '!security find-generic-password -ws anthropic' } } });
    const result = readPiLogin(only, {});
    expect(result.login).toBeNull();
    expect(result.problem).toContain('command');
    const other = piSetup({ settings: { defaultProvider: 'anthropic' }, auth: { anthropic: { type: 'api_key', key: '!op read x' }, openai: { type: 'api_key', key: 'sk' } } });
    expect(readPiLogin(other, {}).login?.provider).toBe('openai');
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
    expect(reason).toBe('Sign in once: run pi, then /login.');
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
    for (const key of ['ANTHROPIC_API_KEY', 'ANTHROPIC_OAUTH_TOKEN', 'OPENAI_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'AWS_PROFILE', 'GH_TOKEN']) expect(PI_BLOCKED_ENVIRONMENT).toContain(key);
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

describe('a program kept where the sandbox cannot open it', () => {
  test('is reported before it fails to start, with the reason and what to do', async () => {
    const { programPlaceProblem } = await import('../assistant-facts.js');
    expect(programPlaceProblem('/tmp/pi-prefix/node_modules/.bin/pi', 'Pi')).toMatch(/temporary folder.*install it somewhere permanent/i);
    expect(programPlaceProblem('/private/var/folders/ab/T/x/pi', 'Pi')).toMatch(/temporary folder/);
    expect(programPlaceProblem('/usr/local/bin/pi', 'Pi')).toBeNull();
    expect(programPlaceProblem('/Users/someone/.npm-global/bin/pi', 'Pi')).toBeNull();
    expect(programPlaceProblem('pi-not-in-path-xyz', 'Pi')).toBeNull();
  });

  test('the check for Pi and OpenCode says so, so the picker and make config do not call it ready', async () => {
    const { assistantFacts } = await import('../assistant-facts.js');
    const { describeTool } = await import('../../../shared/assistant-status.js');
    for (const tool of ['pi', 'opencode'] as const) {
      const report = describeTool(assistantFacts(tool, '9.9.9', '', undefined, `/tmp/somewhere/${tool}`));
      expect(report.ok).toBe(false);
      expect(report.message).toMatch(/temporary folder/);
    }
  });
});

describe('Claude Code inside the operating system sandbox', () => {
  const claudeSession = async () => {
    const { AgentPtySession } = await import('../agent-pty.js');
    const work = join(tmp(), '.solutions', 'maya', 'fibonacci');
    mkdirSync(work, { recursive: true });
    return { work, make: (key: string) => new AgentPtySession({ key, tool: 'claude-code', workPath: work, assistantContext: '' }) };
  };

  test('is started through the sandbox, because its own sandbox never covered what a person types after "!"', async () => {
    const { make } = await claudeSession();
    spawn.mockReset().mockReturnValue({ onData: () => {}, onExit: () => {}, write: () => {}, resize: () => {}, kill: () => {} });
    sandboxWorks = true;
    try {
      make('c1').start();
      expect(spawn).toHaveBeenCalledTimes(1);
      const [bin, args] = spawn.mock.calls[0];
      expect(bin).toBe('/usr/bin/sandbox-exec');
      // the program itself comes after the profile, still with the limits it always had
      expect(args).toEqual(expect.arrayContaining(['--strict-mcp-config', '--no-chrome']));
    } finally { sandboxWorks = false; }
  });

  test('is not started at all when there is no sandbox, and the terminal says so', async () => {
    const { make } = await claudeSession();
    spawn.mockReset();
    sandboxWorks = false;
    const session = make('c2');
    session.start();
    expect(spawn).not.toHaveBeenCalled();
    expect(session.running).toBe(false);
    expect(session.scrollback).toContain('Could not start Claude Code');
    expect(session.scrollback).toMatch(/sandbox/);
  });
});
