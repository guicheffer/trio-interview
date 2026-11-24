// `make new-exercise` and `make exercises`.
//   new:  creates exercises/<id>/ with a config that already runs, even before there is any code in it.
//   sync: copies the exercises of every source in interview.config.yaml (a git repository or a folder) into exercises/.
import { spawnSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { createInterface } from 'readline/promises';
import { DEFAULT_CONFIG, parseConfig } from '../shared/interview-config.js';
import { idFromTitle, isExerciseId, newExerciseFiles, type Kind } from '../shared/exercise-files.js';

const root = process.cwd();
const exercisesDir = join(root, 'exercises');
const c = (n: number, s: string) => `\x1b[${n}m${s}\x1b[0m`;
const ok = (s: string) => console.log(`  ${c(32, 'ok')}    ${s}`);
const warn = (s: string) => console.log(`  ${c(33, 'warn')}  ${s}`);
const note = (s: string) => console.log(`        ${c(2, s)}`);

const configFile = join(root, 'interview.config.yaml');
const config = existsSync(configFile) ? parseConfig(readFileSync(configFile, 'utf-8')) : DEFAULT_CONFIG;
const flag = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : undefined; };
const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

const hasBrief = (dir: string) => existsSync(join(dir, 'description.md'));
const folderNoise = (src: string) => !src.split('/').some(p => p === 'node_modules' || p === '.git');

/** Exercise folders directly inside `dir`, or `dir` itself when it is one exercise */
function exercisesAt(dir: string): { id: string; path: string }[] {
  if (!existsSync(dir)) return [];
  const own = readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_') && hasBrief(join(dir, e.name)))
    .map(e => ({ id: e.name, path: join(dir, e.name) }));
  if (own.length) return own;
  return hasBrief(dir) ? [{ id: dir.split('/').filter(Boolean).pop() ?? 'exercise', path: dir }] : [];
}

function resolveLocal(source: string): string {
  const expanded = source.startsWith('~') ? join(homedir(), source.slice(1)) : source;
  return resolve(root, expanded);
}

const isGit = (source: string) => /^(https:\/\/|git@)/.test(source);

/** Brings one source into a folder we can read from. Returns the folder, and a cleanup for a temporary clone. */
function open(source: string): { dir: string; done: () => void } | null {
  if (!isGit(source)) {
    const dir = resolveLocal(source);
    if (!existsSync(dir)) { warn(`${source}: folder not found`); return null; }
    return { dir, done: () => undefined };
  }
  const tmp = mkdtempSync(join(tmpdir(), 'trio-source-'));
  // `--` ends the options, so a value can never be read as one, and the protocols are limited to https and ssh
  const run = spawnSync('git', ['clone', '--depth', '1', '--quiet', '--', source, tmp], {
    encoding: 'utf-8', timeout: 120000, env: { ...process.env, GIT_ALLOW_PROTOCOL: 'https:ssh', GIT_TERMINAL_PROMPT: '0' },
  });
  if (run.status !== 0) { warn(`${source}: could not clone it (${(run.stderr || '').trim().split('\n').pop() || 'no answer'})`); rmSync(tmp, { recursive: true, force: true }); return null; }
  return { dir: tmp, done: () => rmSync(tmp, { recursive: true, force: true }) };
}

async function sync(): Promise<number> {
  if (!config.sources.length) {
    console.log('\nNo exercise sources yet. Add a git repository or a folder to interview.config.yaml:\n');
    console.log(c(2, '  sources:\n    - https://github.com/your-company/interview-exercises.git\n    - ../my-exercises\n'));
    return 0;
  }
  console.log('\nBringing in exercises\n');
  mkdirSync(exercisesDir, { recursive: true });
  let added = 0, kept = 0;
  for (const source of config.sources) {
    const opened = open(source);
    if (!opened) continue;
    try {
      const found = exercisesAt(opened.dir);
      if (!found.length) { warn(`${source}: no exercise inside (a folder with a description.md)`); continue; }
      for (const ex of found) {
        if (!isExerciseId(ex.id)) { warn(`${ex.id}: skipped, an exercise folder is lowercase letters, digits and dashes`); continue; }
        const dest = join(exercisesDir, ex.id);
        if (existsSync(dest)) { kept++; note(`${ex.id}: already in exercises/, left as it is (delete the folder to bring it again)`); continue; }
        cpSync(ex.path, dest, { recursive: true, filter: folderNoise });
        added++; ok(`${ex.id}: added from ${source}`);
      }
    } finally { opened.done(); }
  }
  console.log(`\n  ${added} added, ${kept} left as they were\n`);
  return 0;
}

