import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { basename, dirname, join } from 'path';
import { buildTerminalSystemPrompt } from './assistant-prompt.js';

/** The oldest Pi these flags were checked against */
export const PI_MIN_VERSION = { major: 0, minor: 73 };

/** One private Pi home per candidate and exercise, so none of the interviewer's own setup comes along */
export function piHomeDir(workPath: string): string {
  return join(dirname(workPath), `.agent-pi-${basename(workPath)}`);
}

/** What the private home needs from the interviewer's own Pi: the provider, the model, the login for that provider, and its definition when it is a custom one */
export interface PiLogin {
  provider: string;
  /** '' lets Pi pick the provider's own default */
  model: string;
  /** The saved login entry for that provider, copied as it is */
  auth: unknown;
  /** Present when the provider is a custom one (an address of your own) */
  providerConfig?: unknown;
  /** Where it came from, in words (never a secret) */
  source: string;
}

export interface PiLoginResult {
  login: PiLogin | null;
  /** Why there is none, when login is null: one short sentence for the interviewer */
  problem: string;
}

/** The sentence said when nothing is signed in. Short on purpose: it is shown as it is. */
export const PI_SIGN_IN_HINT = 'Sign in once: run pi, then /login.';

const readJson = (path: string): any => { try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; } };

/**
 * The key variables Pi documents for each provider (the ones it reads on its own). Only these are looked at: not the router
 * and gateway variables of Claude Code, not cloud credentials such as AWS_*, and nothing from another tool's files.
 * The order is the order Pi itself prefers a provider in.
 */
export const PI_PROVIDER_KEYS: Array<[provider: string, variables: string[]]> = [
  ['anthropic', ['ANTHROPIC_OAUTH_TOKEN', 'ANTHROPIC_API_KEY']],
  ['openai', ['OPENAI_API_KEY']],
  ['deepseek', ['DEEPSEEK_API_KEY']],
  ['google', ['GEMINI_API_KEY']],
  ['github-copilot', ['COPILOT_GITHUB_TOKEN']],
  ['openrouter', ['OPENROUTER_API_KEY']],
  ['xai', ['XAI_API_KEY']],
  ['groq', ['GROQ_API_KEY']],
  ['cerebras', ['CEREBRAS_API_KEY']],
  ['zai', ['ZAI_API_KEY']],
  ['mistral', ['MISTRAL_API_KEY']],
  ['minimax', ['MINIMAX_API_KEY']],
  ['moonshotai', ['MOONSHOT_API_KEY']],
  ['huggingface', ['HF_TOKEN']],
  ['fireworks', ['FIREWORKS_API_KEY']],
  ['kimi-coding', ['KIMI_API_KEY']],
];

/** A cheaper model than Pi's own pick for a provider, where Pi's pick is its largest one. Everything else keeps Pi's default. */
const PREFERRED_MODEL: Record<string, string> = { anthropic: 'claude-sonnet-4-6' };

/**
 * Finds a login on the interviewer's machine, in this order, and copies only the first provider that has one:
 *   1. TRIO_PI_API_KEY (with TRIO_PI_PROVIDER, anthropic when missing), an explicit choice for one run;
 *   2. what Pi itself saved in ~/.pi/agent (/login, including a subscription, or a key), starting with its default provider;
 *   3. a provider key in the environment that Pi documents (ANTHROPIC_API_KEY, OPENAI_API_KEY and so on).
 * Nothing from Claude Code, OpenCode, a router or a cloud account is read. The model is Pi's own saved default when it belongs
 * to the provider, else a mid sized one where that is known, else Pi picks.
 */
export function readPiLogin(home: string = homedir(), env: Record<string, string | undefined> = process.env): PiLoginResult {
  const agent = join(home, '.pi', 'agent');
  const settings = readJson(join(agent, 'settings.json'));
  const saved = readJson(join(agent, 'auth.json')) ?? {};
  const models = readJson(join(agent, 'models.json'))?.providers ?? {};
  const modelFor = (provider: string): string => env.TRIO_PI_MODEL || (provider === settings?.defaultProvider && typeof settings?.defaultModel === 'string' ? settings.defaultModel : PREFERRED_MODEL[provider] ?? '');

  if (env.TRIO_PI_API_KEY) {
    const provider = env.TRIO_PI_PROVIDER || 'anthropic';
    return { login: { provider, model: modelFor(provider), auth: { type: 'api_key', key: env.TRIO_PI_API_KEY }, source: 'TRIO_PI_API_KEY' }, problem: '' };
  }

  // What Pi saved itself comes first (its default provider, then the others), then the keys in the environment
  const savedOrder = [...new Set([...(typeof settings?.defaultProvider === 'string' ? [settings.defaultProvider] : []), ...Object.keys(saved), ...Object.keys(models)])];
  let shellKey = '';
  for (const provider of savedOrder) {
    const entry = saved[provider];
    if (entry && typeof entry === 'object') {
      // a key that is a command would run inside the sandbox, where the interviewer's keychain and tools are closed
      if (typeof entry.key === 'string' && entry.key.startsWith('!')) { shellKey = provider; continue; }
      return { login: { provider, model: modelFor(provider), auth: entry, providerConfig: models[provider], source: entry.type === 'oauth' ? 'your Pi sign in' : 'your Pi setup' }, problem: '' };
    }
    if (models[provider]) return { login: { provider, model: modelFor(provider), auth: undefined, providerConfig: models[provider], source: 'your Pi setup' }, problem: '' };
  }
  for (const [provider, variables] of PI_PROVIDER_KEYS) {
    const variable = variables.find(name => env[name]);
    if (variable) return { login: { provider, model: modelFor(provider), auth: { type: 'api_key', key: env[variable] }, source: variable }, problem: '' };
  }
  if (shellKey) return { login: null, problem: `The Pi key for ${shellKey} is a command, which cannot run inside the sandbox. Run pi, use /login, or put the key itself in Pi.` };
  return { login: null, problem: PI_SIGN_IN_HINT };
}

