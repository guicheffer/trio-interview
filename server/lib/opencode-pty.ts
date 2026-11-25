import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'fs';
import { homedir } from 'os';
import { basename, dirname, join } from 'path';
import { buildTerminalSystemPrompt } from './assistant-prompt.js';
import type { Router } from './router-proxy.js';
import type { OpencodeProvider } from '../../shared/interview-config.js';

/** One private OpenCode home per candidate and exercise, so none of the interviewer's own setup comes along */
export function opencodeHomeDir(workPath: string): string {
  return join(dirname(workPath), `.agent-opencode-${basename(workPath)}`);
}

/** What the private home needs from the interviewer's own OpenCode: which provider and model it uses, the login, and the provider's definition when it is a custom one */
export interface OpencodeLogin {
  provider: string;
  model: string;
  /** The saved login entry for that provider, copied as it is */
  auth: unknown;
  /** Present when the provider is a custom one (an address of your own); built in providers need nothing here */
  providerConfig?: unknown;
}

const readJson = (path: string): any => { try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; } };

/**
 * Reads the login from the interviewer's own OpenCode setup, and nothing else from it: no plugins, MCP servers, commands or agents.
 * It follows the default model ("provider/model") the interviewer already uses. TRIO_OPENCODE_MODEL overrides the model,
 * and TRIO_OPENCODE_API_KEY with TRIO_OPENCODE_PROVIDER (default: anthropic) lets you pass a key without any OpenCode setup.
 */
export function readOpencodeLogin(): OpencodeLogin | null {
  const envKey = process.env.TRIO_OPENCODE_API_KEY;
  if (envKey) {
    const provider = process.env.TRIO_OPENCODE_PROVIDER || 'anthropic';
    return { provider, model: process.env.TRIO_OPENCODE_MODEL || `${provider}/claude-sonnet-4-5`, auth: { type: 'api', key: envKey } };
  }
  const config = readJson(join(homedir(), '.config', 'opencode', 'opencode.json'));
  const auth = readJson(join(homedir(), '.local', 'share', 'opencode', 'auth.json'));
  const chosen: string = process.env.TRIO_OPENCODE_MODEL || (typeof config?.model === 'string' ? config.model : '');
  const provider = chosen.includes('/') ? chosen.split('/')[0] : '';
  if (!provider || !auth?.[provider]) return null;
  const custom = config?.provider?.[provider];
  return { provider, model: chosen, auth: auth[provider], providerConfig: custom ? keepProviderOnly(custom) : undefined };
}

/** A custom provider is kept as a plain connection (package, name, address, models). Anything else it carries is dropped. */
function keepProviderOnly(custom: any) {
  const kept: Record<string, unknown> = {};
  for (const key of ['npm', 'name', 'models']) if (custom[key] !== undefined) kept[key] = custom[key];
  if (custom.options?.baseURL) kept.options = { baseURL: custom.options.baseURL };
  return kept;
}

/** Writes the private config (the one provider, no MCP servers or plugins) and the login. Returns false when there is no login to copy. */
export function seedOpencodeHome(home: string): boolean {
  const login = readOpencodeLogin();
  if (!login) return false;
  const config = join(home, 'config');
  const data = join(home, 'data', 'opencode');
  mkdirSync(config, { recursive: true });
  mkdirSync(data, { recursive: true });
  mkdirSync(join(home, 'tmp'), { recursive: true });
  writeFileSync(join(config, 'opencode.json'), JSON.stringify({
    $schema: 'https://opencode.ai/config.json',
    autoupdate: false,
    model: login.model,
    small_model: login.model,
    share: 'disabled',
    // Tools that reach the internet or run other agents are removed (checked: they no longer appear in the model's tool list).
    // A provider can add a search tool of its own that this cannot remove, so the rules file below is what keeps the assistant on the exercise.
    permission: { webfetch: 'deny', websearch: 'deny', experimental_image_generate: 'deny', subagent: 'deny' },
    ...(login.providerConfig ? { provider: { [login.provider]: login.providerConfig } } : {}),
  }, null, 2));
  const authPath = join(data, 'auth.json');
  writeFileSync(authPath, JSON.stringify({ [login.provider]: login.auth }), { mode: 0o600 });
  try { chmodSync(authPath, 0o600); } catch {}
  return true;
}

