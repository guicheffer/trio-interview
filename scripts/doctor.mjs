#!/usr/bin/env node
// `make install`: checks what the platform needs and says how to fix what is missing.
import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { homedir, platform } from 'os';
import { join } from 'path';
import { createInterface } from 'readline/promises';
import { BIN } from './lib/binaries.mjs';

const c = (n, s) => `\x1b[${n}m${s}\x1b[0m`;
const ok = (s) => console.log(`  ${c(32, 'ok')}    ${s}`);
const warn = (s) => console.log(`  ${c(33, 'warn')}  ${s}`);
const bad = (s) => console.log(`  ${c(31, 'fix')}   ${s}`);
const note = (s) => console.log(`        ${c(2, s)}`);
const has = (cmd) => spawnSync(BIN.which, [cmd], { encoding: 'utf-8' }).status === 0;
let failed = false;
const interactive = process.stdin.isTTY && process.stdout.isTTY;

async function ask(question) {
  if (!interactive) return '';
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return (await rl.question(`        ${question} `)).trim(); } catch { return ''; } finally { rl.close(); }
}
const yes = async (question) => !/^n/i.test(await ask(`${question} [Y/n]`));
const run = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit' }).status === 0;

console.log('\nChecking your setup\n');

const major = Number(process.versions.node.split('.')[0]);
if (major >= 22) ok(`Node ${process.version}`);
else { bad(`Node ${process.version}. Use Node 25: nvm use`); failed = true; }

let claude = spawnSync(BIN.claude, ['--version'], { encoding: 'utf-8' });
if (claude.status !== 0 && interactive) {
  bad('Claude Code CLI not found. The platform runs the assistant through it.');
  if (await yes('Install it now (npm install -g @anthropic-ai/claude-code)?')) {
    run('npm', ['install', '-g', '@anthropic-ai/claude-code']);
    claude = spawnSync(BIN.claude, ['--version'], { encoding: 'utf-8' });
  }
}
if (claude.status === 0) ok(`Claude Code CLI ${claude.stdout.trim()}`);
else {
  bad('Claude Code CLI not found. The platform runs the assistant through it.');
  note('Install:  npm install -g @anthropic-ai/claude-code');
  note('Then sign in once by running: claude');
  failed = true;
}
if (claude.status === 0) {
  warn('Every message a candidate sends is paid for by the account Claude Code is signed in to. Check you have enough left.');
}

// OpenCode is optional. Version 2 is needed: it has --standalone, which keeps it off your own background service.
const openCode = spawnSync(BIN.opencode, ['--version'], { encoding: 'utf-8' });
if (openCode.status === 0) {
  const version = openCode.stdout.trim().split('\n')[0];
  if (Number(/(\d+)\.\d+/.exec(version)?.[1] ?? 0) >= 2) ok(`OpenCode ${version}`);
  else { warn(`OpenCode ${version} found, but version 2 is needed. Candidates will not be offered it.`); note('Install:  brew install anomalyco/tap/opencode-v2'); }
} else {
  note('OpenCode is not installed (optional). To let candidates pick it: brew install anomalyco/tap/opencode-v2');
}

const ngrokConfigs = [
  join(homedir(), 'Library', 'Application Support', 'ngrok', 'ngrok.yml'),
  join(homedir(), '.config', 'ngrok', 'ngrok.yml'),
  join(homedir(), '.ngrok2', 'ngrok.yml'),
];
let hasNgrok = has('ngrok');
const isAuthed = () => ngrokConfigs.some((f) => existsSync(f) && /authtoken:\s*\S+/.test(readFileSync(f, 'utf-8')));
let ngrokAuthed = isAuthed();
if (!hasNgrok && interactive && platform() === 'darwin' && has('brew')) {
  warn('ngrok is not installed. It is the tunnel remote candidates use.');
  if (await yes('Install it now (brew install ngrok)?')) {
    run('brew', ['install', 'ngrok']);
    hasNgrok = has('ngrok');
  }
}
if (hasNgrok && !ngrokAuthed && interactive) {
  warn('ngrok needs a free account and an authtoken (sign up with GitHub or Google).');
  note('1. Sign up:  https://dashboard.ngrok.com/signup');
  note('2. Copy your token:  https://dashboard.ngrok.com/get-started/your-authtoken');
  const token = await ask('Paste the token here (Enter to skip):');
  if (token) {
    if (/^[\w-]{20,}$/.test(token)) run('ngrok', ['config', 'add-authtoken', token]);
    else bad('That does not look like an ngrok authtoken, skipped.');
    ngrokAuthed = isAuthed();
  }
}
if (hasNgrok && ngrokAuthed) ok('ngrok found and logged in (tunnel for remote candidates)');
else if (hasNgrok) {
  warn('ngrok is installed but not logged in. ngrok needs a free account and an authtoken.');
  note('1. Sign up:  https://dashboard.ngrok.com/signup');
  note('2. Copy your token:  https://dashboard.ngrok.com/get-started/your-authtoken');
  note('3. Run:  ngrok config add-authtoken <your-token>');
  note('On the free plan candidates see an ngrok "Visit Site" page once.');
} else {
  warn('No tunnel installed, only you (localhost) can open the platform. For remote candidates install ngrok:');
  note(platform() === 'darwin' ? 'ngrok (free account + authtoken):  brew install ngrok' : 'ngrok (free account + authtoken): https://ngrok.com/download');
}

console.log('');
if (failed) { console.log(c(31, 'Fix the items above, then run make install again.\n')); process.exit(1); }
console.log(c(32, 'Ready. Run make start, then select an exercise.\n'));