/** Writes the private config (the one provider, no packages or extensions) and the login, readable by the owner only. Returns why not when there is no login. */
export function seedPiHome(piHome: string, result: PiLoginResult = readPiLogin()): string | null {
  const login = result.login;
  if (!login) return result.problem;
  const agent = join(piHome, 'agent');
  mkdirSync(agent, { recursive: true });
  mkdirSync(join(piHome, 'sessions'), { recursive: true });
  mkdirSync(join(piHome, 'tmp'), { recursive: true });
  writeFileSync(join(agent, 'settings.json'), JSON.stringify({
    defaultProvider: login.provider,
    ...(login.model ? { defaultModel: login.model } : {}),
    enableInstallTelemetry: false,
    quietStartup: true,
    packages: [],
    extensions: [],
    skills: [],
    prompts: [],
    themes: [],
  }, null, 2));
  secretFile(join(agent, 'auth.json'), JSON.stringify(login.auth ? { [login.provider]: login.auth } : {}));
  if (login.providerConfig) secretFile(join(agent, 'models.json'), JSON.stringify({ providers: { [login.provider]: login.providerConfig } }));
  return null;
}

function secretFile(path: string, text: string): void {
  writeFileSync(path, text, { mode: 0o600 });
  try { chmodSync(path, 0o600); } catch {}
}

/** The interview rules, appended to Pi's own system prompt (APPEND_SYSTEM.md in its config folder is where Pi documents this) */
export function writePiRules(piHome: string, assistantContext: string): void {
  const agent = join(piHome, 'agent');
  mkdirSync(agent, { recursive: true });
  writeFileSync(join(agent, 'APPEND_SYSTEM.md'), `${buildTerminalSystemPrompt(assistantContext)}\n`);
}

export function piEnvironment(piHome: string): Record<string, string> {
  return {
    PI_CODING_AGENT_DIR: join(piHome, 'agent'),
    PI_CODING_AGENT_SESSION_DIR: join(piHome, 'sessions'),
    // no update check, no install ping, nothing fetched at start
    PI_OFFLINE: '1',
    PI_SKIP_VERSION_CHECK: '1',
    PI_TELEMETRY: '0',
    // its small files go here and not in the interviewer's temporary folder, which the operating system sandbox keeps closed
    TMPDIR: join(piHome, 'tmp'),
    TEMP: join(piHome, 'tmp'),
    TMP: join(piHome, 'tmp'),
  };
}

/** Every key variable Pi reads on its own, plus the router and cloud ones of other tools. They are taken out of what Pi runs with, so the only login it has is the one copied into its private home. */
export const PI_BLOCKED_ENVIRONMENT = [
  ...PI_PROVIDER_KEYS.flatMap(([, variables]) => variables),
  'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_API_KEY', 'GH_TOKEN', 'GITHUB_TOKEN', 'AZURE_OPENAI_API_KEY', 'GOOGLE_CLOUD_API_KEY', 'CLOUDFLARE_API_KEY',
  'AWS_PROFILE', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_BEARER_TOKEN_BEDROCK',
];

/** Nothing of the interviewer's machine is loaded: no extensions, skills, prompt templates, themes or context files (the rules come with the system prompt) */
export function piArgs(resume: boolean): string[] {
  return ['--no-extensions', '--no-skills', '--no-prompt-templates', '--no-themes', '--no-context-files', '--offline', ...(resume ? ['--continue'] : [])];
}

export function hasPiHistory(piHome: string): boolean {
  try { return readdirSync(join(piHome, 'sessions')).length > 0; } catch { return false; }
}

/** The folder that holds the program and the packages it needs, so the sandbox can open it again when it lives under the home */
export function piProgramFolders(bin: string): string[] {
  let resolved = bin;
  try { resolved = realpathSync(bin); } catch {}
  const marker = resolved.indexOf('/node_modules/');
  const folders = [marker > 0 ? resolved.slice(0, marker + '/node_modules'.length) : dirname(resolved)];
  // a program started as `node program.js` also reads what sits next to it
  if (existsSync(dirname(resolved))) folders.push(dirname(resolved));
  return [...new Set(folders)];
}
