// The live demo: the guided tour has to light up the right part of the workspace, which is drawn inside an iframe and scaled, and
// the colours of the editor have to be the ones of the real editor. The browser side of this was measured with real clicks; these
// tests keep the parts that can break without a browser from breaking quietly.
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const read = (f: string) => readFileSync(join(ROOT, f), 'utf-8');
// The browser files are plain scripts. The package is an ES module, so they are loaded the way a browser would: run with a fake `window`
function load(file: string, global: string) {
  const win: Record<string, any> = {};
  new Function('window', read(file))(win);
  return win[global];
}
const tour = load('scripts/demo/tour.js', 'DemoTour');
const tokenize = load('scripts/demo/tokenize.js', 'DemoTokenize');

describe('where the tour puts the highlight', () => {
  test('a rectangle of the scene is moved and scaled to where the iframe is on the page', () => {
    const frame = { left: 100, top: 200, width: 720, height: 450 };      // the 1440 wide scene shown at half size
    expect(tour.rectIn(frame, { left: 0, top: 0, width: 1440, height: 900 }, 1440)).toEqual({ left: 100, top: 200, width: 720, height: 450 });
    expect(tour.rectIn(frame, { left: 200, top: 100, width: 400, height: 300 }, 1440)).toEqual({ left: 200, top: 250, width: 200, height: 150 });
  });

  test('a phone sized scene is scaled by the same factor on both axes', () => {
    const r = tour.rectIn({ left: 12, top: 358, width: 366, height: 229 }, { left: 1000, top: 500, width: 440, height: 400 }, 1440);
    expect(r.width / 440).toBeCloseTo(366 / 1440, 6);
    expect(r.height / 400).toBeCloseTo(366 / 1440, 6);
    expect(r.left).toBeCloseTo(12 + 1000 * (366 / 1440), 6);
  });

  test('the card never covers the highlighted area and stays inside the window', () => {
    const spots = [
      { left: 130, top: 170, width: 222, height: 692 },
      { left: 342, top: 170, width: 618, height: 486 },
      { left: 951, top: 170, width: 361, height: 692 },
      { left: 342, top: 647, width: 618, height: 215 }
    ];
    for (const hole of spots) {
      const at = tour.placeCard(hole, 340, 250, 1440, 900, 14);
      if (!at) continue;
      const apart = at.left + 340 <= hole.left || at.left >= hole.left + hole.width || at.top + 250 <= hole.top || at.top >= hole.top + hole.height;
      expect(apart, JSON.stringify(hole)).toBe(true);
      expect(at.left).toBeGreaterThanOrEqual(0);
      expect(at.left + 340).toBeLessThanOrEqual(1440);
      expect(at.top + 250).toBeLessThanOrEqual(900);
    }
  });

  test('gives up (so the page can dock the card) when nothing fits next to the highlight', () => {
    expect(tour.placeCard({ left: 0, top: 0, width: 1440, height: 900 }, 340, 250, 1440, 900, 14)).toBeNull();
  });
});

describe('what the tour points at', () => {
  const scene = read('site/app/scene-fib.html');
  const ids = (html: string) => [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);

  test('every step names an area that exists exactly once in the scene it is drawn on', () => {
    const all = ids(scene);
    expect(tour.STEPS.length).toBe(5);
    for (const step of tour.STEPS) expect(all.filter(id => id === step.target), step.title).toHaveLength(1);
  });

  test('goes through files, editor, terminal, assistant and the picker, in that order, and ends on the picker', () => {
    expect(tour.STEPS.map((s: { target: string }) => s.target)).toEqual(['files', 'editor', 'terminal', 'chat', 'chat']);
    expect(tour.STEPS[tour.STEPS.length - 1].view).toBe('picker');
  });

  test('the page has no skip or close control, only Next', () => {
    const page = read('site/demo/index.html');
    const dialog = page.match(/<div class="tour"[\s\S]*?<\/div>\s*<\/div>\s*<script/)![0];
    expect(dialog).toContain('class="tour-next"');
    expect(dialog.match(/<button/g)).toHaveLength(1);
    expect(dialog).not.toMatch(/skip|close|dismiss/i);
  });

  test('is remembered under one key, so the link in the top bar can clear it', () => {
    expect(tour.KEY).toBe('trio_demo_tour_done');
    const src = read('scripts/demo/tour.js');
    expect(src).toMatch(/try \{ localStorage\.setItem/);
    expect(src).toMatch(/try \{ localStorage\.removeItem/);
    expect(src).toMatch(/try \{ return localStorage\.getItem/);
    expect(read('site/demo/index.html')).toContain('id="tour-again"');
  });

  test('stops moving for people who asked for less motion', () => {
    expect(read('site/demo/demo.css')).toMatch(/prefers-reduced-motion:reduce\)\{\.tour-dim,\.tour-ring\{transition:none/);
  });
});

describe('the files and the editor colours of the demo', () => {
  test('give the same coloured text as the tokenizer the landing page is checked with', () => {
    const run = spawnSync('python3', ['-c', `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location('tk', '${ROOT}/scripts/tokenize-js.py'); tk = importlib.util.module_from_spec(spec); spec.loader.exec_module(tk)
print(json.dumps(tk.code_html(open('${ROOT}/examples/fibonacci/fibonacci.js').read())))`], { encoding: 'utf-8' });
    expect(run.status, run.stderr).toBe(0);
    const python = JSON.parse(run.stdout);
    const js = tokenize.codeHtml(read('examples/fibonacci/fibonacci.js'));
    expect(js.length).toBe(python.length);
    // what matters is which text gets which colour, so compare the (class, text) pairs. Spaces are the one difference: the editor
    // draws them as non breaking ones and the Python script writes plain ones
    const pairs = (html: string) => [...html.matchAll(/<span class="(mtk\d+)">([^<]*)<\/span>/g)].map(m => m[1] + ':' + m[2].replace(/&nbsp;|\u00a0/g, ' '));
    expect(js.map(pairs)).toEqual(python.map(pairs));
  });

  test('colour what is typed: a keyword, a string and a comment', () => {
    const [line] = tokenize.codeHtml('return "a"; // x');
    expect(line).toContain('class="mtk8">return');
    expect(line).toContain('class="mtk5">"a"');
    expect(line).toMatch(/class="mtk7">\/\/\s?x/);
  });

  test('the demo shows the real files: the exercise, its brief and the instructions every candidate folder gets', () => {
    const files = read('site/demo/files.js');
    for (const name of ['fibonacci.js', 'description.md', 'AGENTS.md', 'CLAUDE.md']) expect(files).toContain(`"${name}"`);
    expect(files).toContain('Fibonacci Sequence Generator');
    expect(files).toContain('\\u003ch1');
  });
});

describe('the assistant panel of the demo', () => {
  const js = () => read('site/demo/demo.js');
  const page = () => read('site/demo/index.html');

  test('has a switcher with Chat, Claude Code, OpenCode and Pi, and Codex switched off', () => {
    for (const mode of ['chat', 'claude-code', 'opencode', 'pi']) expect(page()).toContain(`data-mode="${mode}"`);
    expect(page()).toMatch(/<button[^>]*disabled[^>]*title="Coming soon">Codex \(soon\)/);
  });

  test('says that Pi is an illustration, since its look was not captured from the program', () => {
    expect(js()).toMatch(/Illustration: Pi is drawn from the terminal style of the app/);
  });

  test('keeps every input of every view disabled', () => {
    expect(js()).toMatch(/helper\.disabled = true/);
    expect(js()).toMatch(/<textarea rows="1" disabled/);
    expect(js()).toMatch(/class="send" type="button" disabled/);
  });
});
