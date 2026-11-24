import { existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

/**
 * The exercise the server uses when `make start` did not pick one (plain `npm run dev`, or a test).
 * It is the first folder in exercises/ that has a description.md, so it does not depend on any exercise being there by name.
 * With none at all it still answers with a path, which simply does not exist yet.
 */
export function defaultExercisePath(cwd: string = process.cwd()): string {
  const dir = resolve(cwd, 'exercises');
  try {
    const first = readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_') && existsSync(join(dir, e.name, 'description.md')))
      .map(e => e.name)
      .sort()[0];
    if (first) return join(dir, first);
  } catch {
    // no exercises folder yet
  }
  return join(dir, 'exercise');
}

/** The exercise the server works on: the one `make start` chose, or the default */
export function currentExercisePath(): string {
  return process.env.EXERCISE_PATH || defaultExercisePath();
}

export function currentExerciseId(path: string = currentExercisePath()): string {
  return process.env.EXERCISE_ID || (path.split('/').filter(Boolean).pop() ?? 'exercise');
}
