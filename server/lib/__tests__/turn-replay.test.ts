import { describe, expect, test } from 'vitest';
import { ClaudeProxy } from '../claude-proxy.js';

const proxy = () => new ClaudeProxy('s', '/tmp/does-not-matter');

describe('turn replay', () => {
  test('keeps the events of the current turn in order', () => {
    const p = proxy();
    p.emit('event', { type: 'message_start' });
    p.emit('event', { type: 'text', text: 'Hel' });
    p.emit('event', { type: 'text', text: 'lo' });
    expect(p.turnSnapshot()).toEqual([{ type: 'message_start' }, { type: 'text', text: 'Hel' }, { type: 'text', text: 'lo' }]);
  });

  test('a new turn replaces the old one', () => {
    const p = proxy();
    p.emit('event', { type: 'message_start' });
    p.emit('event', { type: 'text', text: 'old' });
    p.emit('event', { type: 'message_start' });
    expect(p.turnSnapshot()).toEqual([{ type: 'message_start' }]);
  });

  test('is not busy until a message is sent', () => {
    expect(proxy().isProcessing).toBe(false);
  });
});
