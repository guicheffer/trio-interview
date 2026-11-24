import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { BIN } from './lib/binaries.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SOLUTIONS = path.join(ROOT, '.solutions')
const CLAUDE_PROJECTS = path.join(os.homedir(), '.claude', 'projects')
const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'build', '.vite', '.next', '.git'])
const EXCLUDED_FILES = new Set(['.DS_Store'])
const MAX_EMBED_BYTES = 300 * 1024
const MAX_DB_BYTES = 5 * 1024 * 1024

interface Message {
  role: 'user' | 'assistant' | 'tool' | 'system'
  text: string
  timestamp?: string
  model?: string
  agent?: string
}

interface Conversation {
  id: string
  source: 'chat' | 'claude-code'
  title: string
  model?: string
  startedAt?: string
  endedAt?: string
  sessionId?: string
  subagents: number
  messages: Message[]
  file: string
}

interface FileEntry {
  path: string
  size: number
  content?: string
  omitted?: string
}

interface Terminal {
  id: string
  label: string
  scrollback: string
}

type Json = Record<string, any>

function ask(rl: readline.Interface, q: string): Promise<string> {
  return new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())))
}

function exerciseDirs(candidateDir: string): string[] {
  try {
    return fs
      .readdirSync(candidateDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => d.name)
  } catch {
    return []
  }
}

function readJson(file: string): Json {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Json
  } catch {
    return {}
  }
}

function newestMtime(dir: string): number {
  let newest = 0
  try {
    newest = fs.statSync(dir).mtimeMs
    for (const name of fs.readdirSync(dir)) {
      if (name === 'node_modules') continue
      const m = fs.statSync(path.join(dir, name)).mtimeMs
      if (m > newest) newest = m
    }
  } catch {
    return newest
  }
  return newest
}

function listCandidates() {
  if (!fs.existsSync(SOLUTIONS)) return []
  return fs
    .readdirSync(SOLUTIONS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const dir = path.join(SOLUTIONS, d.name)
      const exercises = exerciseDirs(dir)
      const mtime = Math.max(newestMtime(dir), ...exercises.map((e) => newestMtime(path.join(dir, e))))
      return { name: d.name, exercises, mtime }
    })
    .filter((c) => c.exercises.length > 0)
    .sort((a, b) => b.mtime - a.mtime)
}

function fmtDate(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

function trimDashes(s: string): string {
  let start = 0
  let end = s.length
  while (start < end && s.charAt(start) === '-') start++
  while (end > start && s.charAt(end - 1) === '-') end--
  return s.slice(start, end)
}

function slugify(s: string): string {
  return trimDashes(s.toLowerCase().replace(/[^a-z0-9]+/g, '-')).slice(0, 50) || 'untitled'
}

function isExcludedFile(name: string): boolean {
  return EXCLUDED_FILES.has(name) || name.endsWith('.db-journal')
}

function walk(dir: string, rel = ''): { rel: string; abs: string; size: number }[] {
  const out: { rel: string; abs: string; size: number }[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    const r = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue
      out.push(...walk(abs, r))
    } else if (entry.isFile()) {
      if (isExcludedFile(entry.name)) continue
      out.push({ rel: r, abs, size: fs.statSync(abs).size })
    }
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel))
}

function looksBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8000)
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true
  return false
}

function collectFiles(exerciseDir: string, codeOut: string): FileEntry[] {
  const entries: FileEntry[] = []
  for (const f of walk(exerciseDir)) {
    const isDb = /\.(db|sqlite|sqlite3)$/i.test(f.rel)
    if (isDb && f.size > MAX_DB_BYTES) {
      entries.push({ path: f.rel, size: f.size, omitted: 'database too large, not exported' })
      continue
    }
    const dest = path.join(codeOut, f.rel)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(f.abs, dest)
    const entry: FileEntry = { path: f.rel, size: f.size }
    if (f.size > MAX_EMBED_BYTES) {
      entry.omitted = 'larger than 300 KB'
    } else {
      const buf = fs.readFileSync(f.abs)
      if (looksBinary(buf)) entry.omitted = 'binary file'
      else entry.content = buf.toString('utf8')
    }
    entries.push(entry)
  }
  return entries
}

