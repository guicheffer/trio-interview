import { describe, expect, test } from 'vitest';
import { isRunTarget } from '../runTarget.js';

describe('run target', () => {
  test('a file named in the run command can be run from the editor', () => {
    expect(isRunTarget('fibonacci.js', 'node fibonacci.js')).toBe(true);
    expect(isRunTarget('src/main.py', 'python3 src/main.py')).toBe(true);
    expect(isRunTarget('src/main.py', 'cd src && python3 main.py')).toBe(true);
  });

  test('a project exercise keeps Run in the terminal, not on every source file', () => {
    const start = 'cd codebase && npm install && npm run db:migrate && npm run dev';
    expect(isRunTarget('codebase/src/client/pages/Dashboard.tsx', start)).toBe(false);
    expect(isRunTarget('codebase/package.json', start)).toBe(false);
  });

  test('nothing is runnable without a file or a run command', () => {
    expect(isRunTarget(null, 'node a.js')).toBe(false);
    expect(isRunTarget('a.js', null)).toBe(false);
    expect(isRunTarget('a.js', '')).toBe(false);
  });
});
