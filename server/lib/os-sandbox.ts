import { mkdirSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { confinementFor, type ConfinementInput } from './confinement.js';

/**
 * A wrapper in the operating system for a terminal assistant that has no sandbox of its own (OpenCode, Pi and whatever comes
 * next). The assistant runs with its permission prompts off, as a program of the interviewer's user, so it can read whatever that
 * user can. This puts the same walls around it that Claude Code gets from its own sandbox, but around the whole process, so it
 * does not matter which program it runs or how: cat, python, node, the assistant's own file tools.
 *
 * On macOS this is `sandbox-exec`. It is marked deprecated by Apple and still works, and it is what Claude Code uses underneath.
 * Linux would need `bubblewrap`, which is not done: there the wrapper says so and the interview does not start without it.
 */

export interface SandboxPlan {
  /** What to run instead of the assistant, with the assistant as its last arguments */
  bin: string;
  args: string[];
}

export interface SandboxUnavailable {
  error: string;
}

const real = (path: string): string => { try { return realpathSync(path); } catch { return path; } };
const quote = (path: string): string => `"${path.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const subpath = (path: string): string => `(subpath ${quote(path)})`;

export interface ProfileInput extends ConfinementInput {
  /** The program that will run, and the folders it needs to be read and to read from (an installation inside the home, for one) */
  program: string;
  programFolders?: string[];
  /** Where the program writes: its own configuration and data, and the candidate's folder */
  writable: string[];
  /** Folders the program reads in addition to the working folder (its own private configuration) */
  readable?: string[];
}

/**
 * The profile, as text. It starts from "allow everything" and takes away what must stay closed. Closing by name is the same
 * list the sandbox of Claude Code gets, so one list says what a candidate may not reach. Two things are deliberate:
 *   - the folders that must stay open are opened again *after* the ones that are closed, because the last matching rule wins;
 *   - the hidden phases are closed last of all, so nothing opened above can bring them back.
 */
export function sandboxProfile(input: ProfileInput): string {
  const { denyRead, allowRead } = confinementFor(input);
  const hidden = denyRead.filter(path => path.endsWith('/.hidden'));
  const closed = denyRead.filter(path => !path.endsWith('/.hidden'));
  const open = [...new Set([...allowRead, ...(input.readable ?? []), ...(input.programFolders ?? []), real(dirname(input.program)), real(input.program)])];
  const write = [...new Set(input.writable.flatMap(path => [path, real(path)]))];
  const lines = [
    '(version 1)',
    '(allow default)',
    ';; closed: the interviewer\'s own folders, the tool, every other candidate, the temporary folders',
    ...closed.map(path => `(deny file-read* file-write* ${subpath(path)})`),
    ';; opened again: the candidate\'s folder, the assistant\'s own configuration, the program itself',
    ...open.map(path => `(allow file-read* ${subpath(path)})`),
    ';; the assistant looks upward for the root of the project (it asks about .git in each folder above its own), and a refusal makes it stop',
    ';; so the folders above may be asked about, with no contents: a name can be looked up, a file cannot be opened',
    ';; a program written in JavaScript is started by node, which looks up each folder above the program one by one (metadata only, as above)',
    ...[...new Set([input.workPath, ...(input.programFolders ?? []), input.program].flatMap(path => ancestors(path)))].map(path => `(allow file-read-metadata (literal ${quote(path)}))`),
    ';; the only places it may write',
    ...write.map(path => `(allow file-write* ${subpath(path)})`),
    ';; closed last of all: the phases the interviewer has not released',
    ...hidden.map(path => `(deny file-read* file-write* ${subpath(path)})`),
  ];
  return lines.join('\n') + '\n';
}

/** Every folder above `path`, up to the root, the way the assistant walks them when it looks for the root of its project */
export function ancestors(path: string): string[] {
  const out: string[] = [];
  let current = real(dirname(real(path)));
  for (let guard = 0; guard < 40; guard++) {
    out.push(current, `${current === '/' ? '' : current}/.git`);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return [...new Set(out)];
}

export function sandboxAvailable(platform: string = process.platform, exists: (path: string) => boolean = (p) => { try { realpathSync(p); return true; } catch { return false; } }): boolean {
  return platform === 'darwin' && exists('/usr/bin/sandbox-exec');
}

/** The command line that runs `bin args` inside the profile written at `profilePath` */
export function wrapCommand(profilePath: string, bin: string, args: string[]): SandboxPlan {
  return { bin: '/usr/bin/sandbox-exec', args: ['-f', profilePath, bin, ...args] };
}

export function sandboxMissing(platform: string = process.platform): SandboxUnavailable {
  return {
    error: platform === 'darwin'
      ? 'The operating system sandbox (sandbox-exec) was not found, so this assistant is not started.'
      : `A sandbox for this assistant exists only on macOS so far (${platform}). Use the chat or Claude Code, or run the interview in a virtual machine.`,
  };
}


/**
 * The command for an assistant that is put inside the operating system's sandbox: the profile is written next to its private
 * configuration (which it can read but not change) and the assistant becomes the last part of the command line.
 */
export function sandboxed(input: { bin: string; args: string[]; workPath: string; configDir: string; writable: string[]; programFolders?: string[] }): { bin: string; args: string[] } | { error: string } {
  if (!sandboxAvailable()) return sandboxMissing();
  // The profile lives in a folder of its own that the assistant can read and never write: a read only file is not enough, because
  // deleting a file depends on the folder (measured: the program could not rewrite it and could still delete it).
  const walls = join(dirname(input.workPath), '.walls');
  mkdirSync(walls, { recursive: true });
  const profilePath = join(walls, `${basename(input.workPath)}-${basename(input.bin)}.sb`);
  // Written fresh on every start (the file is read only, so it is removed first): the tool owns this folder, the assistant does not.
  rmSync(profilePath, { force: true });
  writeFileSync(profilePath, sandboxProfile({ workPath: input.workPath, configDir: input.configDir, program: input.bin, writable: input.writable, readable: [walls], programFolders: input.programFolders }), { mode: 0o444 });
  return wrapCommand(profilePath, input.bin, input.args);
}
