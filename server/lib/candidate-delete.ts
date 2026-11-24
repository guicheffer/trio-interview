import { existsSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { isSafeCandidateName } from './candidate-name.js';

export type DeleteResult = 'deleted' | 'invalid' | 'missing' | 'busy';

/** Removes a candidate's folder under .solutions (the working copy of every exercise and the state). Never one in use. */
export function deleteCandidate(name: unknown, opts: { activeName?: string | null; connected?: number; root?: string }): DeleteResult {
  if (!isSafeCandidateName(name)) return 'invalid';
  const root = opts.root ?? resolve(process.cwd(), '.solutions');
  const dir = join(root, name);
  if (!existsSync(dir)) return 'missing';
  if (opts.activeName === name || (opts.connected ?? 0) > 0) return 'busy';
  rmSync(dir, { recursive: true, force: true });
  return 'deleted';
}
