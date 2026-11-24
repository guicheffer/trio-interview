#!/usr/bin/env node

import { resolve } from 'path';
import { spawn } from 'child_process';
import { mkdirSync, createWriteStream } from 'fs';
import { BIN } from '../server/lib/binaries.js';

// Get exercise from env (must be set)
const EXERCISE_PATH = process.env.EXERCISE_PATH || resolve(process.cwd(), 'exercises', 'fibonacci');
const EXERCISE_ID = process.env.EXERCISE_ID || 'fibonacci';

console.log('Trio, live coding interviews');
console.log('=====================================\n');
console.log(`Exercise: ${EXERCISE_ID}`);
console.log(`Path: ${EXERCISE_PATH}\n`);

// Ensure .logs directory exists
const logsDir = resolve(process.cwd(), '.logs');
mkdirSync(logsDir, { recursive: true });

// Set environment variables
process.env.EXERCISE_PATH = EXERCISE_PATH;
process.env.EXERCISE_ID = EXERCISE_ID;

// Create log streams
const backendLog = createWriteStream(resolve(logsDir, 'backend.log'), { flags: 'w' });
const frontendLog = createWriteStream(resolve(logsDir, 'frontend.log'), { flags: 'w' });

// Start backend server
console.log('Starting backend server...');
console.log(`  Logs: .logs/backend.log`);
const backend = spawn(BIN.tsx, ['server/index.ts'], {
  stdio: ['inherit', 'pipe', 'pipe'],
  env: process.env,
});

// Pipe backend output to both console and log file
backend.stdout?.on('data', (data) => {
  process.stdout.write(data);
  backendLog.write(data);
});
backend.stderr?.on('data', (data) => {
  process.stderr.write(data);
  backendLog.write(data);
});

// Start Next.js dev server
console.log('Starting frontend...');
console.log(`  Logs: .logs/frontend.log\n`);
const frontend = spawn(BIN.next, ['dev', '-H', '127.0.0.1'], {
  stdio: ['inherit', 'pipe', 'pipe'],
  env: process.env,
});

// Pipe frontend output to both console and log file
frontend.stdout?.on('data', (data) => {
  process.stdout.write(data);
  frontendLog.write(data);
});
frontend.stderr?.on('data', (data) => {
  process.stderr.write(data);
  frontendLog.write(data);
});

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('\n\nShutting down...');
  backendLog.end();
  frontendLog.end();
  backend.kill();
  frontend.kill();
  process.exit(0);
});

backend.on('exit', (code) => {
  console.log(`Backend exited with code ${code}`);
  backendLog.end();
  frontend.kill();
  frontendLog.end();
  process.exit(code || 0);
});

frontend.on('exit', (code) => {
  console.log(`Frontend exited with code ${code}`);
  frontendLog.end();
  backend.kill();
  backendLog.end();
  process.exit(code || 0);
});
