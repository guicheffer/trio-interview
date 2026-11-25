/**
 * One honest answer per terminal assistant: is it installed, which version, was a login found, and can it start inside the
 * sandbox. The picker (for the interviewer), `make config` and `make start` all say it in the same words.
 */

export interface ToolFacts {
  name: string;
  installed: boolean;
  /** The version line the program printed ('' when it did not start) */
  version: string;
  /** Set when the program is installed but too old, or did not answer */
  versionProblem?: string;
  /** How to install it, said when it is missing */
  installHint: string;
  /** What login was found, in words and never a secret, or null when none */
  login: string | null;
  /** Why there is no login, said when login is null */
  loginProblem?: string;
  /** Said when the sandbox is fine (default "ok") */
  sandboxOk?: string;
  /** null when it can start inside the sandbox, otherwise the exact reason it cannot */
  sandboxProblem: string | null;
}

export interface ToolReport {
  ok: boolean;
  /** The first thing that stops it, or 'OK' */
  message: string;
  /** One line for a terminal: ready, or the reason, followed by the three facts */
  line: string;
  /** True when the only thing missing is a sign in. Said softly and never as an error. */
  needsSignIn: boolean;
}

export function describeTool(facts: ToolFacts): ToolReport {
  let message = 'OK';
  if (!facts.installed) message = facts.versionProblem || `the ${facts.name} program was not found. Install it with: ${facts.installHint}`;
  else if (facts.versionProblem) message = facts.versionProblem;
  else if (facts.sandboxProblem) message = facts.sandboxProblem;
  else if (facts.login === null) message = facts.loginProblem || 'no login was found';
  const ok = message === 'OK';
  const needsSignIn = facts.installed && !facts.versionProblem && !facts.sandboxProblem && facts.login === null;
  const state = facts.installed ? `installed${facts.version ? ` ${facts.version}` : ''}` : 'not installed';
  const detail = `${state}; login: ${facts.login ?? 'none found'}; sandbox: ${facts.sandboxProblem ?? facts.sandboxOk ?? 'ok'}`;
  if (needsSignIn) return { ok, message, needsSignIn, line: `${facts.name}: ${facts.loginProblem || 'not signed in'} (installed${facts.version ? ` ${facts.version}` : ''})` };
  return { ok, message, needsSignIn, line: ok ? `${facts.name}: ready (${detail})` : `${facts.name}: NOT ready, ${message} (${detail})` };
}

/** [major, minor] of the first version number in the text, or null */
export function versionParts(text: string): [number, number] | null {
  const match = /(\d+)\.(\d+)/.exec(text);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

/** Whether the text names a version at or above major.minor */
export function versionAtLeast(text: string, major: number, minor: number): boolean {
  const parts = versionParts(text);
  return !!parts && (parts[0] > major || (parts[0] === major && parts[1] >= minor));
}
