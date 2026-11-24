import { describe, expect, test } from 'vitest';
import { linkFiles, parseFileLink, resolveFile } from '../fileLinks';

const files = ['fibonacci.js', 'src/server/app.ts', 'src/client/App.tsx', 'a/index.ts', 'b/index.ts', 'plans/PLAN-1-x.md'];

describe('resolveFile', () => {
  test('matches a full path, and a bare name only when it is unique', () => {
    expect(resolveFile('src/server/app.ts', files)).toBe('src/server/app.ts');
    expect(resolveFile('app.ts', files)).toBe('src/server/app.ts');
    expect(resolveFile('./fibonacci.js', files)).toBe('fibonacci.js');
    expect(resolveFile('index.ts', files)).toBeNull();
    expect(resolveFile('missing.ts', files)).toBeNull();
  });
});

describe('linkFiles', () => {
  test('links plain mentions and mentions in inline code', () => {
    expect(linkFiles('Edit fibonacci.js now', files)).toBe('Edit [fibonacci.js](trio-file:fibonacci.js) now');
    expect(linkFiles('Open `src/server/app.ts` please', files)).toBe('Open [`src/server/app.ts`](trio-file:src/server/app.ts) please');
  });

  test('keeps a line number', () => {
    expect(linkFiles('see app.ts:42.', files)).toBe('see [app.ts:42](trio-file:src/server/app.ts#42).');
  });

  test('leaves code blocks, existing links and unknown names alone', () => {
    const block = '```js\nrequire("fibonacci.js")\n```';
    expect(linkFiles(block, files)).toBe(block);
    expect(linkFiles('[fibonacci.js](https://x.dev)', files)).toBe('[fibonacci.js](https://x.dev)');
    expect(linkFiles('see other.js and index.ts', files)).toBe('see other.js and index.ts');
    expect(linkFiles('version 1.2.3 and e.g. ok', files)).toBe('version 1.2.3 and e.g. ok');
    expect(linkFiles('plain', [])).toBe('plain');
  });

  test('round trips through parseFileLink', () => {
    expect(parseFileLink('trio-file:plans/PLAN-1-x.md')).toEqual({ file: 'plans/PLAN-1-x.md' });
    expect(parseFileLink('trio-file:src/server/app.ts#42')).toEqual({ file: 'src/server/app.ts', line: 42 });
    expect(parseFileLink('https://x.dev')).toBeNull();
  });
});
