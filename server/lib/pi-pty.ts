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
  /** '' lets Pi pick the provider's default */
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
  /** Why there is none, when login is null */
  problem: string;
}

const readJson = (path: string): any => { try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; } };

/**
 * Reads the login from the interviewer's own Pi setup (~/.pi/agent) and nothing else: no extensions, skills, prompts or themes.
 * It never looks at another tool's files or at ANTHROPIC_API_KEY and friends. TRIO_PI_API_KEY with TRIO_PI_PROVIDER
 * (and TRIO_PI_MODEL) passes a key without any Pi setup. Without TRIO_PI_PROVIDER or a defaultProvider in Pi's settings there
 * is nothing to follow, so none is guessed.
 */
export function readPiLogin(home: string = homedir(), env: Record<string, string | undefined> = process.env): PiLoginResult {
  const agent = join(home, '.pi', 'agent');
  const settings = readJson(join(agent, 'settings.json'));
  const provider: string = env.TRIO_PI_PROVIDER || (typeof settings?.defaultProvider === 'string' ? settings.defaultProvider : '');
  const model: string = env.TRIO_PI_MODEL || (!env.TRIO_PI_PROVIDER && typeof settings?.defaultModel === 'string' ? settings.defaultModel : '');
  if (env.TRIO_PI_API_KEY) {
    if (!provider) return { login: null, problem: 'TRIO_PI_API_KEY is set but TRIO_PI_PROVIDER is not. Set it to the provider the key is for, for example anthropic.' };
    return { login: { provider, model, auth: { type: 'api_key', key: env.TRIO_PI_API_KEY }, source: 'TRIO_PI_API_KEY' }, problem: '' };
  }
  if (!provider) return { login: null, problem: 'Pi has no default provider. Run pi, use /login and pick a model (it is saved in ~/.pi/agent), or set TRIO_PI_PROVIDER with TRIO_PI_API_KEY.' };
  const auth = readJson(join(agent, 'auth.json'))?.[provider];
  const custom = readJson(join(agent, 'models.json'))?.providers?.[provider];
  if (!auth && !custom) return { login: null, problem: `Pi has no saved login for ${provider}. Run pi and use /login, or set TRIO_PI_API_KEY.` };
  if (auth && typeof auth.key === 'string' && auth.key.startsWith('!')) {
    return { login: null, problem: `The Pi login for ${provider} is a shell command, which cannot run inside the sandbox. Put the key itself in Pi's auth.json, or set TRIO_PI_API_KEY.` };
  }
  return { login: { provider, model, auth, providerConfig: custom, source: 'your own Pi setup' }, problem: '' };
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

/** Keys of other tools that Pi would pick up from the environment on its own. They are taken out, so the only login is the one copied in. */
export const PI_BLOCKED_ENVIRONMENT = ['ANTHROPIC_API_KEY', 'ANTHROPIC_OAUTH_TOKEN', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY'];

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
