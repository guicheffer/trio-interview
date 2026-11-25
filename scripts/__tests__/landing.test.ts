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

describe('the merged section: why, and what to expect', () => {
  const section = /<section[^>]*id="why"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
  test('there is one section for it, with one #why, and the old security and ledger blocks are gone', () => {
    expect((html.match(/id="why"/g) ?? []).length).toBe(1);
    expect(html).not.toContain('id="safe"');
    expect(html).not.toContain('class="ledger"');
    expect(html.indexOf('id="why"')).toBeLessThan(html.indexOf('id="start"'));
  });
  test('is short: a lead of at most 35 words and cards of at most 24 words', () => {
    const lead = /<div class="lead">[\s\S]*?<p>([\s\S]*?)<\/p>/.exec(section)?.[1] ?? '';
    expect(lead.split(/\s+/).length).toBeLessThanOrEqual(35);
    const cards = [...section.matchAll(/<li class="card[^>]*>([\s\S]*?)<\/li>/g)].map(m => m[1].replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length);
    expect(cards.length).toBe(5);
    for (const n of cards) expect(n).toBeLessThanOrEqual(24 + 8);   // the title and the link text count too
  });
  test('every card has a hidden line icon taken from the sprite', () => {
    const cards = [...section.matchAll(/<li class="card[^>]*>([\s\S]*?)<\/li>/g)].map(m => m[1]);
    for (const c of cards) expect(c).toMatch(/<svg class="ico"[^>]*aria-hidden="true"[^>]*><use href="#i-[a-z]+"\/>/);
    for (const id of ['i-eye', 'i-laptop', 'i-shield', 'i-key', 'i-alert']) expect(html).toContain(`<symbol id="${id}"`);
  });
  test('links to the security notes and the guide, and the honest limit stays visible', () => {
    expect(section).toContain('href="https://github.com/guicheffer/trio-interview/blob/main/SECURITY.md"');
    expect(section).toContain('href="https://github.com/guicheffer/trio-interview/blob/main/docs/interviewer-guide.md"');
    expect(section).toMatch(/<li class="card limit">[\s\S]*guard rail, not a full sandbox[\s\S]*network is open[\s\S]*production credentials/);
    expect(section).toMatch(/refuse to start without the sandbox, which is macOS for now/);
    expect(section).toMatch(/server decides/);
  });
  test('keeps the truth about what leaves the machine, and the alternatives line', () => {
    expect(section).toMatch(/Only the chat goes to the assistant's provider/);
    for (const name of ['CoderPad', 'HackerRank', 'CodeSignal']) expect(section).toContain(name);
  });
  test('uses no dashes as punctuation', () => { expect(section).not.toMatch(/[\u2013\u2014]/); });
  test('the cards fill the grid on a wide screen and fall to two and one column', () => {
    expect(css).toMatch(/\.cards\{[^}]*grid-template-columns:repeat\(3,1fr\)/);
    expect(css).toMatch(/\.card\.limit\{grid-column:span 2/);
    expect(css).toMatch(/max-width:1100px\) and \(min-width:601px\)\{ \.cards\{grid-template-columns:repeat\(2,1fr\)\}/);
    expect(css).toMatch(/max-width:600px\)\{ \.cards\{grid-template-columns:1fr\}/);
  });
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

describe('the story of the assistant, built from the code', () => {
  const session = JSON.parse(read('site/source/fibonacci-session.json'));
  const run = (code: string) => {
    const module = { exports: {} as any };
    new Function('module', 'console', code)(module, { log() {} });
    return module.exports as { fibonacci: (n: any) => number[]; fibonacciUpTo: (n: any) => number[] };
  };
  test('the answer implements both functions and passes what the exercise expects', () => {
    const f = run(session.after);
    expect(f.fibonacci(10)).toEqual([0, 1, 1, 2, 3, 5, 8, 13, 21, 34]);
    expect(f.fibonacciUpTo(10)).toEqual([0, 1, 1, 2, 3, 5, 8]);
    expect(f.fibonacciUpTo(8)).toEqual([0, 1, 1, 2, 3, 5]);
    expect(f.fibonacciUpTo(0)).toEqual([]);
    expect(f.fibonacciUpTo(1)).toEqual([0]);
    expect(() => f.fibonacci(-1)).toThrow(RangeError);
    expect(() => f.fibonacci(2.5)).toThrow(RangeError);
    expect(() => f.fibonacciUpTo(-1)).toThrow(RangeError);
  });
  test('the starter still fails, which is honest when the code is empty', () => {
    const f = run(session.before);
    expect(f.fibonacci(5)).toBeUndefined();
    expect(f.fibonacciUpTo(8)).toBeUndefined();
  });
  test('nothing in the story says that a function is left undone', () => {
    const shown = [read('scripts/story_rows.py'), read('scripts/fib-scene.js'), read('scripts/demo/demo.js')].join('\n');
    expect(shown).not.toMatch(/still a stub|leaves fibonacciUpTo|fibonacciUpTo for you|prints undefined because/);
    expect(scene).toContain('Implement fibonacci(n) and fibonacciUpTo(limit)');
  });
  test('the scene reads the story from the data, not from fixed row numbers', () => {
    expect(scene).not.toMatch(/FOOT = \[39/);
    expect(scene).toContain('var BODY = AFTER_ROWS.slice(0, AFTER_ROWS.length - 4)');
  });
});
