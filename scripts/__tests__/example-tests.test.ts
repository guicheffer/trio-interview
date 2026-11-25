// The tests that ship in examples/ are part of the starter: the stubs must fail them and a correct solution must pass them.
// Both directions run the real test file with the real Node, in a scratch copy, so a test that always passes (or always fails) is caught.
import { afterEach, describe, expect, test } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseSpecOutput, testsCommand } from '../../shared/exercise-tests.js';
import { parseTestsConfig } from '../../shared/exercise-tests.js';

const ROOT = join(__dirname, '..', '..');
const scratch: string[] = [];
afterEach(() => { while (scratch.length) rmSync(scratch.pop()!, { recursive: true, force: true }); });

const config = (id: string) => JSON.parse(readFileSync(join(ROOT, 'examples', id, 'exercise.json'), 'utf-8'));

/** A scratch copy of an example, with `edit` applied to its solution file, and what its tests print */
function runTests(id: string, file: string, edit: (source: string) => string = s => s, only?: string) {
  const dir = mkdtempSync(join(tmpdir(), `trio-ex-${id}-`));
  scratch.push(dir);
  cpSync(join(ROOT, 'examples', id), dir, { recursive: true });
  writeFileSync(join(dir, file), edit(readFileSync(join(dir, file), 'utf-8')));
  const { config: tests } = parseTestsConfig(config(id).tests);
  const line = testsCommand(tests!, only);
  const r = spawnSync('/bin/sh', ['-c', line], { cwd: dir, encoding: 'utf-8' });
  return { status: r.status, run: parseSpecOutput(r.stdout)!, line };
}

const FIB = `
function fibonacci(n) {
  if (!Number.isInteger(n) || n < 0) throw new RangeError('n must be a non-negative integer');
  const out = [];
  for (let a = 0, b = 1, i = 0; i < n; i++) { out.push(a); [a, b] = [b, a + b]; }
  return out;
}
function fibonacciUpTo(limit) {
  const out = [];
  for (let a = 0, b = 1; a < limit; [a, b] = [b, a + b]) out.push(a);
  return out;
}
module.exports = { fibonacci, fibonacciUpTo };
`;

const WORDS = `
function wordCount(text) {
  const counts = {};
  for (const w of text.toLowerCase().match(/[\\p{L}\\p{N}]+(?:'[\\p{L}\\p{N}]+)*/gu) ?? []) counts[w] = (counts[w] ?? 0) + 1;
  return counts;
}
function topWords(text, n) {
  return Object.entries(wordCount(text)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, Math.max(0, n));
}
module.exports = { wordCount, topWords };
`;

describe.each([
  ['fibonacci', 'fibonacci.js', FIB],
  ['word-count', 'wordcount.js', WORDS],
])('the tests of the %s example', (id, file, solution) => {
  const listed: string[] = config(id).tests.cases;

  test('the starter fails every one of them', () => {
    const { run, status } = runTests(id, file);
    expect(status).not.toBe(0);
    expect(run.summary.passed).toBe(0);
    expect(run.summary.failed).toBe(listed.length);
  });

  test('a correct solution passes every one of them', () => {
    const { run, status } = runTests(id, file, () => solution);
    expect(run.cases.filter(c => c.status !== 'pass')).toEqual([]);
    expect(run.summary.passed).toBe(listed.length);
    expect(status).toBe(0);
  });

  test('the names in exercise.json are exactly the tests in the file', () => {
    const { run } = runTests(id, file, () => solution);
    expect(run.cases.map(c => c.name)).toEqual(listed);
  });

  test('every test can be run on its own, and runs only that one', () => {
    for (const name of listed) {
      const { run } = runTests(id, file, () => solution, name);
      expect(run.cases.map(c => c.name), name).toEqual([name]);
      expect(run.cases[0].status, name).toBe('pass');
    }
  });

  test('the test file is locked for the candidate and does not hold the solution', () => {
    const { lockedFiles, tests } = config(id);
    expect(lockedFiles).toEqual(expect.arrayContaining(tests.files));
    const text = readFileSync(join(ROOT, 'examples', id, tests.files[0]), 'utf-8');
    expect(text).not.toMatch(/Number\.isInteger|\.sort\(|\.match\(|reduce\(|for \(let/);   // examples of behaviour, not the answer
  });
});

describe('each key test fails when the line it guards is broken', () => {
  const broken: [string, string, string, (s: string) => string, string][] = [
    ['fibonacci', 'fibonacci.js', 'the starting numbers', s => s.replace('out.push(a)', 'out.push(a + 1)'), 'fibonacci(5) is [0, 1, 1, 2, 3]'],
    ['fibonacci', 'fibonacci.js', 'a negative input is rejected', s => s.replace('|| n < 0', ''), 'fibonacci(-1) is rejected'],
    ['fibonacci', 'fibonacci.js', 'a fraction is rejected', s => s.replace('!Number.isInteger(n) ||', ''), 'fibonacci(2.5) is rejected'],
    ['fibonacci', 'fibonacci.js', 'the limit is not included', s => s.replace('a < limit', 'a <= limit'), 'fibonacciUpTo(8) does not include 8'],
    ['word-count', 'wordcount.js', 'case is ignored', s => s.replace('text.toLowerCase()', 'text'), 'wordCount ignores case'],
    ['word-count', 'wordcount.js', 'an apostrophe stays inside a word', s => s.replace("(?:'[\\p{L}\\p{N}]+)*", ''), 'wordCount keeps an apostrophe inside a word'],
    ['word-count', 'wordcount.js', 'a tie goes alphabetically', s => s.replace(' || a[0].localeCompare(b[0])', ''), 'topWords breaks a tie alphabetically'],
    ['word-count', 'wordcount.js', 'n of zero gives nothing', s => s.replace('.slice(0, Math.max(0, n))', '.slice(0, n || 1)'), 'topWords with n of zero is empty'],
  ];
  test.each(broken)('%s: %s', (id, file, _what, edit, name) => {
    const solution = id === 'fibonacci' ? FIB : WORDS;
    expect(edit(solution)).not.toBe(solution);   // the edit really changed something
    const { run } = runTests(id, file, () => edit(solution), name);
    expect(run.cases.map(c => [c.name, c.status])).toEqual([[name, 'fail']]);
  });
});
