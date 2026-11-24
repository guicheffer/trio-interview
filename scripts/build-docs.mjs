// Builds the docs pages of the landing site from the same markdown files the repository shows on GitHub, so the two never
// say different things. Run with `node scripts/build-docs.mjs`; the pages go to site/docs/.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join, posix, relative } from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';

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

const sprite = (readFileSync(join(root, 'site', 'index.html'), 'utf-8').match(/<svg width="0"[\s\S]*?<\/svg>/) ?? [''])[0];
const mark = '<svg viewBox="0 0 279 241" aria-hidden="true"><use href="#agent"/><use href="#interviewer"/><use href="#candidate"/></svg>';

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
  renderer.link = ({ href, title, tokens }) => {
    const to = rewriteLink(href, file);
    const external = /^https?:/.test(to);
    return `<a href="${to}"${title ? ` title="${title}"` : ''}${external ? ' target="_blank" rel="noopener"' : ''}>${marked.Parser.parseInline(tokens)}</a>`;
  };
  renderer.image = ({ href, title, text }) => `<img src="${rewriteLink(href, file)}" alt="${text}"${title ? ` title="${title}"` : ''} loading="lazy">`;
  const body = marked.parse(source, { renderer, gfm: true });
  return { body, headings };
}

const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function menu(current) {
  let last = '', html = '';
  for (const p of PAGES) {
    if (p.group !== last) { html += `${last ? '</ul>' : ''}<h4>${p.group}</h4><ul>`; last = p.group; }
    html += `<li><a href="${p.to}"${p.to === current ? ' aria-current="page"' : ''}>${escape(p.title)}</a></li>`;
  }
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
  <nav><a href="../#how">How it works</a><a href="../#why">Why this</a><a href="./" aria-current="page">Docs</a>
    <a class="star" href="${REPO}" target="_blank" rel="noopener" aria-label="Star Trio Interview on GitHub"><span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>Star</span><span class="cnt" style="display:none"></span></a>
  </nav>
</div></header>
<div class="docs">
  <aside class="side" aria-label="Docs">${menu(p.to)}</aside>
  <main class="doc">
    <article class="md">${body}</article>
    <p class="edit"><a href="${REPO}/blob/main/${p.from}" target="_blank" rel="noopener">Edit this page on GitHub</a></p>
  </main>
  ${toc}
</div>
<script src="../site.js"></script>
</body>
</html>
`;
}

export function build() {
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
