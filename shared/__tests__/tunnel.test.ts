import { describe, expect, test } from 'vitest';
import { tunnelStatus } from '../tunnel.js';

const has = (...programs: string[]) => (program: string) => programs.includes(program);

describe('what each tunnel needs from the interviewer', () => {
  test('no tunnel needs nothing', () => {
    expect(tunnelStatus('none', has(), () => false).ready).toBe(true);
  });

  test('ngrok needs the program and a token, and says which one is missing', () => {
    const none = tunnelStatus('ngrok', has(), () => false);
    expect(none.ready).toBe(false);
    expect(none.fix).toContain('brew install ngrok');

    const noToken = tunnelStatus('ngrok', has('ngrok'), () => false);
    expect(noToken.ready).toBe(false);
    expect(noToken.fix).toContain('ngrok config add-authtoken');

    expect(tunnelStatus('ngrok', has('ngrok'), () => true).ready).toBe(true);
  });

  test('cloudflared needs only the program, and says what it cannot carry', () => {
    expect(tunnelStatus('cloudflared', has(), () => true)).toMatchObject({ ready: false, fix: 'brew install cloudflared' });
    const ready = tunnelStatus('cloudflared', has('cloudflared'), () => false);
    expect(ready.ready).toBe(true);
    expect(ready.message).toMatch(/no account/);
    expect(ready.message).toMatch(/Agent mode/);
  });

  test('one tunnel being installed does not make another ready', () => {
    expect(tunnelStatus('ngrok', has('cloudflared'), () => true).ready).toBe(false);
    expect(tunnelStatus('cloudflared', has('ngrok'), () => true).ready).toBe(false);
  });
});
