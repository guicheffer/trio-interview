/**
 * The editor's own Run button only makes sense for a file the exercise says to run (for example `node fibonacci.js`).
 * In a project, Run belongs to the terminal, and running a random source file would stop the dev server and the preview.
 */
export function isRunTarget(filePath: string | null | undefined, runStart: string | null | undefined): boolean {
  if (!filePath || !runStart) return false;
  const name = filePath.split('/').pop() ?? filePath;
  return runStart.split(/[\s;&|]+/).some(token => token === filePath || token === `./${filePath}` || token === name);
}
