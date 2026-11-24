// `make config`: checks what is installed, asks what this machine allows and writes interview.config.yaml (ignored by git).
// Run it again any time to change the settings, or edit the file by hand. `--check` only reports and never asks.
import { spawnSync } from 'child_process';
import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { createInterface } from 'readline/promises';
import { DEFAULT_CONFIG, TOOLS, TUNNELS, parseConfig, renderConfig, type InterviewConfig, type Tool, type Tunnel } from '../shared/interview-config.js';
import { tunnelStatus } from '../shared/tunnel.js';

const root = process.cwd();
const file = join(root, 'interview.config.yaml');
const c = (n: number, s: string) => `\x1b[${n}m${s}\x1b[0m`;
const ok = (s: string) => console.log(`  ${c(32, 'ok')}    ${s}`);
const warn = (s: string) => console.log(`  ${c(33, 'warn')}  ${s}`);
const note = (s: string) => console.log(`        ${c(2, s)}`);
const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

type TerminalTool = Exclude<Tool, 'agent'>;
const TOOL_BINARIES: Record<TerminalTool, string> = { 'claude-code': process.env.TRIO_CLAUDE_BIN || 'claude', opencode: process.env.TRIO_OPENCODE_BIN || 'opencode' };
const TOOL_NAMES: Record<Tool, string> = { agent: 'Agent mode (the chat)', 'claude-code': 'Claude Code', opencode: 'OpenCode' };
const INSTALL_HINT: Record<TerminalTool, string> = {
  'claude-code': 'npm install -g @anthropic-ai/claude-code',
  opencode: 'brew install anomalyco/tap/opencode-v2   (OpenCode 2 is needed; see opencode.ai)',
};

/** The program's version line, or null when it is not installed or does not answer */
function versionOf(bin: string): string | null {
  const run = spawnSync(bin, ['--version'], { encoding: 'utf-8', timeout: 15000 });
  return run.status === 0 ? (run.stdout.trim().split('\n')[0] || 'installed') : null;
}

function exercisesIn(dir: string): string[] {
  const path = join(root, dir);
  if (!existsSync(path)) return [];
  return readdirSync(path).filter(name => !name.startsWith('_') && existsSync(join(path, name, 'description.md'))).sort();
}

const NGROK_CONFIGS = [
  join(homedir(), 'Library', 'Application Support', 'ngrok', 'ngrok.yml'),
  join(homedir(), '.config', 'ngrok', 'ngrok.yml'),
  join(homedir(), '.ngrok2', 'ngrok.yml'),
];


const ngrokSignedIn = () => NGROK_CONFIGS.some(f => existsSync(f) && /authtoken:\s*\S+/.test(readFileSync(f, 'utf-8')));

const current: InterviewConfig = existsSync(file) ? parseConfig(readFileSync(file, 'utf-8')) : DEFAULT_CONFIG;

/** Looks at the machine and says what is ready. Returns false when something that is allowed is not usable. */
function report(config: InterviewConfig): boolean {
  let ready = true;
  console.log('\nWhat this machine can do\n');
  ok(`${TOOL_NAMES.agent}: always available (needs the Claude Code program)`);
  for (const tool of TOOLS) {
    if (tool === 'agent') continue;
    const version = versionOf(TOOL_BINARIES[tool]);
    const allowed = config.tools.includes(tool);
    if (!allowed) note(`${TOOL_NAMES[tool]}: off${version ? ` (installed: ${version})` : ''}`);
    else if (version) ok(`${TOOL_NAMES[tool]}: allowed and installed (${version})`);
    else { warn(`${TOOL_NAMES[tool]}: allowed, but the ${TOOL_BINARIES[tool]} command was not found`); note(`install: ${INSTALL_HINT[tool]}`); ready = false; }
  }
  const folders = exercisesIn('exercises');
  const offered = config.exercises.length ? config.exercises : folders;
  const missing = offered.filter(id => !folders.includes(id));
  if (missing.length) { warn(`Exercises not found in exercises/: ${missing.join(', ')}`); ready = false; }
  else ok(`Exercises offered: ${offered.join(', ') || 'none'}`);
  const tunnel = tunnelStatus(config.tunnel, program => spawnSync('which', [program], { encoding: 'utf-8' }).status === 0, ngrokSignedIn);
  if (tunnel.ready) ok(`Tunnel (${config.tunnel}): ${tunnel.message}`);
  else { warn(`Tunnel (${config.tunnel}): ${tunnel.message}`); if (tunnel.fix) note(tunnel.fix); ready = false; }
  console.log('');
  return ready;
}

