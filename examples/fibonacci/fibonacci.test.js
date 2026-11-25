// Tests for fibonacci.js. They are examples of how the two functions should behave.
// Run them with the "Run tests" button, or in the terminal: node --test fibonacci.test.js
const test = require('node:test');
const assert = require('node:assert');
const { fibonacci, fibonacciUpTo } = require('./fibonacci');

test('fibonacci(0) is an empty array', () => {
  assert.deepStrictEqual(fibonacci(0), []);
});

test('fibonacci(1) is [0]', () => {
  assert.deepStrictEqual(fibonacci(1), [0]);
});

test('fibonacci(5) is [0, 1, 1, 2, 3]', () => {
  assert.deepStrictEqual(fibonacci(5), [0, 1, 1, 2, 3]);
});

test('fibonacci(10) is the first ten numbers', () => {
  assert.deepStrictEqual(fibonacci(10), [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]);
});

test('fibonacci(-1) is rejected', () => {
  assert.throws(() => fibonacci(-1));
});

test('fibonacci(2.5) is rejected', () => {
  assert.throws(() => fibonacci(2.5));
});

test('fibonacciUpTo(10) stops before the limit', () => {
  assert.deepStrictEqual(fibonacciUpTo(10), [0, 1, 1, 2, 3, 5, 8]);
});

test('fibonacciUpTo(8) does not include 8', () => {
  assert.deepStrictEqual(fibonacciUpTo(8), [0, 1, 1, 2, 3, 5]);
});

test('fibonacciUpTo(0) is an empty array', () => {
  assert.deepStrictEqual(fibonacciUpTo(0), []);
});

test('fibonacciUpTo(1) is [0]', () => {
  assert.deepStrictEqual(fibonacciUpTo(1), [0]);
});