function oneLine(s: string, max = 140): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 3)}...` : t
}

function summarizeTool(name: string, input: Json): string {
  const i = input || {}
  const key =
    i.file_path ??
    i.path ??
    i.command ??
    i.pattern ??
    i.url ??
    i.query ??
    i.description ??
    i.prompt ??
    (Object.keys(i).length ? JSON.stringify(i) : '')
  const extra = name === 'Agent' || name === 'Task' ? ` (${i.subagent_type ?? 'subagent'})` : ''
  return oneLine(`${name}${extra}: ${typeof key === 'string' ? key : JSON.stringify(key)}`)
}

const ESC = String.fromCharCode(27)
const BEL = String.fromCharCode(7)
const ANSI_CSI = new RegExp(`${ESC}\\[[0-9;?]*[ -/]*[@-~]`, 'g')
const ANSI_OSC = new RegExp(`${ESC}\\][^${BEL}]*${BEL}`, 'g')

function stripAnsi(s: string): string {
  return s.replace(ANSI_CSI, '').replace(ANSI_OSC, '')
}

function readJsonl(file: string): Json[] {
  const out: Json[] = []
  let raw = ''
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch {
    return out
  }
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      out.push(JSON.parse(line) as Json)
    } catch {
      continue
    }
  }
  return out
}

function contentBlocks(content: unknown): Json[] {
  if (typeof content === 'string') return [{ type: 'text', text: content }]
  return Array.isArray(content) ? content : []
}

function blockMessages(b: Json, role: Message['role'], msg: Json, ts: string | undefined, agent: string | undefined, agentMap?: Map<string, Message[]>): Message[] {
  if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
    return [{ role, text: b.text.trim(), timestamp: ts, model: role === 'assistant' ? msg.model : undefined, agent }]
  }
  if (b.type !== 'tool_use') return []
  const tool: Message = { role: 'tool', text: summarizeTool(String(b.name ?? 'tool'), b.input), timestamp: ts, agent }
  return [tool, ...(agentMap?.get(String(b.id)) ?? [])]
}

function eventsToMessages(events: Json[], agent?: string, agentMap?: Map<string, Message[]>) {
  const messages: Message[] = []
  let model: string | undefined
  for (const e of events) {
    const msg = e.message
    if (e.isMeta || (e.type !== 'user' && e.type !== 'assistant') || !msg) continue
    const role = msg.role === 'assistant' ? 'assistant' : 'user'
    if (role === 'assistant' && !model && msg.model && msg.model !== '<synthetic>') model = msg.model
    for (const b of contentBlocks(msg.content)) messages.push(...blockMessages(b, role, msg, e.timestamp, agent, agentMap))
  }
  return { messages, model }
}

function subagentLabel(meta: Json): string {
  const description = meta.description ? `: ${meta.description}` : ''
  const model = meta.model ? ` [${meta.model}]` : ''
  return `${meta.agentType ?? 'subagent'}${description}${model}`
}

function loadSubagents(sessionDir: string): { byToolUse: Map<string, Message[]>; count: number } {
  const byToolUse = new Map<string, Message[]>()
  const dir = path.join(sessionDir, 'subagents')
  let count = 0
  if (!fs.existsSync(dir)) return { byToolUse, count }
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.jsonl')).sort()) {
    const meta = readJson(path.join(dir, name.replace(/\.jsonl$/, '.meta.json')))
    const label = subagentLabel(meta)
    const { messages } = eventsToMessages(readJsonl(path.join(dir, name)), label)
    count++
    const key = String(meta.toolUseId ?? `orphan-${name}`)
    byToolUse.set(key, [...(byToolUse.get(key) ?? []), ...messages])
  }
  return { byToolUse, count }
}

function encodeProjectPath(p: string): string {
  return p.replace(/[^a-zA-Z0-9]/g, '-')
}

function loadTranscripts(exerciseDir: string): Conversation[] {
  const enc = encodeProjectPath(exerciseDir)
  // The chat keeps its sessions in the interviewer's ~/.claude, the Claude Code terminal in a private config next to the exercise
  const roots = [CLAUDE_PROJECTS, path.join(path.dirname(exerciseDir), `.agent-claude-${path.basename(exerciseDir)}`, 'projects')]
  const folders = roots
    .filter((root) => fs.existsSync(root))
    .flatMap((root) => fs.readdirSync(root).filter((n) => n === enc || n.startsWith(`${enc}-codebase`)).map((n) => path.join(root, n)))
  const out: Conversation[] = []
  for (const folder of folders) {
    for (const name of fs.readdirSync(folder).filter((n) => n.endsWith('.jsonl'))) {
      const sessionId = name.replace(/\.jsonl$/, '')
      const events = readJsonl(path.join(folder, name))
      const sub = loadSubagents(path.join(folder, sessionId))
      const { messages, model } = eventsToMessages(events, undefined, sub.byToolUse)
      const seen = new Set(messages)
      for (const [key, msgs] of sub.byToolUse) {
        if (msgs.length && !seen.has(msgs[0]) && key) messages.push(...msgs)
      }
      if (!messages.length) continue
      const firstUser = messages.find((m) => m.role === 'user' && !m.agent)
      const stamps = events.map((e) => e.timestamp).filter((t): t is string => typeof t === 'string').sort()
      out.push({
        id: sessionId,
        source: 'claude-code',
        title: firstUser ? oneLine(firstUser.text.split('\n').find((l) => l.trim() && !l.trim().startsWith('@')) ?? firstUser.text, 70) : sessionId,
        model,
        startedAt: stamps[0],
        endedAt: stamps[stamps.length - 1],
        sessionId,
        subagents: sub.count,
        messages,
        file: '',
      })
    }
  }
  return out.sort((a, b) => (a.startedAt ?? '').localeCompare(b.startedAt ?? ''))
}

function threadsToConversations(threads: Json[]): Conversation[] {
  return threads.map((t, idx) => {
    const raw: Json[] = Array.isArray(t.messages) ? t.messages : []
    const messages: Message[] = raw
      .filter((m) => m && typeof m.content === 'string')
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        text: String(m.content),
        timestamp: m.timestamp ? String(m.timestamp) : undefined,
        model: m.role === 'assistant' && t.model ? String(t.model) : undefined,
      }))
    const stamps = messages.map((m) => m.timestamp).filter((x): x is string => !!x).sort()
    return {
      id: String(t.id ?? `thread-${idx + 1}`),
      source: 'chat',
      title: String(t.title || `Chat thread ${idx + 1}`),
      model: t.model ? String(t.model) : undefined,
      startedAt: t.createdAt ? String(t.createdAt) : stamps[0],
      endedAt: stamps[stamps.length - 1],
      sessionId: t.claudeSessionId ? String(t.claudeSessionId) : undefined,
      subagents: 0,
      messages,
      file: '',
    }
  })
}

function markdownHeader(c: Conversation, candidate: string, exercise: string): string[] {
  const lines: string[] = [`# ${c.title}`, '']
  lines.push(`- Candidate: ${candidate}`, `- Exercise: ${exercise}`)
  lines.push(`- Source: ${c.source === 'chat' ? 'In-app chat thread' : 'Claude Code session'}`)
  if (c.model) lines.push(`- Model: ${c.model}`)
  if (c.sessionId) lines.push(`- Session id: ${c.sessionId}`)
  if (c.startedAt) lines.push(`- Started: ${c.startedAt}`)
  if (c.subagents) lines.push(`- Subagent runs: ${c.subagents}`)
  lines.push('', '---', '')
  return lines
}