async function main() {
  if (process.argv.includes('--check')) {
    const ready = report(current);
    if (!existsSync(file)) note('No interview.config.yaml yet, so everything is allowed. Run make config to choose.');
    process.exit(ready ? 0 : 1);
  }

  if (!interactive) {
    console.log('make config asks questions, so it needs a terminal. Edit interview.config.yaml by hand, or run it from a terminal.');
    process.exit(1);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q: string, fallback: string) => (await rl.question(`  ${q} ${c(2, `[${fallback}]`)} `)).trim() || fallback;
  const yes = async (q: string, fallback: boolean) => /^y/i.test(await ask(`${q} (y/n)`, fallback ? 'y' : 'n'));

  console.log(`\n${c(1, 'Interview settings')}\n${c(2, 'Press Enter to keep the value in brackets. Nothing leaves this machine.')}\n`);

  // 1. What is installed first, so the questions below are about things that can work
  console.log(c(1, 'Checking what is installed'));
  const found = {} as Record<TerminalTool, string | null>;
  for (const tool of ['claude-code', 'opencode'] as const) {
    found[tool] = versionOf(TOOL_BINARIES[tool]);
    if (found[tool]) ok(`${TOOL_NAMES[tool]} ${found[tool]}`);
    else { warn(`${TOOL_NAMES[tool]} was not found`); note(`install: ${INSTALL_HINT[tool]}`); }
  }
  if (!found['claude-code']) warn('Without Claude Code the chat (Agent mode) cannot work either, because it runs on it.');

  console.log(`\n${c(1, 'Assistants a candidate can choose from')}`);
  const tools: Tool[] = ['agent'];
  for (const tool of ['claude-code', 'opencode'] as const) {
    // Not installed: the default is off, so a candidate is never offered something that cannot start
    const allow = await yes(`Allow ${TOOL_NAMES[tool]}?${found[tool] ? '' : c(33, ' (not installed here)')}`, found[tool] ? current.tools.includes(tool) : false);
    if (allow) tools.push(tool);
  }

  // 2. Exercises: the ones in exercises/, plus the examples that can be brought in
  console.log(`\n${c(1, 'Exercises')}`);
  const examples = exercisesIn('examples').filter(id => !existsSync(join(root, 'exercises', id)));
  for (const id of examples) {
    if (await yes(`Add the example "${id}" to your exercises? (it is copied, the example stays)`, true)) {
      cpSync(join(root, 'examples', id), join(root, 'exercises', id), { recursive: true, filter: src => !src.split('/').includes('node_modules') });
      ok(`Added exercises/${id}`);
    }
  }
  const folders = exercisesIn('exercises');
  console.log(`  Found: ${folders.join(', ') || 'none'}`);
  const answer = await ask('Offer which? (comma separated, or "all")', current.exercises.length ? current.exercises.join(',') : 'all');
  const exercises = answer.toLowerCase() === 'all' ? [] : answer.split(',').map(s => s.trim()).filter(id => folders.includes(id));

  // 3. How the candidate reaches this machine. Each answer says what it needs from you, and it is checked right away.
  console.log(`\n${c(1, 'Sharing the link')}`);
  console.log('  ngrok         needs a free account and a token (once). The address stays the same between interviews. Works with every assistant.');
  console.log('  cloudflared   needs no account. A new address each time. The chat (Agent mode) does not get its live answers through it.');
  console.log('  none          no tunnel. Only this machine, or people on your network, can open the link.');
  const tunnelAnswer = (await ask(`Which tunnel? (${TUNNELS.join(', ')})`, current.tunnel)).toLowerCase();
  const tunnel = (TUNNELS as readonly string[]).includes(tunnelAnswer) ? (tunnelAnswer as Tunnel) : current.tunnel;
  if (tunnel !== tunnelAnswer) warn(`"${tunnelAnswer}" is not one of ${TUNNELS.join(', ')}, so ${tunnel} stays.`);
  const status = tunnelStatus(tunnel, program => spawnSync('which', [program], { encoding: 'utf-8' }).status === 0, ngrokSignedIn);
  if (!status.ready) { warn(status.message); if (status.fix) note(status.fix); }
  rl.close();

  const config: InterviewConfig = { tools, exercises, tunnel };
  writeFileSync(file, renderConfig(config));
  console.log(`\n  Saved ${c(1, 'interview.config.yaml')} ${c(2, '(ignored by git, edit it any time)')}`);
  const ready = report(config);
  process.exit(ready ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
