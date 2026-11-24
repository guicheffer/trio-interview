// The behaviour of the fibonacci scene. Everything it draws is the markup the app made (see scripts/build-landing.py).
// What is real: the code in the editor runs in a Worker when Run is pressed, and the terminal prints what it logs.
// What is a script: the request to the assistant and its answer, copied from a session on the real tool.
(function () {
  var S = window.Scene, F = window.FIB;
  var REQUEST = 'Implement fibonacci(n) in fibonacci.js so it returns the first n Fibonacci numbers and rejects invalid input. Keep it short. Then run the file.';

  var linesEl = S.q('.view-lines'), gutterEl = S.q('.margin-view-overlays');
  var panes = S.qa('.xterm-rows');          // 0 = project terminal, 1 = the assistant
  var projectRows = panes[0], claudeRows = panes[1];
  var runButtons = S.qa('button').filter(function (b) { return /^Run/.test(b.textContent.trim()); });
  var tabDot = S.q('[role=tab][aria-selected=true] span');

  function setCode(which) {
    linesEl.innerHTML = F['lines' + which];
    gutterEl.innerHTML = F['gutter' + which];
    var h = (which === 'After' ? F.after : F.before).split('\n').length * 21;
    linesEl.style.height = h + 'px';
    gutterEl.style.height = h + 'px';
  }
  function setPane(el, rows) { el.innerHTML = rows.map(function (r) { return '<div style="width: ' + (el === projectRows ? 726 : 413) + 'px; height: 16px; line-height: 16px; overflow: hidden;">' + r + '</div>'; }).join(''); }
  function esc(t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  // ---- project terminal ----
  var HEAD = '<span class="xterm-fg-2">● maya / fibonacci</span>';
  var PROMPT = '<span class="xterm-fg-2">maya/fibonacci</span><span> $ </span>';
  function project(extra) { setPane(projectRows, [HEAD, '', PROMPT + (extra && extra.cmd ? '<span>' + esc(extra.cmd) + '</span>' : '<span> </span>')].concat((extra && extra.out || []).map(function (l) { return '<span>' + esc(l) + '</span>'; }))); }

  // ---- the code, run for real in a Worker ----
  var worker, lastOut = [];
  function runCode(code, done) {
    var lite = F.inspectLite;
    var src = 'self.window=self;' + lite + ';var out=[];var console={log:function(){out.push(inspectLite.line([].slice.call(arguments)))}};var module={exports:{}};' +
      'try{(function(){' + code + '\n})()}catch(e){out.push(e.name+": "+e.message)}postMessage(out)';
    try {
      var blob = new Blob([src], { type: 'text/javascript' });
      worker = new Worker(URL.createObjectURL(blob));
      var timer = setTimeout(function () { worker.terminate(); done(['(stopped: it ran for too long)']); }, 3000);
      worker.onmessage = function (e) { clearTimeout(timer); worker.terminate(); done(e.data); };
      worker.onerror = function () { clearTimeout(timer); done(['(the browser could not run it here)']); };
    } catch (e) { done(['(the browser could not run it here)']); }
  }
  function printOut(lines) { return [].concat.apply([], lines.map(function (l) { return l.split('\n'); })); }

  // ---- the assistant terminal ----
  function claude(n) { setPane(claudeRows, n === 'after' ? F.claudeAfter : F.claudeBefore); }
  function typing(text, cb) {
    var i = 0, base = F.claudeBefore.slice();
    // the prompt row of the assistant is the line that starts with the heavy right angle; the request is typed after it
    var idx = base.length - 1;
    for (var k = base.length - 1; k >= 0; k--) if (/❯/.test(base[k].replace(/<[^>]+>/g, ''))) { idx = k; break; }
    (function tick() {
      var rows = base.slice();
      rows[idx] = '<span>❯ ' + esc(text.slice(0, i)) + '</span>';
      setPane(claudeRows, rows);
      if (i++ < text.length) setTimeout(tick, 16); else setTimeout(cb, 500);
    })();
  }

  var timers = [];
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function clear() { timers.forEach(clearTimeout); timers = []; }

  window.fibReset = function () { clear(); setCode('Before'); claude('before'); project(); markRun(false); };
  function markRun(on) { runButtons.forEach(function (b) { b.style.outline = on ? '2px solid #5850F8' : ''; b.style.outlineOffset = on ? '2px' : ''; }); }

  window.fibAsk = function (cb) {
    clear(); typing(REQUEST, function () {
      claude('after');
      later(function () { setCode('After'); if (cb) cb(); }, 700);
    });
  };

  window.fibRun = function (cb) {
    markRun(true);
    project({ cmd: 'node fibonacci.js' });
    later(function () {
      runCode(F.after, function (out) {
        markRun(false);
        project({ cmd: 'node fibonacci.js', out: printOut(out) });
        if (cb) cb(out);
      });
    }, 500);
  };

  // pressing Run in the scene does the same, whatever the code in the editor is right now
  runButtons.forEach(function (b) { b.addEventListener('click', function (e) { e.preventDefault(); window.fibRun(); }); });

  window.fibReset();
})();
