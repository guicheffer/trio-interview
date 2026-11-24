import { describe, expect, test } from 'vitest';
import { cleanScrollback } from '../scrollback';

describe('cleanScrollback', () => {
  test('drops restore markers, reconnect notes and the disconnect notice', () => {
    const lines = ['--- previous session restored ---', 'ls', '--- earlier session', '--- reconnected', 'Terminal disconnected, retrying', 'done'];
    expect(cleanScrollback(lines)).toEqual(['ls', 'done']);
  });

  test('drops the attach banner and empty prompts but keeps prompts with a command', () => {
    const lines = ['● maria / fibonacci', 'maria/fibonacci $', 'maria/fibonacci $ ', 'maria/fibonacci $ ls', 'a prompt-like $'];
    expect(cleanScrollback(lines)).toEqual(['maria/fibonacci $ ls', 'a prompt-like $']);
  });

  test('collapses runs of blank lines into one', () => {
    expect(cleanScrollback(['a', '', '', '   ', 'b', ''])).toEqual(['a', '', 'b', '']);
  });

  test('handles an empty list', () => {
    expect(cleanScrollback([])).toEqual([]);
  });
});
