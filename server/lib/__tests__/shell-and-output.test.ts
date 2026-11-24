import { describe, expect, test } from 'vitest';
import { hasModuleSyntax, isPlainCd, trimSlashes, trimTrailingSlashes } from '../shell-command.js';
import { cleanTitle, detectPort, stripAnsi } from '../output-parsing.js';

describe('isPlainCd', () => {
  test('accepts cd with and without a target', () => {
    expect(isPlainCd('cd')).toBe(true);
    expect(isPlainCd('cd src')).toBe(true);
    expect(isPlainCd('cd   ../src/app')).toBe(true);
  });

  test('refuses other commands and shell operators', () => {
    expect(isPlainCd('cdx')).toBe(false);
    expect(isPlainCd('ls')).toBe(false);
    for (const tail of ['; rm -rf /', '&& ls', '| cat', '$(whoami)', '`id`', '> out', '< in', '(x)']) {
      expect(isPlainCd(`cd src ${tail}`), tail).toBe(false);
    }
  });
});

describe('hasModuleSyntax', () => {
  test('sees import and export at the start of a line', () => {
    expect(hasModuleSyntax("import x from 'x';")).toBe(true);
    expect(hasModuleSyntax('const a = 1;\n  export const b = 2;')).toBe(true);
  });

  test('ignores words that only start the same way', () => {
    expect(hasModuleSyntax('const importantValue = 1;')).toBe(false);
    expect(hasModuleSyntax('exported();')).toBe(false);
    expect(hasModuleSyntax('')).toBe(false);
  });
});

describe('slash trimming', () => {
  test('trims the ends only', () => {
    expect(trimTrailingSlashes('a/b///')).toBe('a/b');
    expect(trimTrailingSlashes('///')).toBe('');
    expect(trimSlashes('//a/b//')).toBe('a/b');
    expect(trimSlashes('a//b')).toBe('a//b');
  });
});

describe('output parsing', () => {
  test('strips colour codes', () => {
    expect(stripAnsi(`${String.fromCharCode(27)}[32mready${String.fromCharCode(27)}[0m`)).toBe('ready');
  });

  test('finds the port a dev server announces', () => {
    expect(detectPort('  Local:   http://localhost:5173/')).toBe(5173);
    expect(detectPort('http://127.0.0.1:3002')).toBe(3002);
    expect(detectPort('Server listening on 8080')).toBe(8080);
    expect(detectPort('running at port 4000')).toBe(4000);
    expect(detectPort('started on port 4321')).toBe(4321);
  });

  test('returns null when there is no port', () => {
    expect(detectPort('compiled successfully')).toBeNull();
    expect(detectPort('')).toBeNull();
  });
});

describe('cleanTitle', () => {
  test('removes quotes, markdown marks and the final period', () => {
    expect(cleanTitle('  "**Fix the login bug.**"  ')).toBe('Fix the login bug');
    expect(cleanTitle('# Plan the API\nextra line')).toBe('Plan the API');
  });

  test('limits the length', () => {
    expect(cleanTitle('a'.repeat(100))).toHaveLength(40);
  });

  test('returns an empty title for empty output', () => {
    expect(cleanTitle('')).toBe('');
    expect(cleanTitle('   ')).toBe('');
  });
});
