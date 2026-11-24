import { describe, expect, test } from 'vitest';
import { previewSrc } from '../previewOrigin';

const at = (hostname: string, port = '3000', protocol = 'http:') => ({ hostname, port, protocol });

describe('previewSrc', () => {
  test('the interviewer sees the candidate app from its own origin', () => {
    expect(previewSrc('/preview/ana/demo/', at('localhost'))).toBe('http://localhost:3099/preview/ana/demo/');
    expect(previewSrc('/preview/ana/demo/', at('127.0.0.1'))).toBe('http://localhost:3099/preview/ana/demo/');
  });

  test('a candidate, on a tunnel or candidate.localhost, stays on the page origin', () => {
    expect(previewSrc('/preview/ana/demo/', at('x.ngrok-free.dev', '', 'https:'))).toBe('/preview/ana/demo/');
    expect(previewSrc('/preview/ana/demo/', at('candidate.localhost'))).toBe('/preview/ana/demo/');
  });

  test('the full address of this server is moved too', () => {
    expect(previewSrc('http://localhost:3000/preview/ana/demo/?a=1', at('localhost'))).toBe('http://localhost:3099/preview/ana/demo/?a=1');
    expect(previewSrc('http://127.0.0.1:3000/preview/ana/demo/', at('localhost'))).toBe('http://localhost:3099/preview/ana/demo/');
    expect(previewSrc('http://localhost:4000/x', at('localhost'))).toBe('http://localhost:4000/x');
  });

  test('only paths on this server are moved', () => {
    expect(previewSrc('https://other.example/x', at('localhost'))).toBe('https://other.example/x');
    expect(previewSrc('/p', undefined)).toBe('/p');
  });
});
