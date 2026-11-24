# Word Count

A 20 minute Node exercise with one file and no dependencies, a step up from Fibonacci. The candidate implements `wordCount` and `topWords` in `wordcount.js` until the eleven checks at the bottom pass, and runs them with `node wordcount.js`.

## What to watch

- Whether the candidate decides what counts as a word before writing code, and says it out loud.
- How the assistant is used: a good session asks for the edge cases first, or reads the checks, instead of pasting the brief and accepting the answer.
- Whether they notice the apostrophe rule (`don't` is one word) and the alphabetical tie break, which are the two checks a first attempt usually fails.

## Reference solution

```javascript
function wordCount(text) {
  const counts = {};
  for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) ?? []) counts[word] = (counts[word] ?? 0) + 1;
  return counts;
}

function topWords(text, n) {
  return Object.entries(wordCount(text))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(0, n));
}
```

## Good follow up questions

- What happens with `"Don't"` written with a curly apostrophe, and should it count?
- How would this change for a text of a few gigabytes that does not fit in memory?
- What would you change to count words in a language that does not separate them with spaces?
