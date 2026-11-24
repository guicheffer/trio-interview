import { describe, expect, test } from 'vitest';
import { rewriteForTunnel, toRequestPayload, waitingPage } from '../preview-html.js';

const BASE = '/preview/maria/demo';

describe('rewriteForTunnel', () => {
  test('sends absolute asset paths through the preview path', () => {
    const html = '<script type="module" src="/src/main.tsx"></script><link href="/assets/app.css" rel="stylesheet"><img src=\'/logo.png\'>';
    const out = rewriteForTunnel(html, BASE);

    expect(out).toContain(`src="${BASE}/src/main.tsx"`);
    expect(out).toContain(`href="${BASE}/assets/app.css"`);
    expect(out).toContain(`src='${BASE}/logo.png'`);
  });

  test('leaves external, protocol relative and already prefixed urls alone', () => {
    const html = '<script src="https://cdn.example.com/a.js"></script><script src="//cdn.example.com/b.js"></script><a href="/preview/maria/demo/x">x</a>';
    const out = rewriteForTunnel(html, BASE);

    expect(out).toContain('src="https://cdn.example.com/a.js"');
    expect(out).toContain('src="//cdn.example.com/b.js"');
    expect(out).toContain('href="/preview/maria/demo/x"');
  });

  test('removes the Vite client and the React refresh preamble, keeps other scripts', () => {
    const html = [
      '<script type="module" src="/@vite/client"></script>',
      '<script type="module">import { injectIntoGlobalHook } from "/@react-refresh"; injectIntoGlobalHook(window);</script>',
      '<script>window.keep = true;</script>',
      '<script type="module" src="/src/main.tsx"></script>',
    ].join('');
    const out = rewriteForTunnel(html, BASE);

    expect(out).not.toContain('@vite/client');
    expect(out).not.toContain('injectIntoGlobalHook');
    expect(out).toContain('window.keep = true;');
    expect(out).toContain(`${BASE}/src/main.tsx`);
  });

  test('copes with an unterminated script', () => {
    expect(rewriteForTunnel('<script>oops', BASE)).toBe('<script>oops');
  });
});

describe('toRequestPayload', () => {
  test('passes strings and buffers through and serializes the rest', () => {
    const buffer = Buffer.from('raw');
    expect(toRequestPayload(undefined)).toBeUndefined();
    expect(toRequestPayload(null)).toBeUndefined();
    expect(toRequestPayload('text')).toBe('text');
    expect(toRequestPayload(buffer)).toBe(buffer);
    expect(toRequestPayload({ a: 1 })).toBe('{"a":1}');
  });
});

describe('waitingPage', () => {
  test('asks the server to detect the app of this candidate and exercise', () => {
    const page = waitingPage('maria', 'demo');

    expect(page).toContain('/api/preview/detect');
    expect(page).toContain('{"candidate":"maria","exercise":"demo"}');
  });
});
