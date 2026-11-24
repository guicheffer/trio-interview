import { describe, expect, test } from 'vitest';
import { ClaudeProxy } from '../claude-proxy.js';

const notes = (proxy: ClaudeProxy): string => (proxy as unknown as { takeReviewNotes(): string }).takeReviewNotes();

describe('review notes for the AI', () => {
  test('nothing was undone, nothing is said', () => {
    expect(notes(new ClaudeProxy('s', '/tmp/x'))).toBe('');
  });

  test('an undo is told once, with the next message only', () => {
    const proxy = new ClaudeProxy('s', '/tmp/x');
    proxy.noteReview('fibonacci.js', 'part');
    expect(notes(proxy)).toContain('undid part of your changes to fibonacci.js');
    expect(notes(proxy)).toBe('');
  });

  test('undoing everything wins over undoing a part', () => {
    const proxy = new ClaudeProxy('s', '/tmp/x');
    proxy.noteReview('a.js', 'part');
    proxy.noteReview('a.js', 'all');
    proxy.noteReview('a.js', 'part');
    expect(notes(proxy)).toContain('undid all of your changes to a.js');
  });

  test('each file gets its own line', () => {
    const proxy = new ClaudeProxy('s', '/tmp/x');
    proxy.noteReview('a.js', 'part');
    proxy.noteReview('b.js', 'all');
    expect(notes(proxy).split('\n')).toHaveLength(2);
  });

  test('taking an undo back removes the note', () => {
    const proxy = new ClaudeProxy('s', '/tmp/x');
    proxy.noteReview('a.js', 'all');
    proxy.noteReview('a.js', 'redo');
    expect(notes(proxy)).toBe('');
  });
});
