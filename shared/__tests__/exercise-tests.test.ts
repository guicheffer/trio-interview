import { describe, expect, test } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  bothCommand, classifyCommand, mergeRuns, namePattern, parseSpecOutput, parseTestsConfig, runButtons, summarize, summaryText, testsCommand, testsPassed,
  type TestsConfig,
} from '../exercise-tests.js';

const tests: TestsConfig = { command: 'node --test', files: ['a.test.js'], description: null, cases: [] };

describe('the tests block of exercise.json', () => {
  test('no block means no tests and no complaint', () => {
    expect(parseTestsConfig(undefined)).toEqual({ config: null, errors: [] });
    expect(parseTestsConfig(null)).toEqual({ config: null, errors: [] });
  });

  test('a command and files are enough', () => {
    expect(parseTestsConfig({ command: 'node --test', files: ['a.test.js'] }).config).toEqual({ command: 'node --test', files: ['a.test.js'], description: null, cases: [] });
  });

  test('keeps the description and the listed names, and drops what is not text', () => {
    const { config } = parseTestsConfig({ command: ' node --test ', files: ['t/a.test.js'], description: ' Check it ', cases: ['one', 7, '  two  ', ''] });
    expect(config).toEqual({ command: 'node --test', files: ['t/a.test.js'], description: 'Check it', cases: ['one', 'two'] });
  });

  test.each([
    ['a string', 'node --test', /object/],
    ['a list', [], /object/],
    ['no command', { files: ['a.js'] }, /command/],
    ['an empty command', { command: ' ', files: ['a.js'] }, /command/],
    ['a command with a pipe', { command: 'node --test | cat', files: ['a.js'] }, /plain command/],
    ['a command with a semicolon', { command: 'node --test; rm x', files: ['a.js'] }, /plain command/],
    ['a command with a substitution', { command: 'node --test $(x)', files: ['a.js'] }, /plain command/],
    ['no files', { command: 'node --test' }, /files/],
    ['an empty file list', { command: 'node --test', files: [] }, /files/],
    ['a file that leaves the exercise', { command: 'node --test', files: ['../x.js'] }, /inside the exercise/],
    ['an absolute file', { command: 'node --test', files: ['/etc/x.js'] }, /inside the exercise/],
    ['a file with a space', { command: 'node --test', files: ['a b.js'] }, /inside the exercise/],
    ['a file that is not text', { command: 'node --test', files: [3] }, /inside the exercise/],
    ['cases that are not a list', { command: 'node --test', files: ['a.js'], cases: 'x' }, /list of names/],
    ['the same name twice', { command: 'node --test', files: ['a.js'], cases: ['x', 'x'] }, /twice/],
  ])('refuses %s and says why', (_label, raw, why) => {
    const result = parseTestsConfig(raw);
    expect(result.config).toBeNull();
    expect(result.errors.join(' ')).toMatch(why);
  });
});

