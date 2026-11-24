import { describe, expect, test } from 'vitest';
import { editEventsFor } from '../stream-events.js';

const WORK = '/work/maria/demo';
const assistant = (...content: unknown[]) => ({ type: 'assistant', message: { content } });
const tool = (name: string, file_path: unknown) => ({ type: 'tool_use', name, input: { file_path } });

describe('editEventsFor', () => {
  test('a write tool reports the file being edited and the relative path that changed', () => {
    const events = editEventsFor(assistant(tool('Edit', `${WORK}/src/app.ts`)), WORK);

    expect(events).toEqual([
      { name: 'editing-file', data: { filePath: `${WORK}/src/app.ts` } },
      { name: 'file-changed', data: { filePath: 'src/app.ts' } },
    ]);
  });

  test('a read tool only reports the file being looked at', () => {
    expect(editEventsFor(assistant(tool('Read', 'src/app.ts')), WORK)).toEqual([
      { name: 'editing-file', data: { filePath: 'src/app.ts' } },
    ]);
  });

  test('a relative path is kept as it is', () => {
    const events = editEventsFor(assistant(tool('Write', 'notes.md')), WORK);
    expect(events.map(e => e.data.filePath)).toEqual(['notes.md', 'notes.md']);
  });

  test('a file outside the candidate folder is not reported as changed', () => {
    const events = editEventsFor(assistant(tool('Write', '/etc/hosts')), WORK);
    expect(events.map(e => e.name)).toEqual(['editing-file']);
  });

  test('ignores everything that is not a tool call on a file', () => {
    expect(editEventsFor(null, WORK)).toEqual([]);
    expect(editEventsFor({ type: 'user' }, WORK)).toEqual([]);
    expect(editEventsFor({ type: 'assistant', message: { content: 'text' } }, WORK)).toEqual([]);
    expect(editEventsFor(assistant({ type: 'text', text: 'hi' }, tool('Write', 42)), WORK)).toEqual([]);
  });

  test('handles several tool calls in one message', () => {
    const events = editEventsFor(assistant(tool('Write', 'a.ts'), tool('Read', 'b.ts')), WORK);
    expect(events.map(e => `${e.name}:${e.data.filePath}`)).toEqual(['editing-file:a.ts', 'file-changed:a.ts', 'editing-file:b.ts']);
  });
});
