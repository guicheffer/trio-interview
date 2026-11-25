/**
 * The tests of an exercise. `exercise.json` can declare them in an optional `tests` block:
 *
 *   "tests": { "command": "node --test", "files": ["fibonacci.test.js"], "description": "Check fibonacci.js",
 *              "cases": ["fibonacci(0) is an empty array"] }
 *
 * `command` and `files` make the line the terminal types. `cases` is optional: the names the panel lists before the first
 * run. Names that are not declared show up after a run anyway. Plain data and strings, so a test can check all of it.
 */

export interface TestsConfig {
  /** The runner, for example `node --test`. The files come after it */
  command: string;
  /** Test files, relative to the exercise folder */
  files: string[];
  description: string | null;
  /** Names of the tests, listed as "not run" until they run */
  cases: string[];
}

export interface ParsedTests {
  config: TestsConfig | null;
  /** Why a block was not used, in plain words. Empty when there is no block or it is fine */
  errors: string[];
}

const SAFE_WORD = /^[A-Za-z0-9_@%+=:,./-]+$/;
const unsafePath = (p: string) => p.startsWith('/') || p.startsWith('~') || p.includes('..') || !SAFE_WORD.test(p);

/** Reads the `tests` block of exercise.json. A block that cannot be used is left out and the reasons are returned */
export function parseTestsConfig(raw: unknown): ParsedTests {
  if (raw === undefined || raw === null) return { config: null, errors: [] };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { config: null, errors: ['"tests" must be an object'] };
  const block = raw as Record<string, unknown>;
  const errors: string[] = [];

  const command = typeof block.command === 'string' ? block.command.trim() : '';
  if (!command) errors.push('"tests.command" is needed, for example "node --test"');
  else if (/[\n\r;&|<>`$]/.test(command)) errors.push('"tests.command" must be one plain command, without ; & | < > ` or $');

  const files = Array.isArray(block.files) ? block.files : [];
  if (!files.length) errors.push('"tests.files" needs at least one test file');
  else if (!files.every(f => typeof f === 'string' && f && !unsafePath(f))) errors.push('"tests.files" must be file names inside the exercise, with no .. and no leading /');

  if (block.cases !== undefined && !Array.isArray(block.cases)) errors.push('"tests.cases" must be a list of names');
  const cases = Array.isArray(block.cases) ? block.cases.filter((c): c is string => typeof c === 'string' && c.trim().length > 0).map(c => c.trim()) : [];
  if (new Set(cases).size !== cases.length) errors.push('"tests.cases" has a name twice');

  if (errors.length) return { config: null, errors };
  const description = typeof block.description === 'string' && block.description.trim() ? block.description.trim() : null;
  return { config: { command, files: files as string[], description, cases }, errors: [] };
}

/**
 * A regular expression that matches exactly one test name, safe to type in the terminal. Letters and digits stay and a space
 * becomes `\s`; every run of other characters becomes `[^A-Za-z0-9\s]+`, so there is nothing to escape, the line has no `..`,
 * no quote, and `fibonacci(1)` cannot also match `fibonacciUpTo(1)`.
 */
export function namePattern(name: string): string {
  const body = name.trim().replace(/[^A-Za-z0-9 ]+/g, '[^A-Za-z0-9\\s]+').replace(/ /g, '\\s');
  return `^${body}$`;
}

/** The line that runs the tests, or only the one named test */
export function testsCommand(tests: TestsConfig, only?: string): string {
  const select = only ? ` --test-name-pattern='${namePattern(only)}'` : '';
  return `${tests.command}${select} ${tests.files.join(' ')}`;
}

/** The script and then the tests. A `;` and not `&&`, so the tests run even when the script fails */
export function bothCommand(start: string, tests: TestsConfig): string {
  return `${start}; ${testsCommand(tests)}`;
}

export type CommandKind = 'run' | 'tests' | 'test' | 'both';

/** What a command the terminal ran stands for, so the page knows when to read test results from its output */
export function classifyCommand(command: string | null | undefined, start: string | null | undefined, tests: TestsConfig | null): CommandKind | null {
  if (!command) return null;
  if (tests) {
    if (start && command === bothCommand(start, tests)) return 'both';
    if (command === testsCommand(tests)) return 'tests';
    if (command.startsWith(`${tests.command} --test-name-pattern=`) && command.endsWith(` ${tests.files.join(' ')}`)) return 'test';
  }
  if (start && command === start) return 'run';
  return null;
}

export interface RunButtons {
  run: boolean;
  tests: boolean;
  /** The script and then the tests. Only for a script that ends: an app that serves HTTP never gives the tests their turn */
  both: boolean;
}

/** Which of Run, Run tests and Run both an exercise shows */
export function runButtons(run: { start: string | null; port: number | null }, tests: TestsConfig | null): RunButtons {
  const hasRun = !!run.start;
  return { run: hasRun, tests: !!tests, both: hasRun && !!tests && !run.port };
}

// ---- reading what the runner printed ----

/** `idle` is a test the exercise lists that has not run yet */
export type CaseStatus = 'pass' | 'fail' | 'skip' | 'todo' | 'idle';

export interface TestCase {
  name: string;
  status: CaseStatus;
  /** Names of the groups it sits in, outermost first */
  suite: string[];
  ms: number | null;
}

export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  /** Listed by the exercise, not run yet */
  notRun?: number;
}

export interface TestRun {
  cases: TestCase[];
  summary: TestSummary;
}

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;
const LINE = /^(\s*)([✔✖﹣▶])\s+(.*)$/u;
const TIMING = /\s+\(([\d.]+)ms\)$/;
const NOTE = /\s+# (SKIP|TODO)\b.*$/i;
const COUNT = /^\s*ℹ\s+(tests|pass|fail|skipped|todo|cancelled)\s+(\d+)\s*$/u;

/**
 * Reads the output of `node --test` with the spec reporter (what it prints in a terminal) and returns the tests with how each ended,
 * plus the totals. Null when no tests ran at all, for example when the runner could not start. The output may hold other text
 * before it, such as what the script printed, and the details of failures after it. Those are ignored.
 */
export function parseSpecOutput(output: string): TestRun | null {
  const lines = output.replace(ANSI, '').split(/\r?\n/);
  const cases: TestCase[] = [];
  const counts: Record<string, number> = {};
  const open: { indent: number; name: string }[] = [];
  let sawSummary = false;

  for (const line of lines) {
    const count = COUNT.exec(line);
    if (count) { counts[count[1]] = Number(count[2]); sawSummary = true; continue; }
    if (sawSummary && /^\s*✖\s+failing tests:/u.test(line)) break;   // details of the failures, the cases are already above
    if (sawSummary) continue;
    const m = LINE.exec(line);
    if (!m) continue;
    const indent = m[1].length;
    const mark = m[2];
    let name = m[3];
    if (mark === '▶') { open.push({ indent, name: name.replace(TIMING, '') }); continue; }

    let status: CaseStatus = mark === '✔' ? 'pass' : mark === '✖' ? 'fail' : 'skip';
    const note = NOTE.exec(name);
    if (note) { name = name.replace(NOTE, ''); if (note[1].toUpperCase() === 'TODO') status = status === 'fail' ? 'fail' : 'todo'; else status = 'skip'; }
    const timing = TIMING.exec(name);
    const ms = timing ? Number(timing[1]) : null;
    name = name.replace(TIMING, '').trim();

    // A group is printed twice: "▶ name" when it starts and "✔ name (ms)" when it ends. The second one is not a test
    const group = open.length ? open[open.length - 1] : null;
    if (group && group.indent === indent && group.name === name) { open.pop(); continue; }
    while (open.length && open[open.length - 1].indent >= indent) open.pop();
    cases.push({ name, status, suite: open.map(o => o.name), ms });
  }

  if (!cases.length && !sawSummary) return null;
  const summary: TestSummary = {
    total: counts.tests ?? cases.length,
    passed: counts.pass ?? cases.filter(c => c.status === 'pass').length,
    failed: counts.fail ?? cases.filter(c => c.status === 'fail').length,
    skipped: (counts.skipped ?? 0) + (counts.todo ?? 0),
  };
  return { cases, summary };
}

/** "9 passed" or "2 failed, 7 passed" */
export function summaryText(summary: TestSummary): string {
  const parts: string[] = [];
  if (summary.failed) parts.push(`${summary.failed} failed`);
  parts.push(`${summary.passed} passed`);
  if (summary.skipped) parts.push(`${summary.skipped} skipped`);
  return parts.join(', ');
}

export const testsPassed = (summary: TestSummary): boolean => summary.failed === 0 && summary.passed > 0;

/**
 * Keeps what an earlier run found and lays a newer one over it, test by test. Running a single test then updates its row and leaves
 * the others as they were. `declared` are the names the exercise lists, which stay as "not run" until they run.
 */
export function mergeRuns(previous: TestCase[], next: TestCase[], declared: string[] = []): TestCase[] {
  const byName = new Map<string, TestCase>();
  for (const name of declared) byName.set(name, { name, status: 'idle', suite: [], ms: null });
  for (const c of previous) byName.set(c.name, c);
  for (const c of next) byName.set(c.name, c);
  return [...byName.values()];
}

/** Totals of a list of cases, for the line over the panel after a single test ran */
export function summarize(cases: TestCase[]): TestSummary {
  return {
    total: cases.length,
    passed: cases.filter(c => c.status === 'pass').length,
    failed: cases.filter(c => c.status === 'fail').length,
    skipped: cases.filter(c => c.status === 'skip' || c.status === 'todo').length,
    notRun: cases.filter(c => c.status === 'idle').length,
  };
}

/**
 * The last finished run of the tests in a terminal's saved text (what a screen that reloads or joins late is sent), so the panel
 * can show it again. Null when the text holds no finished run. `single` says that run was one test, which only updates its row.
 */
export function lastTestRun(text: string, tests: TestsConfig): { run: TestRun; single: boolean } | null {
  const plain = text.replace(ANSI, '').replace(/\r/g, '');
  const at = plain.lastIndexOf(`${tests.command} `);
  if (at < 0) return null;
  const tail = plain.slice(at);
  if (!/^\s*ℹ\s+tests\s+\d+\s*$/mu.test(tail)) return null;   // still running, or never finished
  const run = parseSpecOutput(tail);
  return run ? { run, single: /^[^\n]*--test-name-pattern=/.test(tail) } : null;
}
