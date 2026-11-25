// The guided tour of the demo: a mandatory walk through the main areas, with a spotlight like the one of the first visit in the app.
// Everything outside the highlighted area is blurred and dimmed by four strips around it (so it works wherever backdrop-filter does,
// with no clip-path or mask), the page behind is made inert, and there is no way out until the last step.
// The workspace is inside an iframe, so a rectangle read from it is moved and scaled to the page (rectIn).
(function (root) {
  'use strict';
  var KEY = 'trio_demo_tour_done';

  /** Where a rectangle of the scene (drawn 1440 wide, then scaled to fit) lands on the page */
  function rectIn(frameRect, elRect, designWidth) {
    var s = frameRect.width / designWidth;
    return { left: frameRect.left + elRect.left * s, top: frameRect.top + elRect.top * s, width: elRect.width * s, height: elRect.height * s };
  }

  /** The first of the sides of `r` where a card of w x h fits inside the window, or null */
  function placeCard(r, w, h, vw, vh, gap) {
    var tries = [
      { left: r.left + r.width + gap, top: r.top },
      { left: r.left - gap - w, top: r.top },
      { left: r.left, top: r.top + r.height + gap },
      { left: r.left, top: r.top - gap - h }
    ];
    for (var i = 0; i < tries.length; i++) {
      var t = tries[i], x = Math.min(Math.max(t.left, 12), vw - w - 12), y = Math.min(Math.max(t.top, 12), vh - h - 12);
      var overlaps = x < r.left + r.width && x + w > r.left && y < r.top + r.height && y + h > r.top;
      if (!overlaps && t.left >= 0 && t.top >= 0 && t.left + w <= vw && t.top + h <= vh) return { left: x, top: y };
    }
    return null;
  }

  var STEPS = [
    { target: 'files', title: 'Your files', text: 'The files of the exercise are on the left. Click one to open it. A lock means you can read it but not change it, like the brief in description.md.' },
    { target: 'editor', title: 'The editor', text: 'Open files become tabs in the middle. Click a tab to switch and the x to close it. You can type in fibonacci.js here, but nothing is saved.' },
    { target: 'terminal', title: 'The terminal and Run', text: 'Run starts the exercise. Here it runs fibonacci.js for real in your browser and prints what Node prints. Clear empties the terminal.' },
    { target: 'chat', title: 'The assistant', text: 'The assistant is on the right. In an interview you can ask it to explain code, find bugs and write changes. Here it is shown but not connected, so nobody can send it a message.', view: 'keep' },
    { target: 'chat', title: 'The picker', text: 'Change opens the picker, where a candidate chooses Chat, Claude Code, OpenCode or Pi. Codex is coming soon. The buttons above the workspace let you look at each one.', view: 'picker' }
  ];

  var el = null, step = 0, before = null, rafId = 0, onResize = null;
  var reduce = function () { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

  function seen() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function remember() { try { localStorage.setItem(KEY, '1'); } catch (e) { /* storage is blocked: the tour just shows again next time */ } }
  function forget() { try { localStorage.removeItem(KEY); } catch (e) { /* nothing to clear */ } }

  function parts() { return [].slice.call(document.querySelectorAll('.bar, .strip, .stage2, .foot')); }
  function strip(name) { return el.querySelector('.tour-' + name); }
  function px(n) { return Math.round(n) + 'px'; }

  /** The rectangle of the element of the step, on the page, or null while the scene is not there */
  function currentRect() {
    var app = root.DemoApp;
    var target = app && app.target(STEPS[step].target);
    if (!target) return null;
    var fr = app.frame.getBoundingClientRect();
    var r = rectIn(fr, target.getBoundingClientRect(), 1440);
    return r;
  }

  function layout() {
    if (!el) return;
    var r = currentRect(); if (!r) return;
    var pad = 6, vw = innerWidth, vh = innerHeight;
    var x = Math.max(0, r.left - pad), y = Math.max(0, r.top - pad), w = Math.min(vw, r.width + pad * 2), h = Math.min(vh, r.height + pad * 2);
    var set = function (n, l, t, ww, hh) { var s = strip(n).style; s.left = px(l); s.top = px(t); s.width = px(Math.max(0, ww)); s.height = px(Math.max(0, hh)); };
    set('top', 0, 0, vw, y);
    set('bottom', 0, y + h, vw, vh - y - h);
    set('left', 0, y, x, h);
    set('right', x + w, y, vw - x - w, h);
    set('ring', x, y, w, h);
    el.dataset.rect = [r.left, r.top, r.width, r.height].map(Math.round).join(',');
    var card = el.querySelector('.tour-card');
    if (vw <= 760) { card.style.left = ''; card.style.top = ''; card.classList.add('dock'); return; }
    card.classList.remove('dock');
    var cw = card.offsetWidth, ch = card.offsetHeight;
    var spot = placeCard({ left: x, top: y, width: w, height: h }, cw, ch, vw, vh, 14);
    // nowhere beside it: the corner of the window that is farthest from the highlight
    if (!spot) spot = { left: x + w / 2 > vw / 2 ? 24 : vw - cw - 24, top: vh - ch - 24 };
    card.style.left = px(spot.left); card.style.top = px(spot.top);
  }

  function show(n) {
    step = n;
    var s = STEPS[n], app = root.DemoApp;
    if (app) app.show(s.view === 'picker' ? 'picker' : before);
    el.querySelector('.tour-count').textContent = 'Step ' + (n + 1) + ' of ' + STEPS.length;
    el.querySelector('#tour-title').textContent = s.title;
    el.querySelector('.tour-text').textContent = s.text;
    var next = el.querySelector('.tour-next');
    next.textContent = n === STEPS.length - 1 ? 'Done' : 'Next';
    layout();
    // the scene may still be moving panels, so read the rectangle again on the next frames
    cancelAnimationFrame(rafId); rafId = requestAnimationFrame(function () { layout(); rafId = requestAnimationFrame(layout); });
    next.focus({ preventScroll: true });
  }

  function finish() {
    remember();
    el.hidden = true;
    parts().forEach(function (p) { p.removeAttribute('inert'); });
    removeEventListener('resize', onResize);
    if (root.DemoApp) root.DemoApp.show(before);
    var again = document.getElementById('tour-again'); if (again) again.focus({ preventScroll: true });
  }

  function start() {
    el = document.getElementById('tour');
    if (!el || !root.DemoApp) return;
    root.DemoApp.expandAll();
    before = root.DemoApp.mode();
    if (before === 'picker') before = 'claude-code';
    el.hidden = false;
    el.classList.toggle('still', reduce());
    parts().forEach(function (p) { p.setAttribute('inert', ''); });
    onResize = function () { layout(); };
    addEventListener('resize', onResize);
    show(0);
  }

  function wire() {
    var next = document.querySelector('#tour .tour-next');
    if (!next) return;
    next.addEventListener('click', function () { if (step < STEPS.length - 1) show(step + 1); else finish(); });
    // no way out before the last step: Escape does nothing
    document.addEventListener('keydown', function (e) {
      if (!el || el.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); return; }
      if (e.key === 'Tab') { e.preventDefault(); next.focus({ preventScroll: true }); }
    }, true);
    var again = document.getElementById('tour-again');
    if (again) again.addEventListener('click', function (e) { e.preventDefault(); forget(); if (el && !el.hidden) return; start(); });
  }

  var api = { rectIn: rectIn, placeCard: placeCard, STEPS: STEPS, KEY: KEY, start: start, maybeStart: function () { if (!seen()) start(); }, layout: layout };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else { root.DemoTour = api; if (typeof document !== 'undefined') wire(); }
})(typeof window !== 'undefined' ? window : {});
