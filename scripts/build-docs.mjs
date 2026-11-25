// Builds the docs pages of the landing site from the same markdown files the repository shows on GitHub, so the two never
// say different things. Run with `node scripts/build-docs.mjs`; the pages go to site/docs/.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join, posix, relative } from 'path';
import { fileURLToPath } from 'url';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import yaml from 'highlight.js/lib/languages/yaml';
import { marked } from 'marked';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('yaml', yaml);
const ALIASES = { sh: 'bash', shell: 'bash', zsh: 'bash', js: 'javascript', yml: 'yaml' };

/** A code block with its colours, or plain when the language is not one of the four the docs use */
export function highlight(code, lang) {
  const name = ALIASES[lang] ?? lang;
  const body = name && hljs.getLanguage(name) ? hljs.highlight(code, { language: name, ignoreIllegals: true }).value : code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<pre><code${name ? ` class="hljs language-${name}"` : ' class="hljs"'}>${body}</code></pre>\n`;
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'site', 'docs');
const REPO = 'https://github.com/guicheffer/trio-interview';

/** The pages, in the order of the menu. `from` is the markdown file, `to` the page it becomes. */
export const PAGES = [
  { from: 'docs/interviewer-guide.md', to: 'index.html', title: 'Run an interview', group: 'Start' },
  { from: 'docs/candidate-guide.md', to: 'candidate.html', title: 'For candidates', group: 'Start' },
  { from: 'docs/details.md', to: 'details.html', title: 'Sharing, hiding files and exporting', group: 'Guides' },
  { from: 'docs/interviewers/README.md', to: 'exercises.html', title: 'The exercises', group: 'Guides' },
  { from: 'CONTRIBUTING.md', to: 'contributing.html', title: 'Contributing', group: 'Project' },
];

/** Pages of the menu that are not made from markdown: the live demo lives next to the docs, in site/demo/ */
export const EXTRA = [{ href: '../demo/', title: 'Live demo as a candidate', group: 'Try it' }];

const sprite = (readFileSync(join(root, 'site', 'index.html'), 'utf-8').match(/<svg width="0"[\s\S]*?<\/svg>/) ?? [''])[0];
const mark = '<svg viewBox="0 0 279 241" aria-hidden="true"><use href="#agent"/><use href="#interviewer"/><use href="#candidate"/></svg>';


/**
 * The menu of the landing page, read from it so the two never differ. Its links are written for the page at the root: the ones
 * inside the page (#how) point back to it from here, the ones to another page get the folder up, and Docs is the page we are on.
 */
export function landingNav(html = readFileSync(join(root, 'site', 'index.html'), 'utf-8')) {
  const nav = (html.match(/<nav>([\s\S]*?)<\/nav>/) ?? ['', ''])[1];
  return nav
    .replace(/href="#/g, 'href="../#')
    .replace(/href="docs\/"/g, 'href="./" aria-current="page"')
    .replace(/href="(?!https?:|\.\.\/|\.\/|#|mailto:)([^"]+)"/g, 'href="../$1"');
}

/** The menu for the demo page, which sits one folder over from the docs: Docs points to them instead of to itself */
export function demoNav(html) {
  return landingNav(html).replace(' aria-current="page"', '').replace('href="./"', 'href="../docs/"');
}

const byFile = new Map(PAGES.map(p => [p.from, p.to]));

/** Where a link written in `fromFile` should go on the site: another page of the docs, or the same file on GitHub */
export function rewriteLink(href, fromFile) {
  if (!href || /^(https?:|mailto:|#)/.test(href)) return href;
  const [pathPart, hash] = href.split('#');
  const target = posix.normalize(posix.join(posix.dirname(fromFile), pathPart));
  const page = byFile.get(target);
  if (page) return page + (hash ? '#' + hash : '');
  if (/\.(png|gif|jpg|jpeg|svg|webp)$/i.test(target)) return 'images/' + posix.basename(target);
  const kind = /\.\w+$/.test(target) ? 'blob' : 'tree';
  return `${REPO}/${kind}/main/${target}${hash ? '#' + hash : ''}`;
}

const slug = text => text.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');

function render(file) {
  const source = readFileSync(join(root, file), 'utf-8');
  const renderer = new marked.Renderer();
  const headings = [];
  renderer.heading = ({ tokens, depth }) => {
    const text = tokens.map(t => t.raw ?? t.text ?? '').join('');
    const id = slug(text);
    if (depth === 2) headings.push({ id, text: text.replace(/[`*_]/g, '') });
    return `<h${depth} id="${id}">${marked.Parser.parseInline(tokens)}</h${depth}>\n`;
  };
  renderer.code = ({ text, lang }) => highlight(text, (lang || '').split(/\s/)[0]);
  renderer.link = ({ href, title, tokens }) => {
    const to = rewriteLink(href, file);
    const external = /^https?:/.test(to);   // another site, or a file on GitHub
    return `<a href="${to}"${title ? ` title="${title}"` : ''}${external ? ' target="_blank" rel="noopener"' : ''}>${marked.Parser.parseInline(tokens)}${external ? EXTERNAL_ICON : ''}</a>`;
  };
  renderer.image = ({ href, title, text }) => `<img src="${rewriteLink(href, file)}" alt="${text}"${title ? ` title="${title}"` : ''} loading="lazy">`;
  const body = marked.parse(source, { renderer, gfm: true });
  return { body, headings };
}

