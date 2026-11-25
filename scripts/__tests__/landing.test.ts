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
    expect(scene).toContain('ran in ');
    expect(scene).not.toMatch(/ran-flash|ran-badge/);
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

describe('the scenes of the stage', () => {
  const dir = join(root, 'site', 'app');
  const files = ['welcome', 'fib', 'picker', 'view', 'work'].map(n => `scene-${n}.html`);
  const appCss = readFileSync(join(dir, 'app.css'), 'utf-8');
  test('every scene links the stylesheet and stays hidden until it has applied', () => {
    for (const f of files) {
      const page = readFileSync(join(dir, f), 'utf-8');
      expect(page, f).toMatch(/<link rel="stylesheet" href="app\.css" onload="document\.documentElement\.classList\.add\('styled'\)">/);
      expect(page, f).toContain('html:not(.styled) body{visibility:hidden}');
    }
  });
  test('the stylesheet keeps the rules the scenes lean on', () => {
    expect(appCss.length).toBeGreaterThan(100000);
    for (const f of files) {
      const body = readFileSync(join(dir, f), 'utf-8').split('<body>')[1] ?? '';
      const classes = new Set([...body.matchAll(/class="([^"]*)"/g)].flatMap(m => m[1].split(/\s+/)).filter(Boolean));
      // the classes that carry the look of a screen: its heading, buttons and layout. Each needs a rule.
      const must = ['flex', 'items-center', 'rounded-lg', 'text-gray-100'].filter(c => classes.has(c));
      expect(must.length, f).toBeGreaterThan(0);
      for (const c of must) expect(appCss, `${f} .${c}`).toContain(`.${c}`);
    }
  });
  test('the page preloads the stylesheet', () => { expect(html).toContain('<link rel="preload" href="app/app.css" as="style">'); });
});

describe('the hero', () => {
  test('says what the interviewer gets in plain words', () => {
    expect(html).toContain('and <b>you see all of it</b>.');
    expect(html).not.toContain('plain sight');
  });
});

describe('the demo link', () => {
  const nav = /<nav>([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? '';
  const footer = /<footer>([\s\S]*?)<\/footer>/.exec(html)?.[1] ?? '';
  test('is in the top menu next to Docs, and in the footer', () => {
    expect(nav).toMatch(/<a href="docs\/">Docs<\/a><a class="demo" href="demo\/">Demo<\/a>/);
    expect(footer).toMatch(/<a href="demo\/">Demo<svg class="ext"/);
  });
  test('is also offered quietly in the hero and next to the docs button', () => {
    expect((html.match(/href="demo\/">Try the demo/g) ?? []).length).toBe(2);
  });
  test('stays in the menu on a phone while the other items fold away', () => {
    expect(css).toMatch(/\.bar nav a:not\(\.star\):not\(\.demo\)\{display:none\}/);
  });
});

describe('Run tests and Run both in the scene and the demo', () => {
  const scene = readFileSync(join(__dirname, '..', 'fib-scene.js'), 'utf-8');
  const demo = readFileSync(join(__dirname, '..', 'demo', 'demo.js'), 'utf-8');
  const built = readFileSync(join(__dirname, '..', '..', 'site', 'app', 'scene-fib.html'), 'utf-8');

  test('the scene adds both buttons and runs the exercise test file in a Worker', () => {
    expect(scene).toMatch(/'Run tests'/);
    expect(scene).toMatch(/'Run both'/);
    expect(scene).toContain('new Worker');
    expect(built).toContain('fibonacci(0) is an empty array');   // the real test file of the example is inside the scene
  });

  test('the demo sends each of the three buttons to its own run', () => {
    expect(demo).toMatch(/\^Run tests/);
    expect(demo).toMatch(/\^Run both/);
  });
});

// The landing is plainly a picture of the app, so it does not say so. The demo does, because it is a page to play with.
describe('the labels of the landing window', () => {
  const html = readFileSync(join(__dirname, '..', '..', 'site', 'index.html'), 'utf-8');
  const script = readFileSync(join(__dirname, '..', '..', 'site', 'site.js'), 'utf-8');
  test('do not call the scenes a replica', () => {
    expect(html).not.toMatch(/<em id="note">[^<]/);
    expect(script).not.toMatch(/note: '(replica|scripted answer|runs for real)'/);
  });
});

describe('the tests of the scene', () => {
  const demo = read('scripts/demo/demo.js');
  test('a test run that does not finish says so, and a run always ends in PASS or FAIL', () => {
    expect(scene).toContain("'the test run did not finish'");
    expect(scene).toMatch(/PASS: /);
    expect(scene).toMatch(/FAIL: /);
  });
  test('only one test run is alive: starting anything else drops the old one', () => {
    expect(scene).toMatch(/function cancelTests\(\) \{ testRun\+\+;/);
    expect(scene).toMatch(/function clear\(\) \{.*cancelTests\(\)/);
    expect(scene).toMatch(/if \(finished \|\| id !== testRun\) return;/);
  });
  test('a failing test says why', () => { expect(scene).toMatch(/why: why/); });
  test('the terminals draw every row and scroll, in the scene and in the demo', () => {
    expect(scene).not.toMatch(/rows = rows\.slice\(-room\)/);
    expect(demo).not.toMatch(/rows\.slice\(-Math\.max/);
    expect(scene).toContain('window.fibScrollers = {');
    expect(demo).toContain('fibScrollers.project.update(true)');
  });
  test('the wheel goes on to the page when a pane cannot move that way', () => {
    expect(scene).toMatch(/\(dy < 0 && top <= 0\) \|\| \(dy > 0 && top >= max\)\) return;/);
  });
});
