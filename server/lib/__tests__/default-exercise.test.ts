import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { currentExerciseId, currentExercisePath, defaultExercisePath } from '../default-exercise.js';

let cwd = '';
const make = (id: string, brief = true) => { mkdirSync(join(cwd, 'exercises', id), { recursive: true }); if (brief) writeFileSync(join(cwd, 'exercises', id, 'description.md'), '# T'); };

beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), 'trio-default-')); delete process.env.EXERCISE_PATH; delete process.env.EXERCISE_ID; });
afterEach(() => { rmSync(cwd, { recursive: true, force: true }); delete process.env.EXERCISE_PATH; delete process.env.EXERCISE_ID; });

describe('the exercise used when none was picked', () => {
  test('is the first exercise folder, in alphabetical order, so it never depends on a name', () => {
    make('zeta'); make('alpha'); make('mid');
    expect(defaultExercisePath(cwd)).toBe(join(cwd, 'exercises', 'alpha'));
  });

  test('ignores folders without a brief, hidden folders and templates', () => {
    make('aaa', false); make('_templates'); mkdirSync(join(cwd, 'exercises', '.git'), { recursive: true }); make('real');
    expect(defaultExercisePath(cwd)).toBe(join(cwd, 'exercises', 'real'));
  });

  test('with no exercises at all it still answers with a path instead of failing', () => {
    expect(defaultExercisePath(cwd)).toBe(join(cwd, 'exercises', 'exercise'));
    make('x', false);
    expect(defaultExercisePath(cwd)).toBe(join(cwd, 'exercises', 'exercise'));
  });

  test('what make start chose always wins', () => {
    make('alpha');
    process.env.EXERCISE_PATH = '/somewhere/chosen'; process.env.EXERCISE_ID = 'chosen';
    expect(currentExercisePath()).toBe('/somewhere/chosen');
    expect(currentExerciseId()).toBe('chosen');
  });

  test('the id follows the folder name when it was not given', () => {
    expect(currentExerciseId('/a/b/word-count')).toBe('word-count');
    expect(currentExerciseId('/a/b/word-count/')).toBe('word-count');
  });
});
