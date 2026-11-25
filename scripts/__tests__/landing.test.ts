// The landing page is plain files, so these tests read them: what a visitor is told and the rules the page keeps.
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, test } from 'vitest';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf-8');
const html = read('site/index.html');
const js = read('site/site.js');
const css = read('site/site.css');
const scene = read('scripts/fib-scene.js');
const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(m => ({ attrs: m[1], inner: m[2], href: /href="([^"]*)"/.exec(m[1])?.[1] ?? '' }));

describe('links that leave the page', () => {
  // the menu in the bar stays plain (it is copied into the docs pages); everything from <main> on is checked
  const start = html.indexOf('<main');
  const body = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].filter(m => m.index! > start).map(m => ({ href: /href="([^"]*)"/.exec(m[1])?.[1] ?? '', inner: m[2] }));
  test('the links in the page and the footer that go to other sites or pages carry the icon, hidden from screen readers', () => {
    const out = body.filter(a => !a.href.startsWith('#'));
    expect(out.length).toBeGreaterThan(10);
    for (const a of out) expect(a.inner, a.href).toMatch(/<svg class="ext"[^>]*aria-hidden="true"/);
  });
  test('in page links never carry it', () => {
    for (const a of anchors.filter(a => a.href.startsWith('#'))) expect(a.inner, a.href).not.toContain('class="ext"');
  });
});

describe('the security section', () => {
  const section = /<section[^>]*id="safe"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
  test('sits between Why this and the commands, and links to the notes', () => {
    expect(html.indexOf('id="why"')).toBeLessThan(html.indexOf('id="safe"'));
    expect(html.indexOf('id="safe"')).toBeLessThan(html.indexOf('id="start"'));
    expect(section).toContain('href="https://github.com/guicheffer/trio-interview/blob/main/SECURITY.md"');
  });
  test('says it is a guard rail with the network open, and that the sandbox is required', () => {
    expect(section).toMatch(/guard rail/);
    expect(section).toMatch(/network is open/);
    expect(section).toMatch(/refuses to start them without one/);
    expect(section).toMatch(/decided on the server/);
  });
  test('uses no dashes as punctuation', () => { expect(section).not.toMatch(/[–—]/); });
});

describe('the logo section', () => {
  test('the assistant comes together first, then the candidate, then the interviewer', () => {
    expect(js).toMatch(/var order = \[0, 2, 1\];/);
  });
  test('the interviewer text stays until the logo is whole, then the new sentence shows', () => {
    expect(js).toMatch(/classList\.toggle\('whole'/);
    expect(js).toMatch(/k === 1 \? 1 :/);
    expect(html).toContain('You sit in the middle: everything between the candidate and the assistant passes through you.');
    expect(css).toMatch(/\.trio\.whole \.swap \.done\{opacity:1\}/);
  });
});

describe('step 4', () => {
  test('is about setup, with a short tab', () => {
    expect(html).toContain('<b>4</b>Setup');
    expect(html).toMatch(/Everything is configurable/);
    expect(html).not.toContain('who is online');
  });
});

describe('the Run button of the Fibonacci scene', () => {
  test('does not run by itself when the step opens', () => {
    expect(js).not.toMatch(/call\(f, 'fibRun'\)/);
  });
  test('every press clears the terminal first and shows that it ran', () => {
    expect(scene).toMatch(/window\.fibRun = function[\s\S]*?clear\(\);[\s\S]*?project\(\);[\s\S]*?celebrate\(\)/);
    expect(js).toMatch(/runit\.textContent = 'Run again'/);
  });
  test('leaves room under the button', () => { expect(css).toMatch(/\.runrow\{[^}]*margin:18px 0 34px/); });
});

describe('the assistant change in the scene', () => {
  test('is drawn like the app does: green lines, a red zone, Keep and Undo, and the bar', () => {
    for (const piece of ['rgba(34,197,94,0.16)', 'rgba(239,68,68,0.16)', 'AI change', 'AI changed this file', 'Keep all', 'Undo all']) expect(scene).toContain(piece);
  });
});

describe('the logo easter egg', () => {
  const logo = read('app/components/TrioLogo.tsx');
  const globals = read('app/globals.css');
  test('plays on hover in the app, on an inner group so the entrance never restarts', () => {
    expect(globals).toMatch(/\.trio-logo:hover \.trio-hop \{ animation: trio-hop/);
    expect(logo).toMatch(/hop\('agent'\)/);
  });
  test('respects reduced motion, in the app and on the landing page', () => {
    expect(globals).toMatch(/prefers-reduced-motion: reduce\) \{ \.trio-part, \.trio-hop \{ animation: none/);
    expect(js).toMatch(/brand && !reduce/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\{\n  \.brand svg use\{animation:none\}/);
  });
});

describe('the scene can be clicked on every Fibonacci step', () => {
  const plan = /var plan = \[([\s\S]*?)\n  \];/.exec(js)?.[1] ?? '';
  test('both Fibonacci steps are live, so the iframe takes real clicks, and the other scenes are not', () => {
    const entries = plan.split('\n').filter(l => l.includes('scene:'));
    expect(entries.length).toBe(6);
    for (const l of entries) expect(/scene: 'fib'/.test(l), l).toBe(/live: true/.test(l));
    expect(css).toMatch(/\.screen iframe\{[^}]*pointer-events:none/);
    expect(css).toMatch(/\.screen iframe\.live\.on\{pointer-events:auto\}/);
  });
  test('Run pressed while the answer is still being drawn finishes the answer first', () => {
    expect(scene).toMatch(/if \(asking\) \{ clear\(\); asking = false; startChange\(\);/);
  });
});

describe('Why this', () => {
  const why = /<section[^>]*id="why"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
  test('gives the reason in the age of assistants, links the guide, keeps the ledger, and uses no dashes', () => {
    expect(why).toMatch(/how a person works with the assistant/);
    expect(why).toContain('href="https://github.com/guicheffer/trio-interview/blob/main/docs/interviewer-guide.md"');
    expect(why).toContain('class="ledger"');
    expect(why).not.toMatch(/[\u2013\u2014]/);
  });
});
