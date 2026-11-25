// The docs pages of the site come from the markdown files of the repository. A link written for GitHub has to keep working on the
// site: to another docs page when there is one, to the file on GitHub when there is not, and to a copied image for pictures.
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PAGES, rewriteLink } from '../build-docs.mjs';

const ROOT = join(__dirname, '..', '..');
const read = (f: string) => readFileSync(join(ROOT, f), 'utf-8');
const linkNames = (html: string) => [...((html.match(/<nav>([\s\S]*?)<\/nav>/) ?? ['', ''])[1].matchAll(/<a [^>]*>([\s\S]*?)<\/a>/g))].map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());

const GITHUB = 'https://github.com/guicheffer/trio-interview';

describe('links in the docs pages', () => {
  test('a link to another page of the docs becomes a link between site pages, keeping the anchor', () => {
    expect(rewriteLink('details.md#requirements', 'docs/interviewer-guide.md')).toBe('details.html#requirements');
    expect(rewriteLink('interviewers/README.md', 'docs/interviewer-guide.md')).toBe('exercises.html');
    expect(rewriteLink('../CONTRIBUTING.md', 'docs/details.md')).toBe('contributing.html');
  });

  test('a link to a file that is not a page goes to GitHub', () => {
    expect(rewriteLink('../SECURITY.md', 'docs/interviewer-guide.md')).toBe(`${GITHUB}/blob/main/SECURITY.md`);
    expect(rewriteLink('AGENTS.md', 'CONTRIBUTING.md')).toBe(`${GITHUB}/blob/main/AGENTS.md`);
    expect(rewriteLink('interviewers/gearshare.md', 'docs/interviewer-guide.md')).toBe(`${GITHUB}/blob/main/docs/interviewers/gearshare.md`);
  });

  test('pictures point at the copy that sits next to the pages', () => {
    expect(rewriteLink('docs/images/contribute.gif', 'CONTRIBUTING.md')).toBe('images/contribute.gif');
  });

  test('addresses, mail links and anchors are left alone', () => {
    for (const href of ['https://coderpad.io/', 'mailto:a@b.c', '#section']) expect(rewriteLink(href, 'CONTRIBUTING.md')).toBe(href);
  });

  test('every page of the menu has a markdown file behind it', async () => {
    const { existsSync } = await import('fs');
    for (const page of PAGES) expect(existsSync(`${__dirname}/../../${page.from}`), page.from).toBe(true);
  });
});

describe('the pages kept in the repository', () => {
  test('are the ones the markdown files make, so the site never shows older docs than GitHub', async () => {
    const { mkdtempSync, readFileSync, readdirSync, rmSync, cpSync } = await import('fs');
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    const { spawnSync } = await import('child_process');
    const root = join(__dirname, '..', '..');
    const before = join(mkdtempSync(join(tmpdir(), 'trio-docs-')), 'docs');
    cpSync(join(root, 'site', 'docs'), before, { recursive: true });
    const DEMO = ['index.html', 'demo.css', 'demo.js', 'tour.js', 'tokenize.js', 'files.js'];
    const demoBefore = Object.fromEntries(DEMO.map(f => [f, readFileSync(join(root, 'site', 'demo', f), 'utf-8')]));
    try {
      const run = spawnSync('node', ['scripts/build-docs.mjs'], { cwd: root, encoding: 'utf-8' });
      expect(run.status, run.stderr).toBe(0);
      for (const f of DEMO) expect(readFileSync(join(root, 'site', 'demo', f), 'utf-8'), `site/demo/${f} is out of date: run node scripts/build-docs.mjs`).toBe(demoBefore[f]);
      for (const file of readdirSync(before).filter(f => f.endsWith('.html'))) {
        expect(readFileSync(join(root, 'site', 'docs', file), 'utf-8'), `${file} is out of date: run node scripts/build-docs.mjs`).toBe(readFileSync(join(before, file), 'utf-8'));
      }
    } finally { rmSync(join(before, '..'), { recursive: true, force: true }); }
  });
});

