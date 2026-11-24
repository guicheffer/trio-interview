import { describe, expect, test } from 'vitest';
import { exerciseJson, idFromTitle, isExerciseId, newExerciseFiles } from '../exercise-files.js';

const script = { id: 'word-count', title: 'Word count', kind: 'script' as const, minutes: 20 };
const web = { id: 'todo-api', title: 'Todo API', kind: 'web' as const, minutes: 45 };

describe('new exercise', () => {
  test('ids are folder names that are safe everywhere', () => {
    for (const ok of ['word-count', 'a', 'x1', 'api-2']) expect(isExerciseId(ok), ok).toBe(true);
    for (const bad of ['', '-a', 'a-', 'Word', 'a b', 'a/b', '../a', '.hidden', '_templates', 'a'.repeat(41), 'é']) expect(isExerciseId(bad), bad).toBe(false);
  });

  test('a title becomes a valid id', () => {
    expect(idFromTitle('Word Count!')).toBe('word-count');
    expect(idFromTitle('  Café   Manager  ')).toBe('cafe-manager');
    expect(idFromTitle('???')).toBe('');
    expect(isExerciseId(idFromTitle('A very long title '.repeat(10)))).toBe(true);
  });

  test('a script exercise runs at once: the file it starts exists and the config says how', () => {
    const files = newExerciseFiles(script);
    const config = JSON.parse(files['exercise.json']);
    expect(config.run.start).toBe('node main.js');
    expect(config.run.port).toBeNull();
    expect(Object.keys(files)).toContain('main.js');
    expect(files['description.md'].startsWith('# Word count')).toBe(true);
  });

  test('a web exercise picks a port outside the ones the tool uses', () => {
    const run = JSON.parse(exerciseJson(web)).run;
    expect(run.serverPort).toBeGreaterThanOrEqual(3002);
    expect([3000, 3001, 3099]).not.toContain(run.serverPort);
    expect(run.install).toContain('npm install');
  });

  test('what the assistant is told is plain context, never a note to the author or a hint about a solution', () => {
    for (const ex of [script, web]) {
      const context: string = JSON.parse(exerciseJson(ex)).assistant.context;
      expect(context).not.toMatch(/bug|solution|answer|describe the|never mention/i);
    }
  });

  test('the description is locked so the candidate cannot edit the brief', () => {
    expect(JSON.parse(exerciseJson(script)).lockedFiles).toContain('description.md');
  });
});
