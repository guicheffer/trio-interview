// The landing page prints what the exercise code logs with scripts/inspect-lite.cjs. It has to read like the real terminal,
// so every value here is compared with what Node itself prints with util.inspect.
import { createRequire } from 'module';
import { inspect } from 'util';
import { describe, expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const lite = require('../inspect-lite.cjs') as { format(v: unknown): string; line(args: unknown[]): string };

let seed = 11;
const random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

describe('console.log formatting on the landing page', () => {
  test('matches util.inspect for arrays of many sizes and number widths', () => {
    let checked = 0;
    for (let n = 0; n <= 45; n++) {
      for (const digits of [1, 2, 3, 5, 7, 8, 9, 10, 12]) {
        const max = 10 ** digits;
        for (const value of [Array.from({ length: n }, () => Math.floor(random() * max)), Array.from({ length: n }, (_, i) => i * max)]) {
          expect(lite.format(value), JSON.stringify(value)).toBe(inspect(value));
          checked++;
        }
      }
      for (const value of [Array.from({ length: n }, (_, i) => 'w'.repeat(1 + (i % 9))), Array.from({ length: n }, (_, i) => [i, 'x'])]) {
        expect(lite.format(value)).toBe(inspect(value));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(900);
  });

  test('matches util.inspect for what the exercises print', () => {
    const fib = (n: number) => { const out: number[] = []; for (let i = 0, a = 0, b = 1; i < n; i++, [a, b] = [b, a + b]) out.push(a); return out; };
    for (let n = 0; n <= 40; n++) expect(lite.format(fib(n))).toBe(inspect(fib(n)));
    for (const value of [[['b', 2], ['a', 2]], { the: 2, cat: 1, and: 1, hat: 1 }, {}, [], undefined, null, 42, { a: { b: { c: { d: 1 } } } }, "it's"]) {
      expect(lite.format(value)).toBe(inspect(value));
    }
  });

  test('console.log prints strings as they are and the rest inspected, joined by a space', () => {
    expect(lite.line(['fibonacci(10):', [0, 1, 1]])).toBe('fibonacci(10): [ 0, 1, 1 ]');
    expect(lite.line(['done'])).toBe('done');
  });
});
