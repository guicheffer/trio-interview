/**
 * What the interviewer allows on this machine. It lives in `interview.config.yaml` (gitignored), made by `make config`.
 * A missing file means everything is allowed, so a fresh clone and the tests behave like before.
 */

export const TOOLS = ['agent', 'claude-code', 'opencode', 'pi'] as const;
export type Tool = (typeof TOOLS)[number];

/** Where Pi gets its model from. `auto` prefers a Pi login that is already there, then the model router the interviewer's Claude Code already uses. */
export const PI_PROVIDERS = ['auto', 'router', 'own-login'] as const;
export type PiProvider = (typeof PI_PROVIDERS)[number];

export interface PiConfig {
  provider: PiProvider;
  /** A model name to use instead of the one the tool picks. Empty means the tool picks. */
  model: string;
}

/** How the candidate reaches this machine. `none` keeps everything local (a dry run, or a network the candidate is already on). */
export const TUNNELS = ['ngrok', 'cloudflared', 'none'] as const;
export type Tunnel = (typeof TUNNELS)[number];

export interface InterviewConfig {
  /** The assistants a candidate may pick from. Agent mode (the chat) is always there. */
  tools: Tool[];
  /** Exercise folders under exercises/ that `make start` offers. Empty means every folder that has a description.md. */
  exercises: string[];
  /** The tunnel `make start` opens to share the link. */
  tunnel: Tunnel;
  /** Where Pi gets its model from, and an optional model to use. */
  pi: PiConfig;
  /** Other places exercises come from (a git repository or a folder), copied into exercises/ by `make exercises`. */
  sources: string[];
}

export const DEFAULT_CONFIG: InterviewConfig = {
  tools: ['agent', 'claude-code', 'opencode', 'pi'],
  exercises: [],
  tunnel: 'ngrok',
  pi: { provider: 'auto', model: '' },
  sources: [],
};

/**
 * A source is a git URL (https or ssh) or a path to a folder. Anything else is dropped, because the value ends up
 * as an argument to `git clone`: no spaces, no leading dash, no shell characters.
 */
export function isSource(value: string): boolean {
  if (!value || value.length > 300 || value.startsWith('-')) return false;
  if (/[\s;&|`$<>"'\\]/.test(value)) return false;
  if (/^https:\/\/[A-Za-z0-9._~:/?#@!*+,%=-]+$/.test(value)) return true;
  if (/^git@[A-Za-z0-9.-]+:[A-Za-z0-9._/-]+$/.test(value)) return true;
  return /^(~|\.{1,2}|\/)[A-Za-z0-9._~/-]*$/.test(value) || /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(value);
}

function isPiProvider(value: unknown): value is PiProvider {
  return typeof value === 'string' && (PI_PROVIDERS as readonly string[]).includes(value);
}

/** A model name is letters, digits and . _ : / - only, so it can never carry anything but a name */
export function isModelName(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:/ -]{0,80}$/.test(value);
}

function isTunnel(value: unknown): value is Tunnel {
  return typeof value === 'string' && (TUNNELS as readonly string[]).includes(value);
}

function isTool(value: unknown): value is Tool {
  return typeof value === 'string' && (TOOLS as readonly string[]).includes(value);
}

function unquote(value: string): string {
  const v = value.trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) return v.slice(1, -1);
  return v;
}

/**
 * Reads the small YAML subset the config uses: `key: value`, one level of nesting, `- item` lists and `#` comments.
 * Anything it does not understand is ignored and the default stays, so a typo never stops an interview.
 */
export function parseConfig(text: string): InterviewConfig {
  const config: InterviewConfig = { tools: [...DEFAULT_CONFIG.tools], exercises: [], tunnel: DEFAULT_CONFIG.tunnel, pi: { ...DEFAULT_CONFIG.pi }, sources: [] };
  let listKey = '';
  let block = '';
  let tools: Tool[] | null = null;
  const exercises: string[] = [];
  const sources: string[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '').trimEnd();
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    const body = line.trim();

    if (body.startsWith('- ')) {
      const item = unquote(body.slice(2));
      if (listKey === 'tools' && isTool(item)) (tools ??= []).push(item);
      else if (listKey === 'exercises' && /^[A-Za-z0-9_.-]+$/.test(item)) exercises.push(item);
      else if (listKey === 'sources' && isSource(item)) sources.push(item);
      continue;
    }

    const colon = body.indexOf(':');
    if (colon === -1) continue;
    const key = body.slice(0, colon).trim();
    const value = body.slice(colon + 1).trim();
    if (indent === 0) { listKey = ''; block = ''; }

    if (indent === 0 && key === 'pi' && value === '') { block = 'pi'; continue; }
    if (indent > 0 && block === 'pi') {
      const v = unquote(value);
      if (key === 'provider' && isPiProvider(v.toLowerCase())) config.pi.provider = v.toLowerCase() as PiProvider;
      else if (key === 'model' && (v === '' || isModelName(v))) config.pi.model = v;
      continue;
    }

    if (indent === 0 && key === 'tunnel') {
      const chosen = unquote(value).toLowerCase();
      if (isTunnel(chosen)) config.tunnel = chosen;
      continue;
    }

    if (indent === 0 && value === '') {
      if (key === 'tools' || key === 'exercises' || key === 'sources') { listKey = key; if (key === 'tools') tools = tools ?? []; }
      continue;
    }
  }

  if (tools) config.tools = tools.length ? tools : ['agent'];
  // The chat is always available, so a candidate is never left without an assistant
  if (!config.tools.includes('agent')) config.tools = ['agent', ...config.tools];
  config.exercises = exercises;
  config.sources = sources;
  return config;
}

/** The file `make config` writes, with the choices commented so the interviewer can edit it by hand */
export function renderConfig(config: InterviewConfig): string {
  const list = (items: string[]) => items.map(i => `  - ${i}`).join('\n');
  return `# Local interview settings. Made by \`make config\`, ignored by git. Delete it to allow everything.

# Which assistants a candidate may pick from: agent (the chat), claude-code, opencode, pi
tools:
${list(config.tools)}

# Exercise folders to offer. Leave empty to offer every folder in exercises/ that has a description.md
exercises:${config.exercises.length ? '\n' + list(config.exercises) : ''}

# Other places exercises come from, a git URL or a folder. \`make exercises\` copies them into exercises/
sources:${config.sources.length ? '\n' + list(config.sources) : ''}

# Where Pi gets its model: auto (a Pi login if there is one, else your model router, else a note to sign in), router, or own-login. model is optional.
pi:
  provider: ${config.pi.provider}${config.pi.model ? `\n  model: ${config.pi.model}` : ''}

# How the candidate reaches this machine: ngrok (checked), cloudflared (see SECURITY.md before relying on it) or none
tunnel: ${config.tunnel}
`;
}

export function toolAllowed(config: InterviewConfig, tool: Tool): boolean {
  return config.tools.includes(tool);
}