describe('the menu of the docs pages', () => {
  test('has the same items as the menu of the landing page, in the same order', async () => {
    const { readFileSync, readdirSync } = await import('fs');
    const { join } = await import('path');
    const root = join(__dirname, '..', '..');
    const names = (html: string) => [...((html.match(/<nav>([\s\S]*?)<\/nav>/) ?? ['', ''])[1].matchAll(/<a [^>]*>([\s\S]*?)<\/a>/g))].map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    const landing = names(readFileSync(join(root, 'site', 'index.html'), 'utf-8'));
    expect(landing.length).toBeGreaterThan(3);
    for (const file of readdirSync(join(root, 'site', 'docs')).filter(f => f.endsWith('.html'))) {
      expect(names(readFileSync(join(root, 'site', 'docs', file), 'utf-8')), file).toEqual(landing);
    }
  });
});

describe('the live demo page', () => {
  const demo = () => read('site/demo/index.html');

  test('has the same top menu as the landing page and the docs, with Docs pointing at the docs', () => {
    expect(linkNames(demo())).toEqual(linkNames(read('site/index.html')));
    expect(demo()).toContain('href="../docs/"');
  });

  test('says it is a replica, links back to the docs and embeds the landing scene by address', () => {
    const html = demo();
    expect(html).toMatch(/Demo replica/);
    expect(html).toMatch(/Nothing you type or run is sent anywhere/);
    expect(html).toMatch(/runs on the interviewer's own machine/);
    expect(html).toContain('href="../docs/candidate.html"');
    expect(html).toContain('src="../app/scene-fib.html"');
  });

  test('offers the three assistants and shows Claude Code first', () => {
    const html = demo();
    for (const mode of ['chat', 'claude-code', 'opencode']) expect(html).toContain(`data-mode="${mode}"`);
    expect(html).toMatch(/class="opt on" data-mode="claude-code" aria-pressed="true"/);
  });

  test('turns every way of sending the assistant a message off', () => {
    const js = read('site/demo/demo.js');
    expect(js).toMatch(/helper\.disabled = true/);
    expect(js).toMatch(/<textarea rows="1" disabled/);
    expect(js).toMatch(/class="send" type="button" disabled/);
  });

  test('is in the docs menu under Try it, and its files are copied next to the page', async () => {
    const { existsSync } = await import('fs');
    expect(read('site/docs/index.html')).toMatch(/<h4>Try it<\/h4><ul><li><a href="\.\.\/demo\/">/);
    for (const f of ['index.html', 'demo.css', 'demo.js', 'tour.js', 'tokenize.js', 'files.js']) expect(existsSync(join(ROOT, 'site', 'demo', f)), f).toBe(true);
  });

  test('is linked from the candidate guide with the full address, so it works on GitHub too', () => {
    expect(read('docs/candidate-guide.md')).toContain('https://guicheffer.github.io/trio-interview/demo/');
  });
});

describe('links that leave the page', () => {
  const page = () => read('site/docs/candidate.html');

  test('inside the articles get a small icon hidden from screen readers', () => {
    const body = page().match(/<article class="md">([\s\S]*?)<\/article>/)![1];
    const links = [...body.matchAll(/<a href="(https?:[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
    expect(links.length).toBeGreaterThan(0);
    for (const [, href, inner] of links) expect(inner, href).toMatch(/<svg class="ext"[^>]*aria-hidden="true"/);
  });

  test('also mark the Edit this page link', () => {
    expect(page()).toMatch(/Edit this page on GitHub<svg class="ext"/);
  });

  test('are not put on links inside the page or between pages', () => {
    for (const f of ['index', 'candidate', 'details']) {
      const html = read(`site/docs/${f}.html`);
      for (const m of html.matchAll(/<a href="(#[^"]*|[a-z]+\.html[^"]*)"[^>]*>([\s\S]*?)<\/a>/g)) expect(m[2], m[1]).not.toContain('class="ext"');
    }
  });
});
