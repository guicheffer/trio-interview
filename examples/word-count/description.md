# Word Count

## Objective

Count how often each word appears in a piece of text, using the AI assistant.

## Requirements

1. Create `wordCount(text)` that returns an object mapping each word to the number of times it appears
2. Words are compared ignoring case, so `The` and `the` are the same word
3. Punctuation is not part of a word: `end.` and `end` are the same word, but `don't` stays one word
4. Create `topWords(text, n)` that returns the `n` most frequent words as `[word, count]` pairs, most frequent first
5. When two words have the same count, the one that comes first alphabetically goes first
6. Write the implementation in `wordcount.js`

## Example Usage

```javascript
wordCount('The cat and the hat.');   // { the: 2, cat: 1, and: 1, hat: 1 }
topWords('b a b a c', 2);            // [['a', 2], ['b', 2]]
wordCount('');                       // {}
```

## Getting Started

1. Open `wordcount.js` in the file explorer
2. Ask the AI assistant to help you implement the functions
3. Run `node wordcount.js` to see which checks pass
4. Refine until every check passes, then talk through your choices

## Success Criteria

- Every check at the bottom of the file passes
- Edge cases are handled: empty text, only punctuation, extra spaces and line breaks
- The code is readable and you can explain it to the interviewer

## Tips

- Decide what counts as a word before you write code
- Think about what should happen with numbers and with words that have an apostrophe
- Test the ties in the ordering
