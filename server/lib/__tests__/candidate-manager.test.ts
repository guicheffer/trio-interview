import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CandidateManager } from '../candidate-manager.js';

describe('CandidateManager', () => {
  let cwd: string;
  let work: string;
  let manager: CandidateManager;

  beforeEach(() => {
    cwd = process.cwd();
    work = mkdtempSync(join(tmpdir(), 'candidates-'));
    process.chdir(work);
    manager = new CandidateManager();
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(work, { recursive: true, force: true });
  });

  test('creates a candidate with a default state', () => {
    const state = manager.createCandidate('maria', 'fibonacci');

    expect(state).toMatchObject({ name: 'maria', currentExercise: 'fibonacci', theme: 'light', exercisesCompleted: [] });
    expect(manager.candidateExists('maria')).toBe(true);
    expect(manager.getState('maria')?.name).toBe('maria');
  });

  test('refuses to create the same candidate twice', () => {
    manager.createCandidate('maria', 'fibonacci');
    expect(() => manager.createCandidate('maria', 'fibonacci')).toThrow(/already exists/);
  });

  test('returns null for the state of an unknown candidate', () => {
    expect(manager.getState('nobody')).toBeNull();
    expect(manager.candidateExists('nobody')).toBe(false);
  });

  test('updates preferences and the last access time', () => {
    const created = manager.createCandidate('maria', 'fibonacci');
    const updated = manager.updatePreferences('maria', { theme: 'dark', currentExercise: 'vehicle-rental' });

    expect(updated.theme).toBe('dark');
    expect(updated.currentExercise).toBe('vehicle-rental');
    expect(updated.createdAt).toBe(created.createdAt);
    expect(manager.getState('maria')?.theme).toBe('dark');
  });

  test('fails to update an unknown candidate', () => {
    expect(() => manager.updatePreferences('nobody', { theme: 'dark' })).toThrow(/not found/);
  });

  test('ensureCandidateState is idempotent', () => {
    mkdirSync(join(work, '.solutions', 'ana'), { recursive: true });
    const first = manager.ensureCandidateState('ana', 'fibonacci');
    const second = manager.ensureCandidateState('ana', 'other');

    expect(second.createdAt).toBe(first.createdAt);
    expect(second.currentExercise).toBe('fibonacci');
  });

  test('renames a candidate folder', () => {
    manager.createCandidate('old-name', 'fibonacci');
    manager.renameCandidate('old-name', 'new-name');

    expect(manager.candidateExists('old-name')).toBe(false);
    expect(manager.candidateExists('new-name')).toBe(true);
  });

  test('rename refuses a missing source and an existing target', () => {
    manager.createCandidate('a', 'fibonacci');
    manager.createCandidate('b', 'fibonacci');

    expect(() => manager.renameCandidate('missing', 'c')).toThrow(/not found/);
    expect(() => manager.renameCandidate('a', 'b')).toThrow(/already exists/);
  });

  test('lists only folders', () => {
    manager.createCandidate('a', 'fibonacci');
    manager.createCandidate('b', 'fibonacci');
    writeFileSync(join(work, '.solutions', 'stray.txt'), 'x');

    expect(manager.listCandidates().sort()).toEqual(['a', 'b']);
  });

  test('syncs exercise files, skipping internals and removing stale files', () => {
    const exercise = join(work, 'exercise');
    mkdirSync(join(exercise, 'src'), { recursive: true });
    mkdirSync(join(exercise, 'node_modules', 'dep'), { recursive: true });
    writeFileSync(join(exercise, 'src', 'index.ts'), 'export {};');
    writeFileSync(join(exercise, 'exercise.json'), '{}');
    writeFileSync(join(exercise, 'node_modules', 'dep', 'x.js'), '');

    manager.createCandidate('maria', 'ex');
    const dest = join(work, '.solutions', 'maria', 'ex');
    mkdirSync(join(dest, 'old'), { recursive: true });
    writeFileSync(join(dest, 'old', 'gone.txt'), 'stale');
    writeFileSync(join(dest, 'stale.txt'), 'stale');

    manager.saveExerciseFiles('maria', 'ex', exercise);

    expect(readFileSync(join(dest, 'src', 'index.ts'), 'utf-8')).toBe('export {};');
    expect(existsSync(join(dest, 'node_modules'))).toBe(false);
    expect(existsSync(join(dest, 'exercise.json'))).toBe(false);
    expect(existsSync(join(dest, 'stale.txt'))).toBe(false);
    expect(existsSync(join(dest, 'old'))).toBe(false);
  });
});
