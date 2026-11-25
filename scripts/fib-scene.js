// The behaviour of the fibonacci scene. Everything it draws is the markup the app made (see scripts/build-landing.py).
// What is real: the code in the editor runs in a Worker when Run is pressed, and the terminal prints what it logs.
// What is a script: the request to the assistant and its answer, copied from a session on the real tool.
// The change the assistant makes is drawn the way the app draws an AI change (app/components/AiChangesBar.tsx): added lines
// in green, the removed lines in red in a zone above them, Keep and Undo on the change, and a bar with Keep all and Undo all.
// The line diff is the one of shared/line-diff.ts, so the editor shows the same hunks as the app would.
(function () {
  var S = window.Scene, F = window.FIB;
  var REQUEST = 'Implement fibonacci(n) in fibonacci.js so it returns the first n Fibonacci numbers and rejects invalid input. Keep it short. Then run the file.';
  var LINE = 21;

  var linesEl = S.q('.view-lines'), gutterEl = S.q('.margin-view-overlays');
  var zonesEl = S.q('.view-zones');
  var guard = S.q('.overflow-guard');
  var panes = S.qa('.xterm-rows');          // 0 = project terminal, 1 = the assistant
  var projectRows = panes[0], claudeRows = panes[1];
  var runButtons = S.qa('button').filter(function (b) { return /^Run/.test(b.textContent.trim()); });

  function esc(t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function setPane(el, rows) { el.innerHTML = rows.map(function (r) { return '<div style="width: ' + (el === projectRows ? 726 : 413) + 'px; height: 16px; line-height: 16px; overflow: hidden;">' + r + '</div>'; }).join(''); }

  // ---- the line diff (the same operations as shared/line-diff.ts) ----
  function operations(a, b) {
    var n = a.length, m = b.length, w = m + 1, t = new Uint16Array((n + 1) * w), i, j;
    for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--) t[i * w + j] = a[i] === b[j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
    var ops = []; i = 0; j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { ops.push({ k: 'same', bi: i, ai: j }); i++; j++; }
      else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) ops.push({ k: 'del', bi: i++ });
      else ops.push({ k: 'add', ai: j++ });
    }
    while (i < n) ops.push({ k: 'del', bi: i++ });
    while (j < m) ops.push({ k: 'add', ai: j++ });
    return ops;
  }
  var BEFORE = F.before.split('\n'), AFTER = F.after.split('\n');
  var ops = operations(BEFORE, AFTER);
  // hunks: runs of changed operations; each knows its added operations in order
  var hunks = [], cur = null, totalAdded = 0, totalRemoved = 0;
  ops.forEach(function (o) {
    if (o.k === 'same') { cur = null; return; }
    if (!cur) { cur = { ops: [], state: 'ai' }; hunks.push(cur); }
    cur.ops.push(o); o.h = cur;
    if (o.k === 'add') { o.n = totalAdded++; } else totalRemoved++;
  });

  // the markup of each line, as the app drew it
  function lineHtml(markup) {
    var box = document.createElement('div'); box.innerHTML = markup;
    return [].slice.call(box.children).map(function (el) { return el.innerHTML; });
  }
  var HTML = { Before: lineHtml(F.linesBefore), After: lineHtml(F.linesAfter) };

  // ---- the editor ----
  var added = 0, bar = null;   // `added`: how many of the assistant's lines have been typed so far
  function row(top, inner, extra) { return '<div style="top:' + top + 'px;height:' + LINE + 'px;line-height:' + LINE + 'px;' + (extra || '') + '" class="view-line">' + inner + '</div>'; }
  function gutterRow(top, n, extra) { return '<div style="top:' + top + 'px;height:' + LINE + 'px;line-height:' + LINE + 'px;' + (extra || '') + '"><div class="line-numbers" style="left:0px;width:42px;">' + n + '</div></div>'; }
  function btnHtml(label, act, primary) {
    return '<button type="button" data-act="' + act + '" style="margin-left:6px;padding:0 8px;border-radius:4px;font:600 11px system-ui;cursor:pointer;border:1px solid ' + (primary ? '#16a34a' : '#9ca3af') + ';background:' + (primary ? '#16a34a' : 'transparent') + ';color:' + (primary ? '#fff' : 'inherit') + '">' + label + '</button>';
  }

  // Draws the file with the changes in the state they are in (`added` lines typed, each hunk waiting, kept or undone)
  function drawDiff() {
    var lines = '', gutter = '', zones = '', y = 0, num = 0;
    var started = {};
    ops.forEach(function (o) {
      if (o.k === 'add' && o.n < added) started[hunks.indexOf(o.h)] = true;
    });
    var zoneDone = {};
    ops.forEach(function (o) {
      var hi = o.h ? hunks.indexOf(o.h) : -1;
      if (o.k === 'same') { num++; lines += row(y, HTML.After[o.ai]); gutter += gutterRow(y, num); y += LINE; return; }
      var live = started[hi] && o.h.state === 'ai';
      if (live && !zoneDone[hi]) {   // the zone above the change: what was removed, and Keep or Undo
        zoneDone[hi] = true;
        var rem = o.h.ops.filter(function (x) { return x.k === 'del'; });
        var h = LINE * (1 + rem.length);
        zones += '<div data-hunk="' + hi + '" style="position:absolute;left:0;width:100%;top:' + y + 'px;height:' + h + 'px;z-index:5;pointer-events:auto;font-family:Menlo,Monaco,monospace;font-size:12px">' +
          '<div style="height:' + LINE + 'px;display:flex;align-items:center;justify-content:flex-end;padding-right:24px;color:#a16207;background:rgba(245,158,11,0.12);font:600 11px system-ui"><span>AI change</span>' + btnHtml('Keep', 'keep:' + hi, true) + btnHtml('Undo', 'undo:' + hi) + '</div>' +
          rem.map(function (x) { return '<div style="height:' + LINE + 'px;line-height:' + LINE + 'px;white-space:pre;overflow:hidden;padding-left:64px;background:rgba(239,68,68,0.16);color:#f87171">- ' + esc(BEFORE[x.bi]) + '</div>'; }).join('') + '</div>';
        y += h;
      }
      if (o.k === 'del') {
        // a removed line sits in the zone while the change waits for a choice, and is gone once kept
        if (o.h.state === 'kept' || live) return;
        num++; lines += row(y, HTML.Before[o.bi]); gutter += gutterRow(y, num); y += LINE; return;
      }
      // an added line
      if (o.h.state === 'undone') return;
      if (o.n >= added && o.h.state === 'ai') return;   // not typed yet
      num++;
      var mark = o.h.state === 'ai';
      lines += row(y, HTML.After[o.ai], mark ? 'background:rgba(34,197,94,0.16);' : '');
      gutter += gutterRow(y, num, mark ? 'border-left:3px solid #22c55e;box-sizing:border-box;' : '');
      y += LINE;
    });
    linesEl.innerHTML = lines; gutterEl.innerHTML = gutter; zonesEl.innerHTML = zones;
    zonesEl.style.width = linesEl.style.width || '599px';   // the zone layer has no width of its own
    linesEl.style.height = gutterEl.style.height = y + 'px';
    var waiting = hunks.some(function (hh) { return hh.state === 'ai' && ops.some(function (o) { return o.h === hh && o.k === 'add' && o.n < added; }); });
    drawBar(waiting && added >= totalAdded);
  }
  function drawBar(on) {
    if (!bar) {
      bar = document.createElement('div');
      bar.style.cssText = 'position:absolute;bottom:12px;right:16px;z-index:20;display:none;align-items:center;gap:8px;border:1px solid #b45309;background:#451a03;color:#fef3c7;border-radius:8px;padding:6px 12px;font:12px system-ui;box-shadow:0 4px 14px rgba(0,0,0,.35)';
      guard.appendChild(bar);
    }
    bar.innerHTML = '<b>AI changed this file</b><span style="font-family:monospace;color:#86efac">+' + totalAdded + '</span><span style="font-family:monospace;color:#fca5a5">-' + totalRemoved + '</span>' + btnHtml('Keep all', 'keepall', true) + btnHtml('Undo all', 'undoall');
    bar.style.display = on ? 'flex' : 'none';
  }
  // the editor takes the mouse on press in the app, so these buttons stop the events the same way
  guard.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button[data-act]'); if (!b) return;
    var a = b.getAttribute('data-act').split(':'), set = function (s, only) { hunks.forEach(function (h, i) { if (only === undefined || only === i) h.state = s; }); };
    if (a[0] === 'keepall') set('kept'); else if (a[0] === 'undoall') set('undone');
    else if (a[0] === 'keep') set('kept', +a[1]); else if (a[0] === 'undo') set('undone', +a[1]);
    drawDiff();
  });

  function setCode(which) {   // the plain file, no marks
    hunks.forEach(function (h) { h.state = which === 'After' ? 'kept' : 'undone'; });
    added = which === 'After' ? totalAdded : 0;
    drawDiff();
  }
  function startChange() { hunks.forEach(function (h) { h.state = 'ai'; }); added = 0; drawDiff(); }
  // the text the editor holds right now, which is what Run runs
  function code() {
    var out = [];
    ops.forEach(function (o) {
      if (o.k === 'same') out.push(AFTER[o.ai]);
      else if (o.k === 'del') { if (o.h.state !== 'kept') out.push(BEFORE[o.bi]); }
      else if (o.h.state === 'kept' || (o.h.state === 'ai' && o.n < added)) out.push(AFTER[o.ai]);
    });
    return out.join('\n');
  }

  // ---- project terminal ----
  var HEAD = '<span class="xterm-fg-2">● maya / fibonacci</span>';
  var PROMPT = '<span class="xterm-fg-2">maya/fibonacci</span><span> $ </span>';
  function project(extra) { setPane(projectRows, [HEAD, '', PROMPT + (extra && extra.cmd ? '<span>' + esc(extra.cmd) + '</span>' : '<span> </span>')].concat((extra && extra.out || []).map(function (l) { return '<span>' + esc(l) + '</span>'; }))); }

  // ---- the code, run for real in a Worker ----
  var worker;
  function runCode(src0, done) {
    var lite = F.inspectLite;
    var src = 'self.window=self;' + lite + ';var out=[];var console={log:function(){out.push(inspectLite.line([].slice.call(arguments)))}};var module={exports:{}};' +
      'try{(function(){' + src0 + '\n})()}catch(e){out.push(e.name+": "+e.message)}postMessage(out)';
    try {
      if (worker) worker.terminate();
      var blob = new Blob([src], { type: 'text/javascript' });
      var w = worker = new Worker(URL.createObjectURL(blob));
      var timer = setTimeout(function () { w.terminate(); done(['(stopped: it ran for too long)']); }, 3000);
      w.onmessage = function (e) { clearTimeout(timer); w.terminate(); done(e.data); };
      w.onerror = function () { clearTimeout(timer); done(['(the browser could not run it here)']); };
    } catch (e) { done(['(the browser could not run it here)']); }
  }
  function printOut(lines) { return [].concat.apply([], lines.map(function (l) { return l.split('\n'); })); }

  // ---- the assistant terminal ----
  var BEFORE_ROWS = F.claudeBefore, AFTER_ROWS = F.claudeAfter;
  var FOOT = [39, 40, 41, 42];
  function claude(n) { setPane(claudeRows, n === 'after' ? AFTER_ROWS : BEFORE_ROWS); }
  function wrap(text, width) {
    var out = [], line = '';
    text.split(' ').forEach(function (w) { if ((line + ' ' + w).trim().length > width) { out.push(line); line = w; } else line = (line + ' ' + w).trim(); });
    if (line) out.push(line); return out;
  }
  function requestRows(text) {   // the request as Claude Code prints it once sent
    return wrap(text, 52).map(function (l, i) { return '<span style="background-color:#373737">' + (i ? '  ' : '❯ ') + esc(l) + '</span>'; });
  }
  function typing(text, cb) {
    var i = 0, base = BEFORE_ROWS.slice(), idx = 40;
    (function tick() {
      var rows = base.slice();
      rows[idx] = '<span>❯ ' + esc(text.slice(0, i)) + '</span><span class="xterm-bg-257 xterm-fg-257"> </span>';
      setPane(claudeRows, rows);
      if (i < text.length) { i += 2; later(tick, 16); } else later(cb, 450);
    })();
  }
  // the answer comes in a row at a time, as Claude Code prints it; the editor follows while the diff rows arrive
  function answer(done) {
    var head = BEFORE_ROWS.slice(0, 4).concat([''], requestRows(REQUEST), ['']);
    var foot = FOOT.map(function (k) { return BEFORE_ROWS[k]; });
    foot[1] = '<span>❯&nbsp;</span><span class="xterm-bg-257 xterm-fg-257"> </span>';
    var compose = function (mid) { var rows = mid.slice(); while (rows.length < 39) rows.push(''); return rows.concat(foot); };
    setPane(claudeRows, compose(head.concat(['<span style="color:#999999;">✻ Working…</span>'])));
    later(function () {
      startChange();
      var k = 0, DIFF_FIRST = 3, DIFF_LAST = 16;
      (function step() {
        k++;
        setPane(claudeRows, compose(AFTER_ROWS.slice(0, k)));
        if (k > DIFF_FIRST) { added = Math.min(totalAdded, Math.round((k - DIFF_FIRST) * totalAdded / (DIFF_LAST - DIFF_FIRST))); drawDiff(); }
        if (k < 38) later(step, k < 20 ? 95 : 70); else { added = totalAdded; drawDiff(); claude('after'); if (done) done(); }
      })();
    }, 900);
  }

  var timers = [];
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function clear() { timers.forEach(clearTimeout); timers = []; if (worker) { worker.terminate(); worker = null; } }

  // ---- what shows that the code ran ----
  var css = document.createElement('style');
  css.textContent = '@keyframes ranflash{0%{box-shadow:inset 0 0 0 3px #00C068,inset 0 0 40px rgba(0,192,104,.35)}100%{box-shadow:inset 0 0 0 3px rgba(0,192,104,0),inset 0 0 40px rgba(0,192,104,0)}}' +
    '@keyframes ranbadge{0%{opacity:0;transform:translateY(6px)}12%,80%{opacity:1;transform:none}100%{opacity:0}}' +
    '.ran-flash{animation:ranflash 1.2s ease-out}.ran-badge{position:fixed;z-index:60;pointer-events:none;background:#00C068;color:#04230f;font:700 12px system-ui;padding:4px 10px;border-radius:999px;animation:ranbadge 2.4s ease both}' +
    '@media (prefers-reduced-motion: reduce){.ran-flash{animation:none;box-shadow:inset 0 0 0 3px #00C068}.ran-badge{animation:none}}';
  document.head.appendChild(css);
  var termBox = projectRows.closest('.xterm-scrollable-element') || projectRows.parentNode;
  function celebrate() {
    termBox.classList.remove('ran-flash'); void termBox.offsetWidth; termBox.classList.add('ran-flash');
    var old = document.querySelector('.ran-badge'); if (old) old.remove();
    var r = termBox.getBoundingClientRect(), b = document.createElement('div');
    b.className = 'ran-badge'; b.textContent = '✓ ran'; b.style.left = (r.right - 70) + 'px'; b.style.top = (r.top + 6) + 'px';
    document.body.appendChild(b); setTimeout(function () { b.remove(); }, 2500);
  }
  function tell(state, n) { try { parent.postMessage({ trio: 'fib', state: state, n: n }, '*'); } catch (e) { /* not in a page */ } }

  function markRun(on) { runButtons.forEach(function (b) { b.style.outline = on ? '2px solid #5850F8' : ''; b.style.outlineOffset = on ? '2px' : ''; }); }

  window.fibReset = function () { clear(); setCode('Before'); claude('before'); project(); markRun(false); tell('idle', 0); };

  window.fibAsk = function (cb) { clear(); setCode('Before'); typing(REQUEST, function () { answer(cb); }); };

  var runs = 0;
  // Run starts from the top every time: the terminal is cleared, the command is typed, then the output comes
  window.fibRun = function (cb) {
    clear(); markRun(true); var n = ++runs; tell('running', n);
    project();
    later(function () { project({ cmd: 'node fibonacci.js' }); }, 220);
    later(function () {
      runCode(code(), function (out) {
        markRun(false);
        project({ cmd: 'node fibonacci.js', out: printOut(out) });
        celebrate(); tell('done', n);
        if (cb) cb(out);
      });
    }, 700);
  };

  // the answer already in place, for the step that is about the Run button
  window.fibShowAnswer = function () { clear(); setCode('After'); claude('after'); project(); markRun(false); tell('idle', 0); };
  // no typing for people who asked the page not to animate: the change stays marked until it is kept
  window.fibSkipAsk = function () { clear(); startChange(); added = totalAdded; drawDiff(); claude('after'); project(); };

  // pressing Run in the scene does the same, whatever the code in the editor is right now
  runButtons.forEach(function (b) { b.addEventListener('click', function (e) { e.preventDefault(); window.fibRun(); }); });

  window.fibReset();
})();
