/**
 * Live Coding Exercise, Word Count
 *
 * Implement the two functions below. You can change this file freely and add your own helpers.
 * Run with: node wordcount.js
 * Check it with the tests: node --test wordcount.test.js (the Run tests button does the same)
 */

/**
 * Counts how often each word appears. Words ignore case and punctuation, and `don't` stays one word.
 * wordCount('The cat and the hat.') -> { the: 2, cat: 1, and: 1, hat: 1 }
 *
 * @param {string} text
 * @returns {Record<string, number>}
 */
function wordCount(text) {
  // TODO: implement this
}

/**
 * The `n` most frequent words as [word, count] pairs, most frequent first.
 * A tie is broken alphabetically.
 * topWords('b a b a c', 2) -> [['a', 2], ['b', 2]]
 *
 * @param {string} text
 * @param {number} n
 * @returns {Array<[string, number]>}
 */
function topWords(text, n) {
  // TODO: implement this
}

// -- Try it ---------------------------------------------------------------------

console.log(wordCount('The cat and the hat.'));   // expected: { the: 2, cat: 1, and: 1, hat: 1 }
console.log(topWords('b a b a c', 2));            // expected: [ [ 'a', 2 ], [ 'b', 2 ] ]

module.exports = { wordCount, topWords };
