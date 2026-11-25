import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readConfigForExercise, readExerciseConfig, exerciseTemplatePath } from '../exercise-config.js';

describe('exercise config', () => {
  let dir: string;
  let cwd: string;

  beforeEach(() => {
    cwd = process.cwd();
    dir = mkdtempSync(join(tmpdir(), 'exercise-config-'));
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  });

  test('reads locked files, hidden files, default file and run settings', () => {
    writeFileSync(join(dir, 'exercise.json'), JSON.stringify({
      defaultFile: 'description.md',
      lockedFiles: ['description.md', 'phases/', 7],
      hidden: ['phases/phase-2-*.md'],
      assistant: { context: 'A small app.' },
      run: { start: 'npm start', description: 'Start', port: 5173, serverPort: 3002, install: 'npm i' },
    }));
    expect(readExerciseConfig(dir)).toEqual({
      defaultFile: 'description.md',
      lockedFiles: ['description.md', 'phases/'],
      hidden: ['phases/phase-2-*.md'],
      assistantContext: 'A small app.',
      run: { start: 'npm start', description: 'Start', port: 5173, serverPort: 3002, install: 'npm i' },
      tests: null,
      testsErrors: [],
    });
  });

  test('reads the tests block, and leaves out one that cannot be used, with the reasons', () => {
    writeFileSync(join(dir, 'exercise.json'), JSON.stringify({ tests: { command: 'node --test', files: ['a.test.js'], cases: ['one'] } }));
    expect(readExerciseConfig(dir)).toMatchObject({ tests: { command: 'node --test', files: ['a.test.js'], description: null, cases: ['one'] }, testsErrors: [] });
    writeFileSync(join(dir, 'exercise.json'), JSON.stringify({ run: { start: 'node a.js' }, tests: { command: 'node --test | sh', files: ['../a.js'] } }));
    const bad = readExerciseConfig(dir);
    expect(bad.tests).toBeNull();
    expect(bad.testsErrors).toHaveLength(2);
    expect(bad.run.start).toBe('node a.js');
  });

  test('falls back to an empty config for a missing or broken file', () => {
    expect(readExerciseConfig(dir)).toMatchObject({ lockedFiles: [], hidden: [], run: { start: null, port: null } });
    expect(readExerciseConfig(undefined).run.serverPort).toBeNull();
    writeFileSync(join(dir, 'exercise.json'), '{ nope');
    expect(readExerciseConfig(dir).lockedFiles).toEqual([]);
  });

  test('finds the config of an exercise by id and refuses unsafe ids', () => {
    mkdirSync(join(dir, 'exercises', 'demo'), { recursive: true });
    writeFileSync(join(dir, 'exercises', 'demo', 'exercise.json'), JSON.stringify({ run: { port: 5173 } }));
    process.chdir(dir);
    expect(readConfigForExercise('demo').run.port).toBe(5173);
    expect(readConfigForExercise('../etc').run.port).toBeNull();
    expect(() => exerciseTemplatePath('../etc')).toThrow();
  });
});