function speakerOf(m: Message): string {
  if (m.role === 'user') return m.agent ? 'Prompt' : 'Candidate'
  return m.model ? `Assistant (${m.model})` : 'Assistant'
}

function renderMarkdown(c: Conversation, candidate: string, exercise: string): string {
  const lines = markdownHeader(c, candidate, exercise)
  let agent: string | undefined
  let inTools = false
  for (const m of c.messages) {
    if (m.agent !== agent) {
      if (inTools) lines.push('')
      inTools = false
      agent = m.agent
      lines.push(agent ? `## Subagent run: ${agent}` : '## Back to main conversation', '')
    }
    if (m.role === 'tool') {
      lines.push(`- \`${m.text.replace(/`/g, "'")}\``)
      inTools = true
      continue
    }
    if (inTools) lines.push('')
    inTools = false
    const when = m.timestamp ? `, ${m.timestamp}` : ''
    lines.push(`### ${speakerOf(m)}${when}`, '', m.text, '')
  }
  return `${lines.join('\n')}\n`
}

function exportReadme(candidate: string, exercise: string, exportedAt: string, convs: Conversation[], fileCount: number): string {
  return `# ${candidate} / ${exercise}

Exported ${exportedAt}.

## Contents

- \`viewer.html\`: self-contained viewer (code tree, file viewer, conversations, terminals). Open it directly in a browser or host it on any static host. No server or network needed.
- \`code/\`: the exercise working copy (${fileCount} files, without node_modules, dist, build, .vite).
- \`conversations/\`: ${convs.length} Markdown files, one per Claude Code session or in-app chat thread.
- \`data.json\`: machine readable dump of everything above.

## Opening the viewer

Unzip, then double click \`viewer.html\`, or upload the whole folder to a static host (S3, GitHub Pages, Netlify) and open \`viewer.html\`.
`
}