/** The small arrow that marks a link leaving the page, drawn in the text colour */
export const EXTERNAL_ICON = '<svg class="ext" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false"><path d="M6 3H3v10h10v-3M9 3h4v4M13 3L7 9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function menu(current) {
  let last = '', html = '';
  for (const p of PAGES) {
    if (p.group !== last) { html += `${last ? '</ul>' : ''}<h4>${p.group}</h4><ul>`; last = p.group; }
    html += `<li><a href="${p.to}"${p.to === current ? ' aria-current="page"' : ''}>${escape(p.title)}</a></li>`;
  }
  for (const e of EXTRA) html += `</ul><h4>${e.group}</h4><ul><li><a href="${e.href}">${escape(e.title)}</a></li>`;
  return html + '</ul>';
}

function page(p, { body, headings }) {
  const toc = headings.length > 2 ? `<nav class="toc" aria-label="On this page"><h4>On this page</h4><ul>${headings.map(h => `<li><a href="#${h.id}">${escape(h.text)}</a></li>`).join('')}</ul></nav>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(p.title)} | Trio Interview docs</title>
<meta name="description" content="${escape(p.title)}: Trio Interview, free and open source live coding interviews with an AI assistant.">
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="../site.css">
<link rel="stylesheet" href="docs.css">
</head>
<body>
${sprite}
<header class="bar"><div class="wrap">
  <a class="brand" href="../">${mark} Trio Interview</a>
  <nav>${landingNav()}</nav>
</div></header>
<div class="docs">
  <aside class="side" aria-label="Docs">${menu(p.to)}</aside>
  <main class="doc">
    <article class="md">${body}</article>
    <p class="edit"><a href="${REPO}/blob/main/${p.from}" target="_blank" rel="noopener">Edit this page on GitHub${EXTERNAL_ICON}</a></p>
  </main>
  ${toc}
</div>
<script src="../site.js"></script>
</body>
</html>
`;
}

/** The live demo: the page around the scene of the landing page, with the same top bar as the docs */
export function buildDemo() {
  const dir = join(root, 'site', 'demo');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const src = join(root, 'scripts', 'demo');
  const html = readFileSync(join(src, 'page.html'), 'utf-8')
    .replace('<!--sprite--><!--/sprite-->', sprite)
    .replace('<!--nav--><!--/nav-->', demoNav());
  writeFileSync(join(dir, 'index.html'), html);
  cpSync(join(src, 'demo.css'), join(dir, 'demo.css'));
  cpSync(join(src, 'demo.js'), join(dir, 'demo.js'));
}

export function build() {
  buildDemo();
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'images'), { recursive: true });
  cpSync(join(root, 'scripts', 'docs.css'), join(out, 'docs.css'));
  const used = new Set();
  for (const p of PAGES) {
    const rendered = render(p.from);
    for (const m of rendered.body.matchAll(/src="images\/([^"]+)"/g)) used.add(m[1]);
    writeFileSync(join(out, p.to), page(p, rendered));
  }
  for (const name of used) {
    const src = join(root, 'docs', 'images', name);
    if (existsSync(src)) cpSync(src, join(out, 'images', name));
    else console.warn(`image not found: docs/images/${name}`);
  }
  console.log(`docs: ${PAGES.length} pages, ${used.size} images`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) build();