/** The rules go in an AGENTS.md next to the private config, which OpenCode reads as global instructions */
export function writeOpencodeRules(home: string, assistantContext: string): void {
  const config = join(home, 'config');
  mkdirSync(config, { recursive: true });
  writeFileSync(join(config, 'AGENTS.md'), `${buildTerminalSystemPrompt(assistantContext)}\n`);
}

export function opencodeEnvironment(home: string): Record<string, string> {
  return {
    XDG_CONFIG_HOME: join(home, 'xdg-config'),
    XDG_DATA_HOME: join(home, 'data'),
    XDG_STATE_HOME: join(home, 'state'),
    XDG_CACHE_HOME: join(home, 'cache'),
    OPENCODE_CONFIG_DIR: join(home, 'config'),
    OPENCODE_DISABLE_AUTOUPDATE: '1',
    OPENCODE_DISABLE_CLAUDE_CODE: '1',
    OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: '1',
    OPENCODE_DISABLE_PROJECT_CONFIG: '1',
    // its small files go here and not in the interviewer's temporary folder, which the operating system sandbox keeps closed
    TMPDIR: join(home, 'tmp'),
    TEMP: join(home, 'tmp'),
    TMP: join(home, 'tmp'),
  };
}

/** --standalone keeps it off the interviewer's background service (which runs with their own config and login) */
export function opencodeArgs(resume: boolean): string[] {
  return ['--standalone', ...(resume ? ['--continue'] : [])];
}

export function hasOpencodeHistory(home: string): boolean {
  return existsSync(join(home, 'data', 'opencode', 'opencode.db'));
}


/** The name OpenCode shows for the provider that goes through the model router */
export const OPENCODE_ROUTER_PROVIDER = 'router';

/** Which source OpenCode will use: its own login, the model router, or nothing yet */
export type OpencodeSource = { kind: 'own-login' } | { kind: 'router' } | { kind: 'none'; problem: string };

/**
 * `auto` prefers a login OpenCode already has (the interviewer's own, at no extra cost), then the model router, then a note.
 * `router` and `own-login` force one.
 */
export function chooseOpencodeSource(provider: OpencodeProvider, own: OpencodeLogin | null, router: Router | null): OpencodeSource {
  const missingOwn = 'No OpenCode login was found. Sign in to a provider in OpenCode and pick a default model.';
  if (provider === 'own-login') return own ? { kind: 'own-login' } : { kind: 'none', problem: missingOwn };
  if (provider === 'router') return router ? { kind: 'router' } : { kind: 'none', problem: 'No model router was found. It is read from the same place Claude Code reads it.' };
  if (own) return { kind: 'own-login' };
  if (router) return { kind: 'router' };
  return { kind: 'none', problem: missingOwn };
}

/**
 * The private home when OpenCode goes through the router: one provider that points at this machine's loopback forwarder with a random
 * key, and one model the router answered. The router's address and key are in no file here. The interviewer's own OpenCode model
 * is not used (it may name a model the router no longer serves).
 */
export function seedOpencodeRouterHome(home: string, proxy: { url: string; key: string }, model: string): void {
  const config = join(home, 'config');
  const data = join(home, 'data', 'opencode');
  mkdirSync(config, { recursive: true });
  mkdirSync(data, { recursive: true });
  mkdirSync(join(home, 'tmp'), { recursive: true });
  const chosen = `${OPENCODE_ROUTER_PROVIDER}/${model}`;
  writeFileSync(join(config, 'opencode.json'), JSON.stringify({
    $schema: 'https://opencode.ai/config.json',
    autoupdate: false,
    model: chosen,
    small_model: chosen,
    // only this provider is offered, so OpenCode cannot fall back to a free model of its own
    enabled_providers: [OPENCODE_ROUTER_PROVIDER],
    share: 'disabled',
    permission: { webfetch: 'deny', websearch: 'deny', experimental_image_generate: 'deny', subagent: 'deny' },
    provider: {
      [OPENCODE_ROUTER_PROVIDER]: {
        npm: '@ai-sdk/anthropic',
        name: 'Model router',
        // the Anthropic client adds /messages to this address
        options: { baseURL: `${proxy.url}/v1`, apiKey: proxy.key },
        models: { [model]: { name: model } },
      },
    },
  }, null, 2), { mode: 0o600 });
  try { chmodSync(join(config, 'opencode.json'), 0o600); } catch {}
  const authPath = join(data, 'auth.json');
  writeFileSync(authPath, '{}', { mode: 0o600 });
  try { chmodSync(authPath, 0o600); } catch {}
}