const VIEWER_TEMPLATE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Candidate export</title>
<style>
:root{--bg:#fafaf9;--panel:#fff;--fg:#1c1917;--muted:#78716c;--line:#e7e5e4;--accent:#15803d;--user:#dcfce7;--asst:#f5f5f4;--tool:#f5f5f4;--code:#fff;--hover:#f0efed;--sel:#dcfce7}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--panel:#1c1b1a;--fg:#e7e5e4;--muted:#a8a29e;--line:#2c2a28;--accent:#4ade80;--user:#14532d;--asst:#262422;--tool:#1f1e1c;--code:#181716;--hover:#262422;--sel:#14532d}}
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;display:flex;flex-direction:column}
header{display:flex;align-items:center;gap:16px;padding:10px 16px;border-bottom:1px solid var(--line);background:var(--panel);flex-wrap:wrap}
header h1{font-size:15px;margin:0;font-weight:600}
header .meta{color:var(--muted);font-size:12px}
nav{display:flex;gap:4px;margin-left:auto}
nav button{background:none;border:1px solid var(--line);color:var(--fg);padding:5px 12px;border-radius:6px;cursor:pointer;font:inherit}
nav button[aria-selected=true]{background:var(--accent);border-color:var(--accent);color:#fff}
main{flex:1;min-height:0;display:flex}
.pane{display:none;flex:1;min-width:0;min-height:0}
.pane.on{display:flex}
.side{width:300px;flex:none;overflow:auto;border-right:1px solid var(--line);background:var(--panel);padding:8px 0}
.body{flex:1;min-width:0;overflow:auto;background:var(--code)}
details>summary{cursor:pointer;padding:2px 8px;list-style:none;white-space:nowrap}
details>summary::before{content:"+ ";color:var(--muted);font-family:ui-monospace,monospace}
details[open]>summary::before{content:"- "}
.kids{margin-left:12px;border-left:1px solid var(--line)}
.file{display:block;width:100%;text-align:left;background:none;border:0;color:var(--fg);padding:2px 8px 2px 22px;cursor:pointer;font:inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.file:hover,summary:hover{background:var(--hover)}
.file.sel,.item.sel{background:var(--sel)}
.file.omit{color:var(--muted)}
.tabs{display:flex;gap:2px;padding:6px 8px 0;border-bottom:1px solid var(--line);overflow:auto;background:var(--panel)}
.tabs span{padding:4px 10px;font-size:12px;color:var(--muted);border:1px solid transparent;border-bottom:0;white-space:nowrap;cursor:pointer}
.tabs span.on{color:var(--fg);border-color:var(--line);background:var(--code)}
.fhead{padding:8px 16px;color:var(--muted);font-size:12px;border-bottom:1px solid var(--line);font-family:ui-monospace,monospace}
.codewrap{display:grid;grid-template-columns:auto 1fr;font:12.5px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace}
.codewrap pre{margin:0;padding:12px 0}
.gutter{padding-left:12px;padding-right:12px;text-align:right;color:var(--muted);user-select:none;border-right:1px solid var(--line)}
.codewrap .src{padding-left:14px;padding-right:16px;overflow:auto;tab-size:2}
.empty{padding:24px;color:var(--muted)}
.item{display:block;width:100%;text-align:left;background:none;border:0;border-bottom:1px solid var(--line);color:var(--fg);padding:10px 12px;cursor:pointer;font:inherit}
.item:hover{background:var(--hover)}
.item .t{font-weight:600;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.item .s{color:var(--muted);font-size:12px}
.chat{padding:16px;max-width:920px;margin:0 auto;display:flex;flex-direction:column;gap:10px}
.chat h2{margin:0 0 4px;font-size:16px}
.bubble{padding:8px 12px;border-radius:12px;max-width:88%;white-space:pre-wrap;word-break:break-word}
.bubble.user{background:var(--user);align-self:flex-end}
.bubble.assistant{background:var(--asst);align-self:flex-start}
.bubble .who{font-size:11px;color:var(--muted);margin-bottom:2px;display:block;white-space:normal}
.tool{align-self:flex-start;background:var(--tool);color:var(--muted);font:12px ui-monospace,monospace;padding:3px 8px;border-radius:6px;max-width:88%;word-break:break-word}
.agent{align-self:stretch;border-top:1px dashed var(--line);color:var(--accent);font-size:12px;padding-top:6px}
.agent~.bubble,.agent~.tool{margin-left:24px}
.term{margin:0;padding:12px 16px;font:12px/1.45 ui-monospace,monospace;white-space:pre-wrap;word-break:break-all}
@media (max-width:760px){main{flex-direction:column}.pane.on{flex-direction:column}.side{width:100%;max-height:35vh;border-right:0;border-bottom:1px solid var(--line)}nav{margin-left:0}}
</style>
</head>
<body>
<header>
<h1 id="title"></h1>
<span class="meta" id="meta"></span>
<nav id="nav" role="tablist"></nav>
</header>
<main>
<section class="pane" id="p-code"><div class="side" id="tree"></div><div class="body" id="fileview"></div></section>
<section class="pane" id="p-chats"><div class="side" id="chatlist"></div><div class="body" id="chatview"></div></section>
<section class="pane" id="p-terms"><div class="side" id="termlist"></div><div class="body" id="termview"></div></section>
</main>
<script type="application/json" id="data">__DATA__</script>
<script>
(function () {
  var D = JSON.parse(document.getElementById('data').textContent);
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function fmtTime(t) {
    if (!t) return '';
    var d = new Date(t);
    return isNaN(d.getTime()) ? String(t) : d.toLocaleString();
  }
  function fmtSize(n) { return n > 1024 ? Math.round(n / 1024) + ' KB' : n + ' B'; }

  document.title = D.candidate + ' / ' + D.exercise;
  document.getElementById('title').textContent = D.candidate + ' / ' + D.exercise;
  document.getElementById('meta').textContent = 'Exported ' + fmtTime(D.exportedAt) + ' | ' + D.files.length + ' files | ' + D.conversations.length + ' conversations';

  var panes = [['code', 'Code'], ['chats', 'Conversations']];
  if (D.terminals && D.terminals.length) panes.push(['terms', 'Terminals']);
  var nav = document.getElementById('nav');
  function show(id) {
    panes.forEach(function (p) {
      document.getElementById('p-' + p[0]).classList.toggle('on', p[0] === id);
    });
    Array.prototype.forEach.call(nav.children, function (b) {
      b.setAttribute('aria-selected', b.getAttribute('data-id') === id ? 'true' : 'false');
    });
  }
  panes.forEach(function (p) {
    var b = el('button', '', p[1]);
    b.setAttribute('role', 'tab');
    b.setAttribute('data-id', p[0]);
    b.addEventListener('click', function () { show(p[0]); });
    nav.appendChild(b);
  });

  var byPath = {};
  D.files.forEach(function (f) { byPath[f.path] = f; });
  function resolvePath(p) {
    if (!p) return null;
    p = String(p).replace(/^\.?\//, '');
    if (byPath[p]) return p;
    var keys = Object.keys(byPath);
    for (var i = 0; i < keys.length; i++) {
      if (p.slice(-keys[i].length) === keys[i] && p.charAt(p.length - keys[i].length - 1) === '/') return keys[i];
    }
    return null;
  }

  var tree = {};
  D.files.forEach(function (f) {
    var parts = f.path.split('/');
    var node = tree;
    for (var i = 0; i < parts.length - 1; i++) {
      node[parts[i]] = node[parts[i]] || { __dir: true, kids: {} };
      node = node[parts[i]].kids;
    }
    node[parts[parts.length - 1]] = { __file: f };
  });

  var fileButtons = {};
  var currentPath = null;
  var openTabs = [];
  var treeEl = document.getElementById('tree');
  function renderTree(node, parent, depth) {
    Object.keys(node).sort(function (a, b) {
      var da = !!node[a].__dir, db = !!node[b].__dir;
      if (da !== db) return da ? -1 : 1;
      return a < b ? -1 : a > b ? 1 : 0;
    }).forEach(function (name) {
      var n = node[name];
      if (n.__dir) {
        var d = el('details');
        if (depth < 1) d.open = true;
        d.appendChild(el('summary', '', name));
        var k = el('div', 'kids');
        renderTree(n.kids, k, depth + 1);
        d.appendChild(k);
        parent.appendChild(d);
      } else {
        var b = el('button', 'file' + (n.__file.omitted ? ' omit' : ''), name);
        b.title = n.__file.path + (n.__file.omitted ? ' (' + n.__file.omitted + ')' : '');
        b.addEventListener('click', function () { openFile(n.__file.path, true); });
        fileButtons[n.__file.path] = b;
        parent.appendChild(b);
      }
    });
  }
  renderTree(tree, treeEl, 0);

  var fileview = document.getElementById('fileview');
  function openFile(p, addTab) {
    var f = byPath[p];
    if (!f) return;
    currentPath = p;
    if (addTab && openTabs.indexOf(p) === -1) openTabs.push(p);
    Object.keys(fileButtons).forEach(function (k) { fileButtons[k].classList.toggle('sel', k === p); });
    clear(fileview);
    if (openTabs.length) {
      var tabs = el('div', 'tabs');
      openTabs.forEach(function (t) {
        var s = el('span', t === p ? 'on' : '', t.split('/').pop());
        s.title = t;
        s.addEventListener('click', function () { openFile(t, false); });
        tabs.appendChild(s);
      });
      fileview.appendChild(tabs);
    }
    fileview.appendChild(el('div', 'fhead', f.path + '  (' + fmtSize(f.size) + ')'));
    if (f.omitted) {
      fileview.appendChild(el('div', 'empty', 'Content omitted: ' + f.omitted + '. The file is available in the code folder of the zip.'));
      return;
    }
    var lines = (f.content || '').split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    var wrap = el('div', 'codewrap');
    var nums = [];
    for (var i = 1; i <= lines.length; i++) nums.push(i);
    var g = el('pre', 'gutter', nums.join('\n'));
    var c = el('pre', 'src', lines.join('\n'));
    wrap.appendChild(g);
    wrap.appendChild(c);
    fileview.appendChild(wrap);
  }
  var ui = D.ui || {};
  (ui.openTabs || []).forEach(function (t) { var r = resolvePath(t); if (r && openTabs.indexOf(r) === -1) openTabs.push(r); });
  var first = resolvePath(ui.activeFile) || resolvePath('description.md') || (D.files[0] && D.files[0].path);
  if (first) openFile(first, true);
  else fileview.appendChild(el('div', 'empty', 'No files.'));

  var chatlist = document.getElementById('chatlist');
  var chatview = document.getElementById('chatview');
  var chatButtons = [];
  function openChat(i) {
    var c = D.conversations[i];
    chatButtons.forEach(function (b, j) { b.classList.toggle('sel', j === i); });
    clear(chatview);
    var box = el('div', 'chat');
    box.appendChild(el('h2', '', c.title));
    var info = [c.source === 'chat' ? 'In-app chat' : 'Claude Code session'];
    if (c.model) info.push('model: ' + c.model);
    if (c.startedAt) info.push(fmtTime(c.startedAt));
    if (c.subagents) info.push(c.subagents + ' subagent runs');
    box.appendChild(el('div', 's', info.join(' | ')));
    box.lastChild.style.color = 'var(--muted)';
    var agent;
    c.messages.forEach(function (m) {
      if (m.agent !== agent) {
        agent = m.agent;
        box.appendChild(el('div', 'agent', agent ? 'Subagent run: ' + agent : 'Back to main conversation'));
      }
      if (m.role === 'tool') { box.appendChild(el('div', 'tool', m.text)); return; }
      var b = el('div', 'bubble ' + (m.role === 'user' ? 'user' : 'assistant'));
      var who = m.role === 'user' ? (m.agent ? 'Prompt' : 'Candidate') : 'Assistant';
      if (m.model) who += ' | ' + m.model;
      if (m.timestamp) who += ' | ' + fmtTime(m.timestamp);
      b.appendChild(el('span', 'who', who));
      b.appendChild(document.createTextNode(m.text));
      box.appendChild(b);
    });
    chatview.appendChild(box);
    chatview.scrollTop = 0;
  }
  if (!D.conversations.length) chatview.appendChild(el('div', 'empty', 'No conversations were found for this candidate.'));
  D.conversations.forEach(function (c, i) {
    var b = el('button', 'item');
    b.appendChild(el('span', 't', c.title));
    b.appendChild(el('span', 's', (c.source === 'chat' ? 'Chat' : 'Claude Code') + (c.model ? ' | ' + c.model : '') + ' | ' + c.messages.length + ' items | ' + fmtTime(c.startedAt)));
    b.addEventListener('click', function () { openChat(i); });
    chatButtons.push(b);
    chatlist.appendChild(b);
  });
  if (D.conversations.length) openChat(0);

  var termlist = document.getElementById('termlist');
  var termview = document.getElementById('termview');
  (D.terminals || []).forEach(function (t, i) {
    var b = el('button', 'item');
    b.appendChild(el('span', 't', t.label || t.id));
    b.addEventListener('click', function () {
      clear(termview);
      termview.appendChild(el('pre', 'term', t.scrollback || ''));
    });
    termlist.appendChild(b);
    if (i === 0) b.click();
  });

  show(location.hash === '#chats' ? 'chats' : 'code');
})();
</script>
</body>
</html>
`

function buildViewer(data: Json): string {
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  return VIEWER_TEMPLATE.replace('__DATA__', () => json)
}

function conversationLabel(c: Conversation): string {
  if (c.source !== 'chat') return `claude-${slugify(c.title)}-${c.id.slice(0, 8)}`
  const model = c.model ? `-${slugify(c.model)}` : ''
  return `chat-${slugify(c.title)}${model}`
}

function fail(message: string, rl?: readline.Interface | null): never {
  console.error(message)
  rl?.close()
  return process.exit(1)
}

async function chooseByNumber(rl: readline.Interface, items: string[], prompt: string): Promise<string> {
  const pick = Number(await ask(rl, prompt))
  if (!Number.isInteger(pick) || pick < 1 || pick > items.length) fail('Invalid choice', rl)
  return items[pick - 1]
}

async function chooseCandidate(rl: readline.Interface | null, candidates: ReturnType<typeof listCandidates>): Promise<string> {
  if (!candidates.length) fail(`No candidates with exercises found in ${SOLUTIONS}`)
  if (!rl) fail('No candidate given and no TTY. Usage: npx tsx scripts/export-candidate.ts <name> [exercise]')
  console.log('\nCandidates:\n')
  candidates.forEach((c, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. ${c.name.padEnd(24)} ${fmtDate(c.mtime)}  ${c.exercises.join(', ')}`)
  })
  return chooseByNumber(rl, candidates.map((c) => c.name), '\nPick a candidate number: ')
}

