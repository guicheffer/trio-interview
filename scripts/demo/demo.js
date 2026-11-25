// The live demo page. The workspace is the scene of the landing page (../app/scene-fib.html), embedded by address so whatever
// improves there improves here. This file fits it to the window and makes the workspace usable: the file tree opens files in tabs,
// the editor shows each file (code coloured, markdown rendered, fibonacci.js editable), Run runs the file in a Worker and prints what
// Node prints, panels collapse, and the switcher changes the assistant shown on the right. Nothing is sent anywhere or saved.
(function () {
  'use strict';
  var frame = document.getElementById('app'), box = document.getElementById('box'), stage = document.getElementById('stage');
  var buttons = [].slice.call(document.querySelectorAll('.opt[data-mode]'));
  var FILES = window.DEMO_FILES || {}, TOK = window.DemoTokenize;
  var doc, win, current = 'claude-code', views = {}, inner = null;

  function fit() {
    var w = stage.clientWidth - 24, h = stage.clientHeight - 24;
    var s = Math.max(0.1, Math.min(w / 1440, h / 900, 1));   // never larger than the 1440 x 900 it was drawn at, so text stays sharp
    box.style.width = Math.round(1440 * s) + 'px';
    box.style.height = Math.round(900 * s) + 'px';
    frame.style.transform = 'scale(' + s + ')';
  }
  fit(); addEventListener('resize', fit);

  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  var CSS = [
    '.demo-chat{display:flex;flex-direction:column;height:100%;background:#111827;color:#f3f4f6;font:14px/1.4 system-ui,sans-serif;border-left:1px solid #374151}',
    '.demo-chat .hd{padding:12px 16px;border-bottom:1px solid #374151}.demo-chat .hd .r{display:flex;justify-content:space-between;align-items:center}',
    '.demo-chat h3{margin:0;font-size:14px;font-weight:600}.demo-chat .m{margin:2px 0 0;font:12px ui-monospace,monospace;color:#f472b6}',
    '.demo-chat .sub{margin:4px 0 0;font-size:12px;color:#9ca3af}.demo-chat .st{font-size:12px;background:#22c55e;color:#fff;border-radius:8px;padding:6px 10px;font-weight:500;opacity:.5}',
    '.demo-chat .body{flex:1;overflow:auto;padding:16px;text-align:center;color:#9ca3af;font-size:14px;padding-top:48px}.demo-chat .body svg{width:40px;height:40px;opacity:.4;margin-bottom:12px}',
    '.demo-chat form{border-top:1px solid #374151;padding:16px;display:flex;flex-direction:column;gap:8px}',
    '.demo-chat textarea{width:100%;box-sizing:border-box;min-height:36px;padding:8px 16px;border:1px solid #4b5563;border-radius:8px;background:#1f2937;color:#f3f4f6;font:14px/20px system-ui,sans-serif;resize:none}',
    '.demo-chat textarea::placeholder{color:#6b7280}.demo-chat .row{display:flex;justify-content:space-between;align-items:center;gap:8px}',
    '.demo-chat select{min-width:120px;font-size:12px;background:#374151;color:#d1d5db;border:1px solid #4b5563;border-radius:8px;padding:8px}',
    '.demo-chat .send{background:#16a34a;color:#fff;border:0;border-radius:8px;padding:8px 16px;font-size:14px;font-weight:500;opacity:.5}',
    '.demo-note{flex:none;padding:5px 12px;font:11px/1.35 system-ui,sans-serif;color:#9ca3af;background:#1a1a2e;border-bottom:1px solid #374151}',
    '.demo-oc{height:100%;background:#1a1a2e;color:#e5e7eb;font:13px/16px "Cascadia Code","Fira Code",Menlo,monospace;padding:12px;box-sizing:border-box;overflow:hidden}',
    '.demo-oc .bx{border:1px solid #4b5563;border-radius:4px;padding:8px 10px;margin-top:10px;color:#9ca3af}.demo-oc b{color:#e5e7eb}',
    '.demo-pick{height:100%;display:flex;align-items:center;justify-content:center;overflow:auto;padding:20px;background:#111827;font-family:system-ui,sans-serif;border-left:1px solid #374151}',
    '.demo-pick .in{width:100%;max-width:320px}.demo-pick h3{margin:0;font-size:14px;font-weight:600;color:#f3f4f6}.demo-pick p{margin:4px 0 0;font-size:12px;color:#9ca3af}',
    '.demo-pick .cards{margin-top:16px;display:flex;flex-direction:column;gap:8px}',
    '.demo-pick .card{display:flex;align-items:flex-start;gap:12px;width:100%;box-sizing:border-box;text-align:left;border:1px solid #374151;border-radius:8px;background:#1f2937;padding:12px;cursor:pointer;color:inherit;font:inherit}',
    '.demo-pick .card:hover:not(:disabled){border-color:#5850f8}.demo-pick .card:disabled{cursor:not-allowed;opacity:.5}',
    '.demo-pick .card b{display:block;font-size:14px;font-weight:500;color:#f3f4f6}.demo-pick .card i{display:block;font-style:normal;font-size:12px;color:#9ca3af}',
    '.demo-pick .badge{flex:none;margin-top:2px;width:16px;height:16px;border-radius:4px;display:flex;align-items:center;justify-content:center;font:700 10px system-ui;color:#fff;background:#5850f8}',
    '.demo-pick .pi{background:#374151;color:#e5e7eb;font-size:12px}',
    '.demo-ed{height:100%}.demo-scroll{height:100%;overflow:auto;display:flex;align-items:flex-start}',
    '.demo-gutter{position:sticky;left:0;z-index:2;flex:none;width:68px;box-sizing:border-box;padding-right:26px;text-align:right;font:14px/21px Menlo,Monaco,"Courier New",monospace;min-height:100%}',
    '.demo-gutter div{height:21px;color:var(--vscode-editorLineNumber-foreground,#858585)}',
    '.demo-code{position:relative;flex:1 0 auto;min-width:0;min-height:100%;font:14px/21px Menlo,Monaco,"Courier New",monospace}',
    '.demo-lines{width:max-content;min-width:100%;padding-bottom:30px}.demo-lines>div{height:21px;line-height:21px;white-space:pre}',
    '.demo-ta{position:absolute;left:0;top:0;margin:0;padding:0;border:0;outline:0;resize:none;overflow:hidden;background:transparent;color:transparent;caret-color:#aeafad;white-space:pre;tab-size:2;font:inherit;line-height:21px}',
    '.demo-ta::selection{background:rgba(38,79,120,.8)}',
    '.demo-empty{display:flex;align-items:center;justify-content:center;height:100%;background:#111827;color:#9ca3af;font:14px system-ui,sans-serif;text-align:center}',
    '.demo-empty svg{display:block;margin:0 auto 16px;width:48px;height:48px}',
    '.demo-starter{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:5px 10px;background:#1a1a2e;border-bottom:1px solid #2c2c3c;font:11px/1.4 system-ui,sans-serif;color:#9ca3af}',
    '.demo-starter .t{flex:1 1 220px}',
    '.demo-starter .v{flex:none;font:600 11px system-ui,sans-serif;color:#fff;background:#5850f8;border:0;border-radius:6px;padding:4px 10px;cursor:pointer}',
    '.demo-starter .v:hover{filter:brightness(1.12)}'
  ].join('');

  /* ---------------- the editor, its tabs and the file tree ---------------- */
  var ORDER = ['AGENTS.md', 'CLAUDE.md', 'description.md', 'fibonacci.js'];
  var LOCKED = { 'description.md': true };
  var open = ['description.md', 'fibonacci.js'], active = 'fibonacci.js', raw = {}, text = {};
  var tabsEl, bodyEl, lockSvg = '', treeButtons = {};

  function extColor(n) { return /\.md$/.test(n) ? 'bg-teal-500' : 'bg-yellow-500'; }
  function tabHtml(n) {
    var on = n === active;
    var cls = 'group flex items-center gap-1.5 pl-3 pr-1.5 py-1 border-r border-gray-200 dark:border-gray-700 text-xs cursor-pointer select-none flex-shrink-0 transition-colors ' +
      (on ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 border-b border-white dark:border-gray-900' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300');
    var close = on ? 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300' : 'hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-400';
    return '<div class="' + cls + '" role="tab" tabindex="0" aria-selected="' + on + '" data-file="' + n + '"><span class="w-2 h-2 rounded-full flex-shrink-0 ' + extColor(n) + '"></span><span class="font-mono max-w-[140px] truncate">' + n + '</span>' +
      (LOCKED[n] ? lockSvg : '') + '<button class="flex-shrink-0 w-4 h-4 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ' + close + '" title="Close tab" aria-label="Close ' + n + '">×</button></div>';
  }

  var PROSE = 'p-6 prose prose-sm dark:prose-invert max-w-none prose-headings:mb-3 prose-headings:mt-4 prose-p:my-2 prose-li:my-0.5 prose-code:bg-gray-100 prose-code:dark:bg-gray-800 prose-code:px-1.5 prose-code:rounded prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:p-4 prose-pre:rounded-xl prose-a:text-accent-600 prose-a:dark:text-accent-300 prose-strong:font-semibold prose-table:border prose-th:border prose-td:border prose-th:px-3 prose-th:py-1.5 prose-td:px-3 prose-td:py-1.5';
  var RUN = '<button title="Run: node fibonacci.js" class="flex items-center gap-1 px-2 py-1 text-xs rounded bg-accent-500 hover:bg-accent-600 text-white transition-colors font-medium"><svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>Run</button>';

  function header(n) {
    var md = /\.md$/.test(n);
    var badge = md || LOCKED[n]
      ? '<span class="flex-shrink-0 text-xs px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-medium">' + (md ? 'Markdown' : 'JavaScript') + '</span>'
      : '<span class="flex-shrink-0 text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium">JavaScript</span>';
    var toggle = md ? '<button data-toggle class="flex-shrink-0 text-xs px-2 py-0.5 rounded font-medium transition-colors ' + (raw[n] ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300' : 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300') + '">' + (raw[n] ? 'Raw' : 'Preview') + '</button>' : '';
    return '<div class="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-between gap-2"><div class="flex items-center gap-2 min-w-0"><span class="text-sm font-mono text-gray-700 dark:text-gray-300 truncate">' + n + '</span>' + badge + toggle + '</div><div class="flex items-center gap-2 flex-shrink-0">' + (n === 'fibonacci.js' ? RUN : '') + '</div></div>';
  }

  function codeView(n, editable) {
    var src = text[n];
    var lines = /\.js$/.test(n) && TOK ? TOK.codeHtml(src) : src.split('\n').map(function (l) { return '<span><span class="mtk1">' + esc(l).replace(/ /g, ' ') + '</span></span>'; });
    var gut = lines.map(function (_, i) { return '<div>' + (i + 1) + '</div>'; }).join('');
    return '<div class="monaco-editor vs-dark demo-ed" role="code"><div class="demo-scroll monaco-editor-background"><div class="demo-gutter margin">' + gut + '</div><div class="demo-code"><div class="demo-lines">' +
      lines.map(function (l) { return '<div>' + l + '</div>'; }).join('') + '</div>' +
      (editable ? '<textarea class="demo-ta" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Editor content, fibonacci.js (nothing is saved in the demo)"></textarea>' : '') + '</div></div></div>';
  }

  function sizeTextarea(ta) {
    var code = ta.parentNode, lines = code.querySelector('.demo-lines');
    ta.style.width = Math.max(code.clientWidth, lines.scrollWidth) + 'px';
    ta.style.height = Math.max(code.clientHeight, lines.scrollHeight) + 'px';
  }

  function drawBody() {
    var n = active, host = doc.getElementById('demo-viewer');
    if (!n) {
      host.innerHTML = '<div class="demo-empty"><div><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg><p>Select a file from the left sidebar</p></div></div>';
      return;
    }
    var md = /\.md$/.test(n), editable = n === 'fibonacci.js';
    var body = md && !raw[n] ? '<div class="' + PROSE + '">' + (FILES[n] ? FILES[n].html : '') + '</div>' : codeView(n, editable);
    host.innerHTML = '<div class="relative h-full"><div class="flex flex-col h-full overflow-hidden bg-white dark:bg-gray-900">' + header(n) + '<div class="flex-1 overflow-auto" style="min-height:0">' + body + '</div></div></div>';
    var ta = host.querySelector('.demo-ta');
    if (ta) {
      ta.value = text[n]; sizeTextarea(ta);
      ta.addEventListener('input', function () { text[n] = ta.value; redraw(ta); });
      ta.addEventListener('keydown', function (e) {
        if (e.key !== 'Tab') return;
        e.preventDefault();
        var s = ta.selectionStart; ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = s + 2;
        text[n] = ta.value; redraw(ta);
      });
    }
    var t = host.querySelector('[data-toggle]');
    if (t) t.addEventListener('click', function () { raw[n] = !raw[n]; drawBody(); });
  }

  function redraw(ta) {
    var host = ta.closest('.demo-ed'), lines = TOK.codeHtml(text['fibonacci.js']);
    host.querySelector('.demo-lines').innerHTML = lines.map(function (l) { return '<div>' + l + '</div>'; }).join('');
    host.querySelector('.demo-gutter').innerHTML = lines.map(function (_, i) { return '<div>' + (i + 1) + '</div>'; }).join('');
    sizeTextarea(ta);
  }

  function drawTabs() {
    tabsEl.innerHTML = open.map(tabHtml).join('');
    ORDER.forEach(function (n) {
      var b = treeButtons[n], row = b && b.parentNode, on = n === active;
      if (row) row.className = 'flex items-center rounded text-sm transition-colors ' + (on ? 'bg-accent-500 text-white dark:bg-accent-600' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-100');
    });
  }
  function openFile(n) { if (open.indexOf(n) < 0) open.push(n); active = n; drawTabs(); drawBody(); }
  function closeFile(n) {
    var i = open.indexOf(n); if (i < 0) return;
    open.splice(i, 1);
    if (active === n) active = open[Math.min(i, open.length - 1)] || null;
    drawTabs(); drawBody();
  }

  /* ---------------- the terminal and Run ---------------- */
  var HEAD = '<span class="xterm-fg-2">● maya / fibonacci</span>';
  var PROMPT = '<span class="xterm-fg-2">maya/fibonacci</span><span> $ </span>';
  var worker = null, runId = 0;
  function pane() { return doc.querySelectorAll('.xterm-rows')[0]; }
  function project(cmd, out) {
    var rows = [HEAD, '', PROMPT + '<span>' + esc(cmd || ' ') + '</span>'].concat((out || []).map(function (l) { return '<span>' + esc(l) + '</span>'; })).slice(-12);
    pane().innerHTML = rows.map(function (r) { return '<div style="width: 726px; height: 16px; line-height: 16px; overflow: hidden;">' + r + '</div>'; }).join('');
  }
  function runCode(src, done) {
    var lite = win.FIB && win.FIB.inspectLite;
    if (!lite) return done(['(the browser could not run it here)']);
    var code = 'self.window=self;' + lite + ';var out=[];var console={log:function(){out.push(inspectLite.line([].slice.call(arguments)))}};var module={exports:{}};' +
      'try{(function(){' + src + '\n})()}catch(e){out.push(e.name+": "+e.message)}postMessage(out)';
    try {
      if (worker) worker.terminate();
      var w = worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
      var timer = setTimeout(function () { w.terminate(); done(['(stopped: it ran for too long)']); }, 3000);
      w.onmessage = function (e) { clearTimeout(timer); w.terminate(); done([].concat.apply([], e.data.map(function (l) { return l.split('\n'); }))); };
      w.onerror = function () { clearTimeout(timer); done(['(the browser could not run it here)']); };
    } catch (e) { done(['(the browser could not run it here)']); }
  }
  function run() {
    var id = ++runId;
    project('node fibonacci.js');
    setTimeout(function () { runCode(text['fibonacci.js'], function (out) { if (id === runId) project('node fibonacci.js', out); }); }, 250);
  }

  /* ---------------- the empty starter, and the assistant's version ---------------- */
  var starterNote = null, versionBtn = null, usingAnswer = false;
  function setupStarter() {
    var term = doc.getElementById('terminal'); if (!term) return;
    var bar = term.querySelector('.min-h-\\[30px\\]') || term.firstElementChild.firstElementChild;
    starterNote = doc.createElement('div'); starterNote.className = 'demo-starter';
    starterNote.innerHTML = '<span class="t"></span><button type="button" class="v"></button>';
    bar.parentNode.insertBefore(starterNote, bar.nextSibling);
    versionBtn = starterNote.querySelector('.v');
    versionBtn.addEventListener('click', function () { setAnswer(!usingAnswer); });
    setAnswer(false);
  }
  /**
   * Swaps the editor between the empty starter and the version the assistant writes in the landing page's story. The code comes from the
   * scene (FIB.after, FIB.before) and its own functions draw the assistant's terminal, so nothing of the story is copied here.
   */
  function setAnswer(on) {
    usingAnswer = on;
    text['fibonacci.js'] = on ? win.FIB.after : (FILES['fibonacci.js'] || {}).text || win.FIB.before;
    try { if (on) win.fibShowAnswer(); else win.fibReset(); } catch (e) { /* the scene is still loading */ }
    hideSceneEditor();
    if (active === 'fibonacci.js') drawBody();
    project();
    starterNote.querySelector('.t').textContent = on
      ? 'This is the version the assistant wrote in the story of the landing page. It fills in fibonacci(n) and leaves fibonacciUpTo for you. Press Run to try it.'
      : 'The starter is empty on purpose: the assistant is what would fill it in. It is shown here, not connected.';
    versionBtn.textContent = on ? 'Back to the empty starter' : "Show the assistant's version";
  }
  // the scene's own editor is replaced by ours, and its functions redraw it, so keep that copy out of sight
  function hideSceneEditor() { [].forEach.call(doc.querySelectorAll('.view-lines, .view-zones'), function (e) { e.style.display = 'none'; }); }

  /* ---------------- panels that collapse ---------------- */
  var saved = {};
  function setCollapsed(id, hide, btn, shownMark, hiddenMark, hideTitle, showTitle) {
    var p = doc.getElementById(id); if (!p) return;
    if (hide) { saved[id] = p.style.flex; p.style.flex = '0 0 0px'; p.style.overflow = 'hidden'; [].forEach.call(p.children, function (c) { c.style.display = 'none'; }); }
    else { if (saved[id]) p.style.flex = saved[id]; p.style.overflow = 'visible'; [].forEach.call(p.children, function (c) { c.style.display = ''; }); }
    p.dataset.collapsed = hide ? '1' : '';
    if (btn) { btn.textContent = hide ? hiddenMark : shownMark; btn.title = hide ? showTitle : hideTitle; }
  }
  function wirePanels() {
    var defs = [['files', 'files', '‹', '›', 'Collapse', 'Expand'], ['terminal', 'editor', '∧', '∨', 'Hide terminal', 'Show terminal'], ['chat', 'main', '›', '‹', 'Collapse', 'Expand']];
    defs.forEach(function (d) {
      var btn = doc.querySelector('[role=separator][aria-controls="' + d[1] + '"] button'); if (!btn) return;
      btn.style.cursor = 'pointer';
      btn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); var p = doc.getElementById(d[0]); setCollapsed(d[0], !p.dataset.collapsed, btn, d[2], d[3], d[4], d[5]); });
      d.btn = btn;
    });
    var hide = [].slice.call(doc.querySelectorAll('#terminal button')).filter(function (b) { return b.title === 'Hide terminal'; })[0];
    if (hide) hide.addEventListener('click', function () { var d = defs[1]; setCollapsed('terminal', true, d.btn, d[2], d[3], d[4], d[5]); });
    api.expandAll = function () { defs.forEach(function (d) { if (doc.getElementById(d[0]).dataset.collapsed) setCollapsed(d[0], false, d.btn, d[2], d[3], d[4], d[5]); }); };
  }

  /* ---------------- the assistant on the right ---------------- */
  var NOTE = 'The assistant is shown, not connected: nobody can send it a message here.';
  var OC_ICON = '<svg class="h-4 w-4" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" shapeRendering="crispEdges"><path fill="#9CA3AF" d="M4 3h16v18H4z"/><path fill="#1F1F1F" d="M8 8h8v8H8z"/><path fill="#E5E7EB" d="M10 10h4v4h-4z"/></svg>';
  var PI_ICON = '<svg class="h-4 w-4" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="4" fill="#374151"/><path d="M6 8h12M9 8v9M15 8v9" stroke="#E5E7EB" stroke-width="2" stroke-linecap="round" fill="none"/></svg>';
  var chatHtml = '<div class="demo-chat"><div class="hd"><div class="r"><div><h3>AI Assistant</h3><p class="m">claude-sonnet-5-5</p></div><span class="st">&#9654; Start</span></div><p class="sub">Ask questions or request help</p></div>' +
    '<div class="body"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg><p>Click &#9654; Start to get a guided introduction</p></div>' +
    '<form onsubmit="return false"><textarea rows="1" disabled aria-label="Message to the assistant (disabled in the demo)" placeholder="Ask AI for help… (Shift+Enter for new line)"></textarea>' +
    '<div class="row"><select disabled aria-label="Model"><option>Sonnet 5.5 (latest)</option></select><button class="send" type="button" disabled>Send</button></div></form></div>';

  function pickerHtml() {
    return '<div class="demo-pick"><div class="in"><h3>How do you want to work with the assistant?</h3><p>Pick the one you are most comfortable with. In the demo a click only changes what is shown.</p><div class="cards">' +
      '<button class="card" data-pick="chat"><span class="badge">A</span><span><b>Agent mode</b><i>The chat panel, with model choice and plan mode.</i></span></button>' +
      '<button class="card" data-pick="claude-code"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" shapeRendering="crispEdges" style="flex:none;margin-top:2px"><path fill="#D97757" d="M5 7h14v8H5z"/><path fill="#D97757" d="M2 10h3v3H2zM19 10h3v3h-3z"/><path fill="#D97757" d="M6 15h2v4H6zM9 15h2v4H9zM13 15h2v4h-2zM16 15h2v4h-2z"/><path fill="#1F1F1F" d="M8 10h2v2H8zM14 10h2v2h-2z"/></svg><span><b>Claude Code</b><i>The real terminal program, Sonnet by default.</i></span></button>' +
      '<button class="card" data-pick="opencode"><span style="flex:none;margin-top:2px;display:flex">' + OC_ICON + '</span><span><b>OpenCode</b><i>The OpenCode terminal program, Sonnet by default.</i></span></button>' +
      '<button class="card" data-pick="pi"><span style="flex:none;margin-top:2px;display:flex">' + PI_ICON + '</span><span><b>Pi</b><i>The Pi terminal program. Drawn here as an illustration.</i></span></button>' +
      '<button class="card" disabled aria-disabled="true"><span class="badge pi">…</span><span><b>Codex</b><i>Coming soon.</i></span></button>' +
      '</div></div></div>';
  }

  function terminalFrom(claude, name, icon, noteText, bodyHtml) {
    var el = claude.cloneNode(false);
    el.innerHTML = claude.firstElementChild.outerHTML;
    var head = el.firstElementChild;
    head.querySelectorAll('span')[0].textContent = name;
    var svg = head.querySelector('svg'); if (svg) svg.outerHTML = icon;
    var change = head.querySelector('button'); if (change) { change.disabled = false; change.addEventListener('click', function () { show('picker'); }); }
    var note = doc.createElement('div'); note.className = 'demo-note'; note.textContent = noteText;
    el.appendChild(note);
    var b = doc.createElement('div'); b.className = 'demo-oc'; b.innerHTML = bodyHtml; el.appendChild(b);
    return el;
  }

  function setupAssistant() {
    inner = doc.querySelector('#chat .relative.h-full'); if (!inner) return false;
    var claude = inner.firstElementChild;
    var tag = claude.querySelector('.text-green-400'); if (tag) { tag.textContent = '○ shown only'; tag.className = 'text-xs text-gray-500'; }
    var change = claude.querySelector('button'); if (change) { change.disabled = false; change.addEventListener('click', function () { show('picker'); }); }
    var helper = claude.querySelector('textarea'); if (helper) { helper.disabled = true; helper.setAttribute('aria-label', 'Terminal input (disabled in the demo)'); }
    var note = doc.createElement('div'); note.className = 'demo-note'; note.textContent = NOTE;
    claude.insertBefore(note, claude.children[1]);
    var chat = doc.createElement('div'); chat.style.height = '100%'; chat.innerHTML = chatHtml;
    var picker = doc.createElement('div'); picker.style.height = '100%'; picker.innerHTML = pickerHtml();
    [].forEach.call(picker.querySelectorAll('[data-pick]'), function (b) { b.addEventListener('click', function () { show(b.dataset.pick); }); });
    // OpenCode and Pi have no capture of their own: they are built from the same terminal header the app uses, with text of ours
    var oc = terminalFrom(claude, 'OpenCode', OC_ICON, NOTE, '<div><b>OpenCode</b></div><div style="color:#9ca3af">~/interviews/fibonacci</div><div class="bx">Ask anything… "Fix a bug in fibonacci.js"</div>');
    var pi = terminalFrom(claude, 'Pi', PI_ICON, 'Illustration: Pi is drawn from the terminal style of the app, not captured from the program. ' + NOTE, '<div><b>π Pi</b></div><div style="color:#9ca3af">~/interviews/fibonacci</div><div class="bx">Type a message…</div>');
    views = { 'claude-code': claude, chat: chat, opencode: oc, pi: pi, picker: picker };
    return true;
  }

  function show(mode) {
    if (!views[mode]) return;
    var cur = inner.firstElementChild;
    if (cur !== views[mode]) inner.replaceChild(views[mode], cur);
    current = mode;
    buttons.forEach(function (b) { var on = b.dataset.mode === mode; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  }

  /* ---------------- start ---------------- */
  var api = {
    frame: frame,
    show: show,
    mode: function () { return current; },
    target: function (name) { return doc && doc.getElementById(name); },
    expandAll: function () {},
    /**
     * Whether a real click on `name` (a button of the scene) would reach it: the iframe takes pointer events, the point at the centre of the
     * button, moved and scaled to the page the way a mouse sees it, is over the iframe, and the scene puts that button under it.
     */
    canClick: function (selector, label) {
      if (!doc) return { ok: false, why: 'the scene is not loaded' };
      var btn = [].slice.call(doc.querySelectorAll(selector)).filter(function (b) { return label.test(b.textContent.trim()); })[0];
      if (!btn) return { ok: false, why: 'no such button' };
      var fr = frame.getBoundingClientRect(), r = btn.getBoundingClientRect(), s = fr.width / 1440;
      var x = fr.left + (r.left + r.width / 2) * s, y = fr.top + (r.top + r.height / 2) * s;
      var pe = getComputedStyle(frame).pointerEvents;
      var top = document.elementFromPoint(x, y);
      var inner = top === frame ? doc.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
      var hit = inner && inner.closest && inner.closest('button');
      return { ok: pe !== 'none' && top === frame && hit === btn, pointerEvents: pe, onTop: top && (top.tagName + (top.id ? '#' + top.id : '')), x: Math.round(x), y: Math.round(y), scale: s };
    },
    state: function () { return { open: open.slice(), active: active }; }
  };
  window.DemoApp = api;

  function ready() {
    doc = frame.contentDocument; win = frame.contentWindow;
    if (!doc || !doc.getElementById('chat') || !win.FIB) return;
    var st = doc.createElement('style'); st.textContent = CSS; doc.head.appendChild(st);
    text = { 'fibonacci.js': (FILES['fibonacci.js'] || {}).text || win.FIB.before };
    ['AGENTS.md', 'CLAUDE.md', 'description.md'].forEach(function (n) { text[n] = (FILES[n] || {}).text || ''; });
    // the file tree: every file opens in a tab, and renaming and creating are not part of the demo
    [].forEach.call(doc.querySelectorAll('#files li'), function (li) {
      var b = li.querySelector('button'), n = b && b.querySelector('span') && b.querySelector('span').textContent.trim();
      if (!n || ORDER.indexOf(n) < 0) return;
      treeButtons[n] = b; b.removeAttribute('title'); b.title = LOCKED[n] ? 'Read-only (challenge instructions)' : 'Open ' + n;
      b.addEventListener('click', function () { openFile(n); });
      [].slice.call(li.querySelectorAll('button')).slice(1).forEach(function (x) { x.style.display = 'none'; });
    });
    var firstTab = doc.querySelector('#editor [role=tab]');
    lockSvg = firstTab && firstTab.querySelector('svg') ? firstTab.querySelector('svg').outerHTML : '';
    tabsEl = firstTab.parentNode;
    var viewer = doc.querySelector('#editor .relative.flex-1.min-h-0'); viewer.innerHTML = '<div id="demo-viewer" style="height:100%"></div>';
    tabsEl.addEventListener('click', function (e) {
      var tab = e.target.closest('[role=tab]'); if (!tab) return;
      var n = tab.dataset.file;
      if (e.target.closest('button')) closeFile(n); else openFile(n);
    });
    tabsEl.addEventListener('keydown', function (e) { var tab = e.target.closest('[role=tab]'); if (tab && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openFile(tab.dataset.file); } });
    drawTabs(); drawBody();
    // Run, in the editor and in the terminal bar, runs what the editor holds now. The scene's own handler is the landing page's script.
    doc.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button');
      if (!b || !/^Run/.test(b.textContent.trim())) return;
      e.preventDefault(); e.stopImmediatePropagation(); run();
    }, true);
    [].forEach.call(doc.querySelectorAll('#terminal button'), function (b) {
      if (b.title === 'Clear terminal') b.addEventListener('click', function () { runId++; project(); });
    });
    // the bar and buttons of the assistant's change belong to the landing script, not to this page
    [].forEach.call(doc.querySelectorAll('button'), function (b) { if (/^(Keep all|Undo all)/.test(b.textContent.trim())) { var bar = b.parentNode; if (bar && bar.parentNode) bar.style.display = 'none'; } });
    wirePanels();
    if (!setupAssistant()) return;
    setupStarter();
    project();
    show('claude-code');
    document.documentElement.dataset.ready = '1';
    if (window.DemoTour) window.DemoTour.maybeStart();
  }
  buttons.forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.mode); }); });
  if (frame.contentDocument && frame.contentDocument.readyState === 'complete' && frame.contentDocument.getElementById('chat')) ready();
  else frame.addEventListener('load', ready);
})();
