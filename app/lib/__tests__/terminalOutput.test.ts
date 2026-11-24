import { describe, expect, test } from 'vitest';
import { firstPreviewUrl, lastPreviewUrl } from '../terminalOutput';

const ESC = String.fromCharCode(27);

describe('preview urls in terminal output', () => {
  test('finds the address after "Preview ready:" even inside colors', () => {
    const line = `${ESC}[0;32m> Preview ready: ${ESC}[4;34mhttp://localhost:3000/preview/maria/demo/${ESC}[0m`;
    expect(firstPreviewUrl(line)).toBe('http://localhost:3000/preview/maria/demo/');
  });

  test('returns null when the output has none', () => {
    expect(firstPreviewUrl('compiled successfully')).toBeNull();
    expect(lastPreviewUrl('compiled successfully')).toBeNull();
  });

  test('the last one wins when a replay has several', () => {
    const text = 'Preview ready: https://a.example/preview/x/y/\nmore\nPreview ready: https://b.example/preview/x/y/\n';
    expect(lastPreviewUrl(text)).toBe('https://b.example/preview/x/y/');
  });
});