async function chooseExercise(name: string, exercises: string[], state: Json, rl: readline.Interface | null, interactive: boolean): Promise<string> {
  if (exercises.length === 1) return exercises[0]
  if (interactive && rl) {
    console.log(`\nExercises for ${name}:\n`)
    exercises.forEach((e, i) => console.log(`  ${i + 1}. ${e}${e === state.currentExercise ? '  (current)' : ''}`))
    return chooseByNumber(rl, exercises, '\nPick an exercise number: ')
  }
  if (state.currentExercise && exercises.includes(state.currentExercise)) return state.currentExercise
  return fail(`Several exercises found (${exercises.join(', ')}). Pass one as second argument.`, rl)
}

function uiStateOf(state: Json, exercise: string): Json {
  return state.ui && typeof state.ui === 'object' ? (state.ui[exercise] ?? {}) : {}
}

function terminalsOf(ui: Json): Terminal[] {
  const raw: Json[] = Array.isArray(ui.terminals) ? ui.terminals : []
  return raw.map((t: Json, i: number) => ({
    id: String(t?.id ?? `terminal-${i + 1}`),
    label: String(t?.label ?? `Terminal ${i + 1}`),
    scrollback: stripAnsi(String(t?.scrollback ?? '')),
  }))
}

function transcriptSummary(s: Conversation): Json {
  return {
    sessionId: s.sessionId,
    title: s.title,
    model: s.model,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    messages: s.messages.filter((m) => m.role !== 'tool').length,
    toolCalls: s.messages.filter((m) => m.role === 'tool').length,
    subagentRuns: s.subagents,
    file: s.file,
  }
}

