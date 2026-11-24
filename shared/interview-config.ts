/**
 * What the interviewer allows on this machine. It lives in `interview.config.yaml` (gitignored), made by `make config`.
 * A missing file means everything is allowed, so a fresh clone and the tests behave like before.
 */

export const TOOLS = ['agent', 'claude-code', 'opencode'] as const;
export type Tool = (typeof TOOLS)[number];

export interface InterviewConfig {
  /** The assistants a candidate may pick from. Agent mode (the chat) is always there. */
  tools: Tool[];
  /** Exercise folders under exercises/ that `make start` offers. Empty means every folder that has a description.md. */
  exercises: string[];
}

export const DEFAULT_CONFIG: InterviewConfig = {
  tools: ['agent', 'claude-code', 'opencode'],
  exercises: [],
};

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
  const config: InterviewConfig = { tools: [...DEFAULT_CONFIG.tools], exercises: [] };
  let listKey = '';
  let tools: Tool[] | null = null;
  const exercises: string[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '').trimEnd();
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    const body = line.trim();

    if (body.startsWith('- ')) {
      const item = unquote(body.slice(2));
      if (listKey === 'tools' && isTool(item)) (tools ??= []).push(item);
      else if (listKey === 'exercises' && /^[A-Za-z0-9_.-]+$/.test(item)) exercises.push(item);
      continue;
    }

    const colon = body.indexOf(':');
    if (colon === -1) continue;
    const key = body.slice(0, colon).trim();
    const value = body.slice(colon + 1).trim();
    if (indent === 0) listKey = '';

    if (indent === 0 && value === '') {
      if (key === 'tools' || key === 'exercises') { listKey = key; if (key === 'tools') tools = tools ?? []; }
      continue;
    }
  }

  if (tools) config.tools = tools.length ? tools : ['agent'];
  // The chat is always available, so a candidate is never left without an assistant
  if (!config.tools.includes('agent')) config.tools = ['agent', ...config.tools];
  config.exercises = exercises;
  return config;
}

/** The file `make config` writes, with the choices commented so the interviewer can edit it by hand */
export function renderConfig(config: InterviewConfig): string {
  const list = (items: string[]) => items.map(i => `  - ${i}`).join('\n');
  return `# Local interview settings. Made by \`make config\`, ignored by git. Delete it to allow everything.

# Which assistants a candidate may pick from: agent (the chat), claude-code, opencode
tools:
${list(config.tools)}

# Exercise folders to offer. Leave empty to offer every folder in exercises/ that has a description.md
exercises:${config.exercises.length ? '\n' + list(config.exercises) : ''}
`;
}

export function toolAllowed(config: InterviewConfig, tool: Tool): boolean {
  return config.tools.includes(tool);
}
