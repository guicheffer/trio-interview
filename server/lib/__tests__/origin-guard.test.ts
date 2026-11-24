import { describe, expect, test } from 'vitest';
import { isForeignOrigin } from '../origin-guard.js';

const req = (headers: Record<string, string>) => ({ headers });

describe('origin guard', () => {
  test('the app itself and plain scripts pass', () => {
    expect(isForeignOrigin(req({ origin: 'http://localhost:3000' }))).toBe(false);
    expect(isForeignOrigin(req({ origin: 'http://127.0.0.1:3000' }))).toBe(false);
    expect(isForeignOrigin(req({}))).toBe(false);
    expect(isForeignOrigin(req({ 'sec-fetch-site': 'same-origin' }))).toBe(false);
  });

  test('another site, a null origin and cross-site fetches are refused', () => {
    expect(isForeignOrigin(req({ origin: 'https://evil.example' }))).toBe(true);
    expect(isForeignOrigin(req({ origin: 'null' }))).toBe(true);
    expect(isForeignOrigin(req({ origin: 'http://localhost:4000' }))).toBe(true);
    expect(isForeignOrigin(req({ 'sec-fetch-site': 'cross-site' }))).toBe(true);
  });

  test('another origin on the same machine, such as the preview, is refused', () => {
    expect(isForeignOrigin(req({ origin: 'http://localhost:3099' }))).toBe(true);
    expect(isForeignOrigin(req({ 'sec-fetch-site': 'same-site' }))).toBe(true);
    expect(isForeignOrigin(req({ 'sec-fetch-site': 'none' }))).toBe(false);
  });
});
