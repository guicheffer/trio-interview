import { homedir } from 'os';
import { dirname, join, resolve } from 'path';
import { realpathSync } from 'fs';

/**
 * What the terminal assistants may touch. Claude Code with permission prompts off will read and write anywhere the
 * interviewer's user can, and the folder it starts in is a habit and not a wall: it read a file two levels up when asked,
 * and `ls ..` listed what comes before. Two layers close that, and neither is enough alone:
 *   - the tool's own switches stop its file tools (Read, Write, Edit) outside the working folder, and stop it from editing
 *     the settings that hold the switches;
 *   - the operating system's sandbox stops the programs the shell runs (cat, python, node), which the first layer cannot see.
 * This builds the second one: the places that must be unreadable from a candidate's session.
 */
export interface Confinement {
  /** Folders the shell may not read, whatever program asks */
  denyRead: string[];
  /** Folders inside a denied one that are needed, so they are opened again */
  allowRead: string[];
}

/** The folders of the programs the assistant needs to run, as they really are on this machine (symlinks followed) */
export function programFolders(extra: string[] = []): string[] {
  const out: string[] = [];
  for (const file of [process.execPath, ...extra]) {
    if (!file) continue;
    const resolved = real(file);
    // .../versions/node/v25/bin/node -> the version folder, so its lib is readable too
    const marker = resolved.indexOf('/bin/');
    out.push(marker > 0 ? resolved.slice(0, marker) : dirname(resolved));
  }
  return [...new Set(out)];
}

const real = (path: string): string => { try { return realpathSync(path); } catch { return path; } };
const both = (path: string): string[] => [...new Set([path, real(path)])];

export interface ConfinementInput {
  /** The candidate's own folder for this exercise (.solutions/<name>/<exercise>) */
  workPath: string;
  /** The private configuration of the assistant, next to the work */
  configDir: string;
  /** The root of the tool: where the settings, the other candidates and the server code are */
  projectRoot?: string;
  home?: string;
}

export function confinementFor({ workPath, configDir, projectRoot = process.cwd(), home = homedir() }: ConfinementInput): Confinement {
  const solutions = resolve(projectRoot, '.solutions');
  const candidateRoot = dirname(resolve(workPath));
  const deny = [
    // the phases the interviewer has not released are kept next to the work, so they are named here and stay closed
    join(candidateRoot, '.hidden'),
    // everything of the interviewer's own: keys, tokens, shell history, other projects
    home,
    // the tool itself (the settings of this interview, the server code) and every other candidate
    resolve(projectRoot),
    solutions,
    // other people's temporary files
    '/tmp', '/private/tmp', '/var/folders', '/private/var/folders',
  ];
  const allow = [
    resolve(workPath),
    resolve(configDir),
    // the programs themselves: node and the assistant may live inside the home (nvm, ~/.local), and a program that cannot be read cannot run.
    // Only the folder of each is opened, never the rest of the home.
    ...programFolders(),
    // git asks for its configuration before it will run
    join(home, '.gitconfig'),
    join(home, '.config', 'git'),
  ];
  const hidden = both(join(candidateRoot, '.hidden'));
  return {
    denyRead: [...new Set([...deny.flatMap(both), ...hidden])],
    allowRead: [...new Set(allow.flatMap(both))],
  };
}

/**
 * Where the assistant keeps the small files it writes after every command (the folder it ended in, long outputs). Left alone it
 * uses /tmp/claude-<uid>, which is shared with every Claude Code session of the interviewer and holds their outputs, so it gets
 * a folder of its own inside its private configuration instead.
 */
export function assistantTmpDir(configDir: string): string {
  return join(resolve(configDir), 'tmp');
}

/** The settings of the assistant that apply both layers */
export function confinedSettings(input: ConfinementInput): Record<string, unknown> {
  const { denyRead, allowRead } = confinementFor(input);
  const work = both(resolve(input.workPath));
  return {
    permissions: {
      defaultMode: 'bypassPermissions',
      // the file tools stay in the working folder, and cannot edit the settings that say so
      blockReadsOutsideWorkingDirectories: true,
      blockWritesOutsideWorkingDirectories: true,
    },
    sandbox: {
      // Off, on purpose. The whole process runs inside the operating system's sandbox (os-sandbox.ts), which also covers what a person
      // types after "!" in the terminal, that this setting never did. The two cannot be stacked: a sandbox started inside another one
      // is refused by the system (measured: sandbox_apply: Operation not permitted). The lists below stay as the record of what is closed.
      enabled: false,
      // a command the sandbox would stop does not get a second chance outside it
      allowUnsandboxedCommands: false,
      autoAllowBashIfSandboxed: true,
      filesystem: { denyRead, allowRead, allowWrite: [...work, ...both(resolve(input.configDir))] },
    },
  };
}