describe('the commands the buttons type', () => {
  test('Run tests names the files after the runner', () => {
    expect(testsCommand({ ...tests, files: ['a.test.js', 'b.test.js'] })).toBe('node --test a.test.js b.test.js');
  });

  test('one test is picked by a pattern that matches that name only', () => {
    const line = testsCommand(tests, 'fibonacci(1) is [0]');
    expect(line).toBe("node --test --test-name-pattern='^fibonacci[^A-Za-z0-9\\s]+1[^A-Za-z0-9\\s]+\\sis\\s[^A-Za-z0-9\\s]+0[^A-Za-z0-9\\s]+$' a.test.js");
    const re = new RegExp(namePattern('fibonacci(1) is [0]'));
    expect(re.test('fibonacci(1) is [0]')).toBe(true);
    expect(re.test('fibonacciUpTo(1) is [0]')).toBe(false);
    expect(re.test('fibonacci(10) is [0]')).toBe(false);
  });

  test('a test name can never add to the line: quotes, dollars and dots turn into plain classes', () => {
    const pattern = namePattern(`a'; rm -rf $HOME .. "x" \`y\``);
    expect(pattern).not.toMatch(/['"`;]/);
    expect(pattern.slice(1, -1)).not.toMatch(/\$|\.\./);
  });

  test('Run both runs the script and then the tests, even when the script fails', () => {
    expect(bothCommand('node a.js', tests)).toBe('node a.js; node --test a.test.js');
  });

  test('a command is told apart from the others', () => {
    const start = 'node a.js';
    expect(classifyCommand(start, start, tests)).toBe('run');
    expect(classifyCommand(testsCommand(tests), start, tests)).toBe('tests');
    expect(classifyCommand(testsCommand(tests, 'one'), start, tests)).toBe('test');
    expect(classifyCommand(bothCommand(start, tests), start, tests)).toBe('both');
    expect(classifyCommand('ls', start, tests)).toBeNull();
    expect(classifyCommand(null, start, tests)).toBeNull();
    expect(classifyCommand(testsCommand(tests), start, null)).toBeNull();
  });
});

describe('which buttons an exercise shows', () => {
  test('a script with tests shows all three', () => {
    expect(runButtons({ start: 'node a.js', port: null }, tests)).toEqual({ run: true, tests: true, both: true });
  });
  test('an exercise without a tests block keeps Run only', () => {
    expect(runButtons({ start: 'node a.js', port: null }, null)).toEqual({ run: true, tests: false, both: false });
  });
  test('an app that serves a page has no Run both, because it never ends', () => {
    expect(runButtons({ start: 'npm run dev', port: 5173 }, tests)).toEqual({ run: true, tests: true, both: false });
  });
  test('tests with nothing to run still show Run tests', () => {
    expect(runButtons({ start: null, port: null }, tests)).toEqual({ run: false, tests: true, both: false });
  });
});

const SPEC = `fibonacci(0): undefined
✖ fibonacci(0) is an empty array (0.7ms)
✔ fibonacci(1) is [0] (0.2ms)
▶ a group
  ✔ inside ok (0.1ms)
  ✖ inside bad (0.3ms)
✖ a group (1.2ms)
﹣ skipped one (0.04ms) # SKIP
✔ later todo (0.03ms) # TODO
ℹ tests 6
ℹ suites 1
ℹ pass 2
ℹ fail 2
ℹ cancelled 0
ℹ skipped 1
ℹ todo 1
ℹ duration_ms 32.9

✖ failing tests:

test at x.test.js:3:1
✖ fibonacci(0) is an empty array (0.7ms)
  AssertionError
✔ not a case, this is inside the details (0.1ms)
`;

describe('reading what node --test prints', () => {
  const run = parseSpecOutput(SPEC)!;

  test('lists each test with how it ended, and the groups once', () => {
    expect(run.cases.map(c => [c.name, c.status, c.suite])).toEqual([
      ['fibonacci(0) is an empty array', 'fail', []],
      ['fibonacci(1) is [0]', 'pass', []],
      ['inside ok', 'pass', ['a group']],
      ['inside bad', 'fail', ['a group']],
      ['skipped one', 'skip', []],
      ['later todo', 'todo', []],
    ]);
    expect(run.cases[0].ms).toBeCloseTo(0.7);
  });

  test('takes the totals from the summary node prints, and stops at the failure details', () => {
    expect(run.summary).toEqual({ total: 6, passed: 2, failed: 2, skipped: 2 });
    expect(run.cases.some(c => c.name.startsWith('not a case'))).toBe(false);
  });

  test('ignores colors', () => {
    const colored = SPEC.replace(/^✔/gm, '\u001b[32m✔\u001b[39m').replace(/^✖/gm, '\u001b[31m✖\u001b[39m');
    expect(parseSpecOutput(colored)!.cases.map(c => c.status)).toEqual(run.cases.map(c => c.status));
  });

  test('says nothing ran when there are no tests in the output', () => {
    expect(parseSpecOutput('Error: Cannot find module\n')).toBeNull();
    expect(parseSpecOutput('')).toBeNull();
  });

  test('a file that cannot load is one failed test, the way node reports it', () => {
    const out = parseSpecOutput('SyntaxError: x\n✖ bad.test.js (24ms)\nℹ tests 1\nℹ pass 0\nℹ fail 1\nℹ skipped 0\nℹ todo 0\n')!;
    expect(out.summary).toEqual({ total: 1, passed: 0, failed: 1, skipped: 0 });
    expect(out.cases[0]).toMatchObject({ name: 'bad.test.js', status: 'fail' });
  });

  test('the summary text and the pass rule', () => {
    expect(summaryText(run.summary)).toBe('2 failed, 2 passed, 2 skipped');
    expect(summaryText({ total: 3, passed: 3, failed: 0, skipped: 0 })).toBe('3 passed');
    expect(testsPassed({ total: 3, passed: 3, failed: 0, skipped: 0 })).toBe(true);
    expect(testsPassed(run.summary)).toBe(false);
    expect(testsPassed({ total: 0, passed: 0, failed: 0, skipped: 0 })).toBe(false);
  });
});

describe('the list the panel keeps', () => {
  const mk = (name: string, status: 'pass' | 'fail'): { name: string; status: 'pass' | 'fail'; suite: string[]; ms: null } => ({ name, status, suite: [], ms: null });

  test('names the exercise lists show as not run until they run', () => {
    const merged = mergeRuns([], [], ['one', 'two']);
    expect(merged.map(c => [c.name, c.status])).toEqual([['one', 'idle'], ['two', 'idle']]);
    expect(summarize(merged)).toMatchObject({ total: 2, passed: 0, failed: 0, notRun: 2 });
  });

  test('a single test updates its own row and leaves the others as they were', () => {
    const first = mergeRuns([], [mk('one', 'fail'), mk('two', 'pass')], ['one', 'two']);
    const second = mergeRuns(first, [mk('one', 'pass')], ['one', 'two']);
    expect(second.map(c => [c.name, c.status])).toEqual([['one', 'pass'], ['two', 'pass']]);
  });

  test('a test nobody listed is added when it shows up', () => {
    expect(mergeRuns([mk('one', 'pass')], [mk('extra', 'fail')]).map(c => c.name)).toEqual(['one', 'extra']);
  });
});

describe('the parser against the real runner', () => {
  test('reads what this version of node prints', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trio-spec-'));
    try {
      writeFileSync(join(dir, 'x.test.js'), `const t=require('node:test');t('a (1)',()=>{});t.describe('g',()=>{t('b',()=>{throw new Error('x')});t('c',()=>{})});t('d',{skip:true},()=>{});`);
      const r = spawnSync(process.execPath, ['--test', 'x.test.js'], { cwd: dir, encoding: 'utf-8' });
      const run = parseSpecOutput(r.stdout)!;
      expect(run.cases.map(c => [c.name, c.status, c.suite.join('/')])).toEqual([['a (1)', 'pass', ''], ['b', 'fail', 'g'], ['c', 'pass', 'g'], ['d', 'skip', '']]);
      expect(run.summary).toEqual({ total: 4, passed: 2, failed: 1, skipped: 1 });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