async function create(): Promise<number> {
  let title = flag('title'), id = flag('id'), kind = (flag('kind') as Kind | undefined), minutes = Number(flag('minutes')) || 0;
  const fromExample = flag('from');

  if (fromExample) return copyExample(fromExample, id);

  // The id can come from the title, so only the title and the kind have to be asked
  if (!title || !kind) {
    if (!interactive) { console.error('make new-exercise asks questions, so it needs a terminal. Or pass --title "Word count" --kind script|web (and optionally --id, --minutes).'); return 1; }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ask = async (q: string, fallback = '') => (await rl.question(`  ${q}${fallback ? c(2, ` [${fallback}]`) : ''} `)).trim() || fallback;
    console.log(`\n${c(1, 'New exercise')}\n${c(2, 'It runs as soon as it is made, even with no code in it. Fill in the files after.')}\n`);
    const examples = exercisesAt(join(root, 'examples')).map(e => e.id);
    if (examples.length) {
      console.log(`  Start from an example? ${c(2, examples.join(', '))}`);
      const pick = await ask('Name one, or press Enter for an empty exercise', '');
      if (pick && examples.includes(pick)) { rl.close(); return copyExample(pick, undefined); }
    }
    title ||= await ask('Title');
    id ||= await ask('Folder name', idFromTitle(title));
    kind ||= (await ask('One file, or a web app? (script/web)', 'script')).toLowerCase().startsWith('w') ? 'web' : 'script';
    minutes ||= Number(await ask('Minutes', kind === 'web' ? '45' : '20')) || 20;
    rl.close();
  }
  kind = kind === 'web' ? 'web' : 'script';
  id = id || idFromTitle(title ?? '');
  if (!title) { console.error('A title is needed.'); return 1; }
  if (!isExerciseId(id)) { console.error(`"${id}" is not a folder name this tool can use: lowercase letters, digits and dashes, up to 40.`); return 1; }
  const dest = join(exercisesDir, id);
  if (existsSync(dest)) { console.error(`exercises/${id} already exists. Pick another name or remove the folder.`); return 1; }

  const files = newExerciseFiles({ id, title, kind, minutes: minutes || (kind === 'web' ? 45 : 20) });
  for (const [rel, text] of Object.entries(files)) {
    const path = join(dest, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }
  console.log('');
  ok(`Created exercises/${id}/`);
  for (const rel of Object.keys(files)) note(rel);
  console.log(`\n  Next: edit ${c(1, `exercises/${id}/description.md`)}, then ${c(1, 'make start')} and pick it.\n  An agent can fill it in for you: ask it to run the create-exercise skill.\n`);
  return 0;
}

function copyExample(name: string, asId: string | undefined): number {
  const examples = exercisesAt(join(root, 'examples'));
  const ex = examples.find(e => e.id === name);
  if (!ex) { console.error(`No example called "${name}". There are: ${examples.map(e => e.id).join(', ') || 'none'}.`); return 1; }
  const id = asId || name;
  if (!isExerciseId(id)) { console.error(`"${id}" is not a folder name this tool can use.`); return 1; }
  const dest = join(exercisesDir, id);
  if (existsSync(dest)) { console.error(`exercises/${id} already exists.`); return 1; }
  mkdirSync(exercisesDir, { recursive: true });
  cpSync(ex.path, dest, { recursive: true, filter: folderNoise });
  console.log('');
  ok(`Copied the example ${name} to exercises/${id}/ (the example stays where it is)`);
  console.log(`\n  Change it as you like, then ${c(1, 'make start')} and pick it.\n`);
  return 0;
}

const mode = process.argv[2];
(mode === 'sync' ? sync() : mode === 'new' ? create() : Promise.resolve(2)).then(code => process.exit(code), err => { console.error(err); process.exit(1); });