function writeExport(name: string, exercise: string, state: Json, exerciseDir: string): void {
  const exportedAt = new Date().toISOString()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'export-candidate-'))
  const outName = `${name}-${exercise}-${stamp()}`
  try {
    const files = collectFiles(exerciseDir, path.join(tmp, 'code'))

    const ui = uiStateOf(state, exercise)
    const threads: Json[] = Array.isArray(ui.threads) ? ui.threads : []
    const terminals = terminalsOf(ui)

    const sessions = loadTranscripts(exerciseDir)
    const chats = threadsToConversations(threads)
    const conversations = [...sessions, ...chats]
    fs.mkdirSync(path.join(tmp, 'conversations'), { recursive: true })
    conversations.forEach((c, i) => {
      const n = String(i + 1).padStart(2, '0')
      const label = conversationLabel(c)
      c.file = `conversations/${n}-${label}.md`
      fs.writeFileSync(path.join(tmp, c.file), renderMarkdown(c, name, exercise))
    })

    const data: Json = {
      candidate: name,
      exercise,
      exportedAt,
      state: { currentExercise: state.currentExercise, createdAt: state.createdAt, lastAccessed: state.lastAccessed },
      ui: { updatedAt: ui.updatedAt, openTabs: ui.openTabs ?? [], activeFile: ui.activeFile },
      files: files.map((f) => ({ path: f.path, size: f.size, content: f.content, omitted: f.omitted })),
      terminals,
      conversations,
      threads,
      transcripts: sessions.map(transcriptSummary),
    }

    const dataFile: Json = {
      ...data,
      files: files.map((f) => ({ path: f.path, size: f.size, omitted: f.omitted ?? null })),
      conversations: conversations.map((c) => ({ ...c })),
    }
    fs.writeFileSync(path.join(tmp, 'data.json'), `${JSON.stringify(dataFile, null, 2)}\n`)
    fs.writeFileSync(path.join(tmp, 'viewer.html'), buildViewer(data))
    fs.writeFileSync(path.join(tmp, 'README.md'), exportReadme(name, exercise, exportedAt, conversations, files.length))

    const outDir = path.join(ROOT, 'exports')
    fs.mkdirSync(outDir, { recursive: true })
    const zipPath = path.join(outDir, `${outName}.zip`)
    fs.rmSync(zipPath, { force: true })
    execFileSync(BIN.zip, ['-r', '-q', zipPath, '.'], { cwd: tmp })
    const kb = Math.round(fs.statSync(zipPath).size / 1024)
    console.log(`\nExported ${files.length} files, ${sessions.length} Claude Code sessions, ${chats.length} chat threads`)
    console.log(`${zipPath} (${kb} KB)`)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

async function main() {
  const [argName, argExercise] = process.argv.slice(2)
  const candidates = listCandidates()
  const interactive = Boolean(process.stdin.isTTY) && !argName
  const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null

  const name = argName || (await chooseCandidate(rl, candidates))
  const candidateDir = path.join(SOLUTIONS, name)
  const exercises = exerciseDirs(candidateDir)
  if (!exercises.length) fail(`No exercises found for "${name}" in ${candidateDir}`, rl)
  const state = readJson(path.join(candidateDir, 'state.json'))

  const exercise = argExercise || (await chooseExercise(name, exercises, state, rl, interactive))
  rl?.close()

  const exerciseDir = path.join(candidateDir, exercise)
  if (!fs.existsSync(exerciseDir)) fail(`Exercise folder not found: ${exerciseDir}`)
  writeExport(name, exercise, state, exerciseDir)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
