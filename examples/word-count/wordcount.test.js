// Tests for wordcount.js. They are examples of how the two functions should behave.
// Run them with the "Run tests" button, or in the terminal: node --test wordcount.test.js
const test = require('node:test');
const assert = require('node:assert');
const { wordCount, topWords } = require('./wordcount');

test('wordCount counts each word', () => {
  assert.deepStrictEqual(wordCount('the cat the'), { the: 2, cat: 1 });
});

test('wordCount ignores case', () => {
  assert.deepStrictEqual(wordCount('The the THE'), { the: 3 });
});

test('wordCount ignores punctuation', () => {
  assert.deepStrictEqual(wordCount('end. end, end!'), { end: 3 });
});

test('wordCount keeps an apostrophe inside a word', () => {
  assert.deepStrictEqual(wordCount("don't stop"), { "don't": 1, stop: 1 });
});

test('wordCount of empty text is empty', () => {
  assert.deepStrictEqual(wordCount(''), {});
});

test('wordCount of only punctuation is empty', () => {
  assert.deepStrictEqual(wordCount('... !!! ,,,'), {});
});

test('wordCount handles extra spaces and line breaks', () => {
  assert.deepStrictEqual(wordCount('a  b\n\nb\ta'), { a: 2, b: 2 });
});

test('topWords puts the most frequent first', () => {
  assert.deepStrictEqual(topWords('a b b c c c', 2), [['c', 3], ['b', 2]]);
});

test('topWords breaks a tie alphabetically', () => {
  assert.deepStrictEqual(topWords('b a b a c', 2), [['a', 2], ['b', 2]]);
});

test('topWords with n larger than the number of words', () => {
  assert.deepStrictEqual(topWords('x y', 5), [['x', 1], ['y', 1]]);
});

test('topWords with n of zero is empty', () => {
  assert.deepStrictEqual(topWords('x y', 0), []);
});
