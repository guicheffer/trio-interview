/**
 * Live Coding Challenge, Fibonacci
 *
 * Implement the functions below. You can modify this file freely.
 * Feel free to add new functions, imports, or files as needed.
 *
 * Run with: node fibonacci.js
 */

/**
 * Returns an array with the first `n` Fibonacci numbers.
 * fibonacci(0) → []
 * fibonacci(1) → [0]
 * fibonacci(5) → [0, 1, 1, 2, 3]
 * Invalid input (negative or not an integer) should be rejected.
 *
 * @param {number} n
 * @returns {number[]}
 */
function fibonacci(n) {
  // TODO: implement this
}

/**
 * Returns an array of Fibonacci numbers up to (but not including) `limit`.
 * fibonacciUpTo(10) → [0, 1, 1, 2, 3, 5, 8]
 *
 * @param {number} limit
 * @returns {number[]}
 */
function fibonacciUpTo(limit) {
  // TODO: implement this
}

// ── Test your solution ────────────────────────────────────────────────────────

console.log('fibonacci(0):', fibonacci(0));   // expected: []
console.log('fibonacci(1):', fibonacci(1));   // expected: [0]
console.log('fibonacci(10):', fibonacci(10)); // expected: [0,1,1,2,3,5,8,13,21,34]
console.log('fibonacciUpTo(20):', fibonacciUpTo(20)); // expected: [0,1,1,2,3,5,8,13]

module.exports = { fibonacci, fibonacciUpTo };
