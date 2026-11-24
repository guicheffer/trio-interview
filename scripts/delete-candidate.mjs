#!/usr/bin/env node
// `make delete`: removes a candidate's folder (and their exercise) from .solutions, after asking twice.
// Non interactive: make delete CANDIDATE=name YES=1
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { createInterface } from 'readline/promises';

const root = resolve(process.cwd(), '.solutions');
const c = (n, s) => `\x1b[${n}m${s}\x1b[0m`;
const SAFE = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}$/;

function candidates() {
  if (!existsSync(root)) return [];
  return readdirSync(root).filter(n => {
    try { return statSync(join(root, n)).isDirectory() && existsSync(join(root, n, 'state.json')); } catch { return false; }
  }).map(name => {
    let exercise = '';
    try { exercise = JSON.parse(readFileSync(join(root, name, 'state.json'), 'utf-8')).currentExercise || ''; } catch {}
    return { name, exercise, modified: statSync(join(root, name, 'state.json')).mtimeMs };
  }).sort((a, b) => b.modified - a.modified);
}

// One reader for the whole run, so answers typed ahead (or piped in) are not lost between questions
const lines = createInterface({ input: process.stdin })[Symbol.asyncIterator]();
async function ask(question) {
  process.stdout.write(question);
  const next = await lines.next();
  return (next.value ?? '').trim();
}

/** The running platform knows who is active or connected; when it is up, it does the deleting */
async function viaServer(name) {
  try {
    const res = await fetch(`http://localhost:3001/api/interviewer/candidates/${encodeURIComponent(name)}`, { method: 'DELETE' });
    if (res.status === 409) return { ok: false, reason: 'That candidate is connected or is the active session. Stop the interview first (make stop).' };
    return { ok: res.ok, reason: res.ok ? '' : `The platform answered ${res.status}` };
  } catch { return null; }
}

const list = candidates();
if (list.length === 0) { console.log('\nNo candidates in .solutions.\n'); process.exit(0); }

let name = process.env.CANDIDATE || '';
if (!name) {
  console.log(`\n${c(1, 'Candidates')}\n`);
  list.forEach((cand, i) => console.log(`  ${String(i + 1).padStart(2)}. ${cand.name} ${c(2, cand.exercise)}`));
  const answer = await ask('\nNumber or name of the candidate to delete (Enter to cancel): ');
  if (!answer) { console.log('Nothing deleted.\n'); process.exit(0); }
  name = list[Number(answer) - 1]?.name ?? answer;
}
if (!SAFE.test(name) || !list.some(cand => cand.name === name)) { console.log(c(31, `\nNo candidate called "${name}".\n`)); process.exit(1); }

if (!process.env.YES) {
  console.log(c(33, `\nThis deletes ${name} and their exercise folder. It cannot be undone.`));
  if (!/^y(es)?$/i.test(await ask('Delete? [y/N] '))) { console.log('Nothing deleted.\n'); process.exit(0); }
  if ((await ask(`Type the name (${name}) to confirm: `)) !== name) { console.log('Name did not match. Nothing deleted.\n'); process.exit(0); }
}

const viaApi = await viaServer(name);
if (viaApi && !viaApi.ok) { console.log(c(31, `\n${viaApi.reason}\n`)); process.exit(1); }
if (!viaApi) rmSync(join(root, name), { recursive: true, force: true });
console.log(c(32, `\nDeleted ${name}.\n`));
process.exit(0);
