/**
 * Live Coding Exercise, Word Count
 *
 * Implement the two functions below. You can change this file freely and add your own helpers.
 * Run with: node wordcount.js
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

// -- Checks --------------------------------------------------------------------

let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`);
}

check('counts words', wordCount('the cat the'), { the: 2, cat: 1 });
check('ignores case', wordCount('The the THE'), { the: 3 });
check('ignores punctuation', wordCount('end. end, end!'), { end: 3 });
check('keeps an apostrophe inside a word', wordCount("don't stop"), { "don't": 1, stop: 1 });
check('empty text', wordCount(''), {});
check('only punctuation', wordCount('... !!! ,,,'), {});
check('extra spaces and line breaks', wordCount('a  b\n\nb\ta'), { a: 2, b: 2 });
check('top words, most frequent first', topWords('a b b c c c', 2), [['c', 3], ['b', 2]]);
check('ties go alphabetically', topWords('b a b a c', 2), [['a', 2], ['b', 2]]);
check('n larger than the number of words', topWords('x y', 5), [['x', 1], ['y', 1]]);
check('n of zero', topWords('x y', 0), []);

console.log(failed ? `\n${failed} check(s) failing` : '\nAll checks pass');

module.exports = { wordCount, topWords };
