// The docs pages of the site come from the markdown files of the repository. A link written for GitHub has to keep working on the
// site: to another docs page when there is one, to the file on GitHub when there is not, and to a copied image for pictures.
import { describe, expect, test } from 'vitest';
import { PAGES, rewriteLink } from '../build-docs.mjs';

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
    try {
      const run = spawnSync('node', ['scripts/build-docs.mjs'], { cwd: root, encoding: 'utf-8' });
      expect(run.status, run.stderr).toBe(0);
      for (const file of readdirSync(before).filter(f => f.endsWith('.html'))) {
        expect(readFileSync(join(root, 'site', 'docs', file), 'utf-8'), `${file} is out of date: run node scripts/build-docs.mjs`).toBe(readFileSync(join(before, file), 'utf-8'));
      }
    } finally { rmSync(join(before, '..'), { recursive: true, force: true }); }
  });
});
