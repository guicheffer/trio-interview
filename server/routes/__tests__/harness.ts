import Fastify, { type FastifyInstance } from 'fastify';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

export const LOCAL = { host: 'localhost:3000' };
export const TUNNEL = { host: 'random-name.ngrok-free.dev' };

export function put(path: string, content = '') {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

export interface Workspace {
  root: string;
  exercise: string;
  restore: () => void;
}

/** A throwaway working directory that looks like the repository: an exercise template and a .solutions folder */
export function makeWorkspace(exerciseId = 'demo'): Workspace {
  const previousCwd = process.cwd();
  const previousPath = process.env.EXERCISE_PATH;
  const previousId = process.env.EXERCISE_ID;
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'routes-')));
  const exercise = join(root, 'exercises', exerciseId);
  put(join(exercise, 'description.md'), '# Demo\nDo the thing.');
  put(join(exercise, 'src', 'index.ts'), 'export const n = 1;');
  put(join(exercise, 'phases', 'phase-1.md'), 'one');
  put(join(exercise, 'phases', 'phase-2-hidden.md'), 'two');
  put(join(exercise, 'exercise.json'), JSON.stringify({
    lockedFiles: ['description.md', 'phases/'],
    defaultFile: 'description.md',
    hidden: ['phases/phase-2-*.md'],
    run: { start: 'npm start', description: 'Start', port: null },
  }));
  process.chdir(root);
  process.env.EXERCISE_PATH = exercise;
  process.env.EXERCISE_ID = exerciseId;
  return {
    root,
    exercise,
    restore: () => {
      process.chdir(previousCwd);
      if (previousPath === undefined) delete process.env.EXERCISE_PATH; else process.env.EXERCISE_PATH = previousPath;
      if (previousId === undefined) delete process.env.EXERCISE_ID; else process.env.EXERCISE_ID = previousId;
      rmSync(root, { recursive: true, force: true });
    },
  };
}

export async function buildApp(register: (server: FastifyInstance) => Promise<void> | void): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(async (instance) => { await register(instance); });
  await app.ready();
  return app;
}
