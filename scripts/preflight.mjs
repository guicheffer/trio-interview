#!/usr/bin/env node
// Runs before the platform starts. Installs missing dependencies and refuses to start
// unless the Claude Code CLI is installed.
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { BIN } from './lib/binaries.mjs';

if (process.env.TRIO_PREFLIGHT_DONE === '1') process.exit(0);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

function fail(title, lines) {
  console.error(`\n${red('Cannot start:')} ${title}\n`);
  for (const line of lines) console.error(`  ${line}`);
  console.error(`\n  ${dim('Set TRIO_SKIP_PREFLIGHT=1 to skip these checks (not recommended).')}\n`);
  process.exit(1);
}

if (process.env.TRIO_SKIP_PREFLIGHT === '1') {
  console.log(dim('Preflight skipped (TRIO_SKIP_PREFLIGHT=1)'));
  process.exit(0);
}

console.log('Checking your setup...');

// 1. Node version
const node = spawnSync(process.execPath, [join(root, 'scripts', 'check-node-version.js')], { stdio: 'inherit' });
if (node.status !== 0) process.exit(node.status ?? 1);
console.log(`  ${green('ok')}  Node ${process.version}`);

// 2. Dependencies: install when node_modules is missing or package-lock.json changed since the last install
const lockFile = join(root, 'package-lock.json');
const marker = join(root, 'node_modules', '.trio-lock-hash');
const lockHash = existsSync(lockFile) ? createHash('sha256').update(readFileSync(lockFile)).digest('hex') : 'none';
const installed = existsSync(marker) ? readFileSync(marker, 'utf-8').trim() : '';
const hasBins = ['tsx', 'next'].every((bin) => existsSync(join(root, 'node_modules', '.bin', bin)));

if (installed !== lockHash || !hasBins) {
  console.log(`  ${dim('..')}  Installing dependencies (first run or package-lock.json changed)`);
  const install = spawnSync(BIN.npm, ['install', '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit' });
  if (install.status !== 0) fail('npm install failed', ['Fix the error above and run make start again.']);
  writeFileSync(marker, lockHash);
}
console.log(`  ${green('ok')}  Dependencies installed`);

// 3. Claude Code CLI: the chat and the AI assistant are the Claude Code CLI running on this machine
const claude = spawnSync(BIN.claude, ['--version'], { encoding: 'utf-8' });
if (claude.error || claude.status !== 0) {
  fail('the Claude Code CLI was not found', [
    'This platform only works with the Claude Code CLI: the AI assistant is that CLI running on your machine.',
    'Install it, then run make start again:',
    '',
    '    npm install -g @anthropic-ai/claude-code',
    '',
    'and check that `claude --version` works in this terminal.',
  ]);
}
console.log(`  ${green('ok')}  Claude Code CLI ${claude.stdout.trim()}`);

// The login is not checked here: it can be an account (claude login) or a key, and only the program knows. The server
// asks it for a short answer when it starts and tells the interviewer if that fails.
console.log('');
