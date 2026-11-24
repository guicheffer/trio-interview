import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const MAX_BYTES = 1_000_000;

/**
 * The files that are not the way the exercise started: edited, or new. Folders are not listed.
 * `originals` are the places a file may have started from (the exercise, then what the platform adds to every
 * candidate folder, like AGENTS.md); matching any one of them means it was not changed.
 */
export function changedSinceStart(workPath: string, originals: string[], files: string[]): string[] {
  const changed: string[] = [];
  for (const file of files) {
    try {
      const mine = join(workPath, file);
      if (statSync(mine).size > MAX_BYTES) continue;
      const content = readFileSync(mine);
      const sources = originals.map(dir => join(dir, file)).filter(p => existsSync(p));
      if (!sources.some(p => content.equals(readFileSync(p)))) changed.push(file);
    } catch {}
  }
  return changed;
}
