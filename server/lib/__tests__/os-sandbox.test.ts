import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { sandboxed } from '../agent-pty.js';
import { sandboxAvailable, sandboxProfile, wrapCommand } from '../os-sandbox.js';

// The profile is run by the real operating system sandbox here, with ordinary programs, so what is checked is what the system does and
// not what the text looks like. It needs macOS, where the sandbox exists; elsewhere these tests have nothing to run against.
const run = sandboxAvailable() ? describe : describe.skip;

let root = '';
let home = '';
let work = '';
let config = '';
let profilePath = '';

beforeEach(() => {
  // under the home, like a real install: the temporary folders are closed on their own, which would hide a rule in the wrong order
  root = realpathSync(mkdtempSync(join(homedir(), '.trio-sbx-')));
  home = join(root, 'home');
  work = join(root, '.solutions', 'maya', 'fibonacci');
  config = join(root, '.solutions', 'maya', '.agent-opencode-fibonacci');
  for (const dir of [home, join(home, '.ssh'), work, config, join(root, '.solutions', 'maya', '.hidden', 'fibonacci'), join(root, '.solutions', 'omar', 'fibonacci')]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(work, 'mine.txt'), 'MINE');
  writeFileSync(join(home, '.ssh', 'id'), 'KEY');
  writeFileSync(join(root, 'interview.config.yaml'), 'CONFIG');
  writeFileSync(join(root, '.solutions', 'omar', 'fibonacci', 'main.js'), 'OTHER');
  writeFileSync(join(root, '.solutions', 'maya', '.hidden', 'fibonacci', 'p.md'), 'HIDDEN');
  profilePath = join(root, 'profile.sb');
  writeFileSync(profilePath, sandboxProfile({ workPath: work, configDir: config, projectRoot: root, home, program: process.execPath, writable: [work, config] }));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function inside(command: string) {
  const plan = wrapCommand(profilePath, '/bin/sh', ['-c', command]);
  const result = spawnSync(plan.bin, plan.args, { cwd: work, encoding: 'utf-8' });
  return { ok: result.status === 0, out: `${result.stdout}${result.stderr}` };
}

run('a program inside the operating system sandbox', () => {
  test('reads and writes its own folder and runs node', () => {
    expect(inside('cat mine.txt').out).toContain('MINE');
    expect(inside('echo hi > made.txt && cat made.txt').out).toContain('hi');
    expect(inside(`"${process.execPath}" -e "console.log(6*7)"`).out).toContain('42');
  });

  test('cannot read what belongs to the interviewer, the tool or another candidate, whatever program asks', () => {
    for (const command of [
      `cat "${join(home, '.ssh', 'id')}"`,
      `cat "${join(root, 'interview.config.yaml')}"`,
      'cat ../../omar/fibonacci/main.js',
      `python3 -c "print(open('${join(home, '.ssh', 'id')}').read())"`,
      `"${process.execPath}" -e "console.log(require('fs').readFileSync('${join(root, 'interview.config.yaml')}','utf8'))"`,
    ]) {
      const result = inside(command);
      expect(result.out, command).not.toMatch(/KEY|CONFIG|OTHER/);
    }
  });

  test('cannot list what comes before its folder', () => {
    expect(inside('ls ..').ok).toBe(false);
    expect(inside(`ls "${root}"`).ok).toBe(false);
  });

  test('cannot read the phases the interviewer has not released, which sit next to its folder', () => {
    expect(inside('cat ../.hidden/fibonacci/p.md').out).not.toContain('HIDDEN');
  });

  test('the hidden phases stay closed even if someone reopens the whole candidate folder that holds them', () => {
    const candidate = join(root, '.solutions', 'maya');
    writeFileSync(profilePath, sandboxProfile({ workPath: work, configDir: config, projectRoot: root, home, program: process.execPath, writable: [work, config], readable: [candidate] }));
    expect(inside('cat ../fibonacci/mine.txt').out).toContain('MINE');
    expect(inside('cat ../.hidden/fibonacci/p.md').out).not.toContain('HIDDEN');
  });

  test('cannot write outside its folder', () => {
    expect(inside(`echo x > "${join(root, 'escaped.txt')}"`).ok).toBe(false);
    expect(inside(`echo x > "${join(home, 'escaped.txt')}"`).ok).toBe(false);
  });
});

describe('the profile as text', () => {
  test('closes the hidden phases after everything it opens, so reopening a parent folder later cannot bring them back (the last matching rule wins)', () => {
    const text = sandboxProfile({ workPath: join(root, '.solutions', 'maya', 'fibonacci'), configDir: join(root, '.solutions', 'maya', '.agent-x'), projectRoot: root, home: join(root, 'home'), program: process.execPath, writable: [] });
    const lines = text.split('\n');
    const lastAllow = lines.map((l, i) => (l.startsWith('(allow file') ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
    const hidden = lines.findIndex(l => l.includes('.hidden') && l.startsWith('(deny'));
    expect(hidden).toBeGreaterThan(lastAllow);
  });

  test('says plainly when there is no sandbox to use', () => {
    expect(sandboxAvailable('linux')).toBe(false);
    expect(sandboxAvailable('darwin', () => true)).toBe(true);
    expect(sandboxAvailable('darwin', () => false)).toBe(false);
  });
});

// What the assistant is wrapped in must not be something it can undo. A read only file is not enough: deleting a file depends on the
// folder it is in (measured: a program could not rewrite its profile and could still delete it), so the profile has a folder of its own.
run('the profile that confines an assistant', () => {
  test('is made again every time the assistant starts, also when the one from before is read only', () => {
    const base = realpathSync(mkdtempSync(join(homedir(), '.trio-wall-')));
    try {
      const w = join(base, '.solutions', 'maya', 'fibonacci');
      const c = join(base, '.solutions', 'maya', '.agent-opencode-fibonacci');
      mkdirSync(w, { recursive: true });
      mkdirSync(c, { recursive: true });
      const start = () => sandboxed({ bin: '/bin/sh', args: ['-c', 'echo up'], workPath: w, configDir: c, writable: [w, c] });
      expect('error' in start()).toBe(false);
      // the candidate presses Enter and the assistant starts again
      const again = start() as { bin: string; args: string[] };
      expect('error' in again).toBe(false);
      expect(spawnSync(again.bin, again.args, { cwd: w, encoding: 'utf-8' }).stdout).toContain('up');
    } finally { rmSync(base, { recursive: true, force: true }); }
  });

  test('can be read by it but not rewritten, deleted or replaced', () => {
    const base = realpathSync(mkdtempSync(join(homedir(), '.trio-wall-')));
    try {
      const w = join(base, '.solutions', 'maya', 'fibonacci');
      const c = join(base, '.solutions', 'maya', '.agent-opencode-fibonacci');
      const profile = join(base, '.solutions', 'maya', '.walls', 'fibonacci-sh.sb');
      mkdirSync(w, { recursive: true });
      mkdirSync(c, { recursive: true });
      const script = [`echo '(allow default)' > "${profile}"; echo rewrite=$?`, `rm -f "${profile}"; echo delete=$?`, `echo x > "${join(base, '.solutions', 'maya', '.walls', 'other.sb')}"; echo create=$?`, `head -c 9 "${profile}"; echo " read=$?"`].join('; ');
      const plan = sandboxed({ bin: '/bin/sh', args: ['-c', script], workPath: w, configDir: c, writable: [w, c] }) as { bin: string; args: string[] };
      const out = spawnSync(plan.bin, plan.args, { cwd: w, encoding: 'utf-8' }).stdout;
      expect(out).toContain('rewrite=1');
      expect(out).toContain('delete=1');
      expect(out).toContain('create=1');
      expect(out).toContain('read=0');
      expect(existsSync(profile)).toBe(true);
    } finally { rmSync(base, { recursive: true, force: true }); }
  });
});

run('what the assistant may ask about above its folder', () => {
  test('can find out that a folder exists, and still cannot open a file or list a folder in it', () => {
    const base = realpathSync(mkdtempSync(join(homedir(), '.trio-meta-')));
    try {
      const w = join(base, '.solutions', 'maya', 'fibonacci');
      const c = join(base, '.solutions', 'maya', '.agent-opencode-fibonacci');
      mkdirSync(w, { recursive: true });
      mkdirSync(c, { recursive: true });
      mkdirSync(join(base, '.git'), { recursive: true });
      writeFileSync(join(base, 'interview.config.yaml'), 'CONFIG-SECRET');
      writeFileSync(join(base, '.git', 'config'), 'GIT-SECRET');
      const script = [`test -d "${base}/.git"; echo exists=$?`, `cat "${base}/interview.config.yaml"; echo read=$?`, `cat "${base}/.git/config"; echo gitread=$?`, `ls "${base}"; echo list=$?`].join('; ');
      const plan = sandboxed({ bin: '/bin/sh', args: ['-c', script], workPath: w, configDir: c, writable: [w, c] }) as { bin: string; args: string[] };
      const out = spawnSync(plan.bin, plan.args, { cwd: w, encoding: 'utf-8' });
      const text = out.stdout + out.stderr;
      expect(text).not.toMatch(/CONFIG-SECRET|GIT-SECRET/);
      expect(text).toContain('read=1');
      expect(text).toContain('gitread=1');
      expect(text).toContain('list=1');
    } finally { rmSync(base, { recursive: true, force: true }); }
  });
});

// Pi and OpenCode are installed under the interviewer's home. node looks up every folder above the program one by one, and the home
// is closed, so those folders may be asked about (name only) and the program itself is opened again. The home stays unreadable.
run('a program installed inside the interviewer\'s home', () => {
  test('starts, and still cannot read anything else of the home', () => {
    const base = realpathSync(mkdtempSync(join(homedir(), '.trio-prog-')));
    try {
      const w = join(base, '.solutions', 'maya', 'fibonacci');
      const c = join(base, '.solutions', 'maya', '.agent-pi-fibonacci');
      const pkg = join(base, 'tools', 'node_modules', 'pi');
      mkdirSync(w, { recursive: true });
      mkdirSync(c, { recursive: true });
      mkdirSync(pkg, { recursive: true });
      writeFileSync(join(base, 'tools', 'secret.txt'), 'TOOLS-SECRET');
      writeFileSync(join(pkg, 'cli.js'), `const fs = require('fs'); console.log('started'); try { console.log(fs.readFileSync(${JSON.stringify(join(base, 'tools', 'secret.txt'))}, 'utf8')); } catch (e) { console.log('closed'); }`);
      const plan = sandboxed({ bin: process.execPath, args: [join(pkg, 'cli.js')], workPath: w, configDir: c, writable: [w, c], programFolders: [join(base, 'tools', 'node_modules')] }) as { bin: string; args: string[] };
      const out = spawnSync(plan.bin, plan.args, { cwd: w, encoding: 'utf-8' });
      expect(out.stdout).toContain('started');
      expect(out.stdout).not.toContain('TOOLS-SECRET');
    } finally { rmSync(base, { recursive: true, force: true }); }
  });
});
