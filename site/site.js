(function () {
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var frames = [].slice.call(document.querySelectorAll('.screen iframe'));
  var tabs = [].slice.call(document.querySelectorAll('.tab'));
  var steps = [].slice.call(document.querySelectorAll('.step'));
  var beats = [].slice.call(document.querySelectorAll('.beat'));
  var screenEl = document.getElementById('screen');
  var urlEl = document.getElementById('url'), noteEl = document.getElementById('note');
  var countEl = document.getElementById('count'), prev = document.getElementById('prev'), next = document.getElementById('next');
  if (!screenEl) return;
  var by = {}; frames.forEach(function (f) { by[f.dataset.scene] = f; });

  function fit() { var s = screenEl.clientWidth / 1440; frames.forEach(function (f) { f.style.transform = 'scale(' + s + ')'; }); }
  fit(); addEventListener('resize', fit);

  // What each of the six steps shows. The scenes are the real screens of the app; `fib` is the one that runs.
  var plan = [
    { scene: 'welcome', note: 'replica' },
    { scene: 'fib', note: 'scripted answer', ask: true },
    { scene: 'fib', note: 'runs for real', run: true, live: true },
    { scene: 'picker', note: 'replica' },
    { scene: 'view', note: 'replica', reveal: false },
    { scene: 'view', note: 'replica', reveal: true }
  ];
  var cur = -1, timers = [];
  function call(f, fn, arg) { try { f.contentWindow[fn](arg); } catch (e) { /* the scene is still loading */ } }
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

  function go(i, fromUser) {
    i = Math.max(0, Math.min(plan.length - 1, i));
    if (i === cur) return;
    var wasFib = cur === 1 || cur === 2;
    cur = i; timers.forEach(clearTimeout); timers = [];
    var p = plan[i];
    frames.forEach(function (f) { f.classList.toggle('on', f === by[p.scene]); f.classList.toggle('live', f === by[p.scene] && !!p.live); });
    urlEl.textContent = by[p.scene].dataset.url; noteEl.textContent = p.note;
    steps.forEach(function (s, k) { s.classList.toggle('on', k === i); });
    tabs.forEach(function (t, k) { t.classList.toggle('on', k === i); t.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
    countEl.textContent = (i + 1) + ' / ' + plan.length;
    prev.disabled = i === 0; next.disabled = i === plan.length - 1;

    if (p.scene === 'fib') {
      var f = by.fib;
      if (p.ask) {   // start from the empty function, then the assistant answers
        call(f, 'fibReset');
        if (reduce) { call(f, 'fibSkipAsk'); } else later(function () { call(f, 'fibAsk'); }, 700);
      }
      if (p.run) {   // the answer is already in the editor, then the code runs
        call(f, 'fibShowAnswer');
        if (!reduce) later(function () { call(f, 'fibRun'); }, 1100); else call(f, 'fibRun');
      }
    }
    if (p.scene === 'view') { call(by.view, 'reveal', false); if (p.reveal) { if (reduce) call(by.view, 'reveal', true); else later(function () { call(by.view, 'reveal', true); }, 900); } }
  }

  // Clicking a tab or an arrow goes to that step, and the page scrolls to where the step belongs
  function scrollToStep(i) {
    var b = beats[i]; if (!b) return;
    var y = b.getBoundingClientRect().top + scrollY + b.offsetHeight / 2 - innerHeight / 2;
    scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
  }
  function choose(i) { go(i, true); scrollToStep(Math.max(0, Math.min(plan.length - 1, i))); }
  tabs.forEach(function (t, k) { t.addEventListener('click', function () { choose(k); }); });
  prev.addEventListener('click', function () { choose(cur - 1); });
  next.addEventListener('click', function () { choose(cur + 1); });
  document.addEventListener('keydown', function (e) {
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    var r = document.getElementById('how').getBoundingClientRect();
    if (r.top > innerHeight * .6 || r.bottom < innerHeight * .4) return;   // only while the stage is on screen
    if (e.key === 'ArrowRight') { e.preventDefault(); choose(cur + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); choose(cur - 1); }
  });

  // Scrolling changes the step too
  var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) go(+e.target.dataset.i); }); }, { rootMargin: '-45% 0px -45% 0px' });
  beats.forEach(function (b) { io.observe(b); });
  go(0);

  // The three parts of the logo: the block stays pinned and the scroll drives it. The text fades, then the console, the interviewer
  // and the candidate each travel to the place they have in the logo, one after the other, and go back when you scroll up.
  var section = document.getElementById('parts'), trio = document.getElementById('trio');
  if (section && trio && !reduce && matchMedia('(min-width: 901px)').matches) {
    var parts = [].slice.call(trio.querySelectorAll('.part')), slot = trio.querySelector('.slot');
    var aim = [];                      // how far each part has to go: dx, dy and the scale
    var ease = function (t) { return t * t * (3 - 2 * t); };
    var seg = function (p, a, b) { return Math.max(0, Math.min(1, (p - a) / (b - a))); };
    var measure = function () {
      parts.forEach(function (el) { el.querySelector('svg').style.transform = ''; });
      var t = slot.getBoundingClientRect();
      aim = parts.map(function (el) {
        var r = el.querySelector('svg').getBoundingClientRect();
        return { dx: (t.left + t.width / 2) - (r.left + r.width / 2), dy: (t.top + t.height / 2) - (r.top + r.height / 2), s: t.width / r.width };
      });
      draw();
    };
    var draw = function () {
      var r = section.getBoundingClientRect(), room = r.height - innerHeight;
      var p = room > 0 ? Math.max(0, Math.min(1, -r.top / room)) : 0;
      var fade = 1 - ease(seg(p, 0.03, 0.18));
      var order = [0, 1, 2];           // the assistant, then the interviewer, then the candidate
      parts.forEach(function (el, k) {
        var at = 0.22 + order[k] * 0.2, n = ease(seg(p, at, at + 0.17)), a = aim[k];
        el.querySelector('.txt').style.opacity = fade;
        if (a) el.querySelector('svg').style.transform = 'translate(' + (a.dx * n) + 'px,' + (a.dy * n) + 'px) scale(' + (1 + (a.s - 1) * n) + ')';
      });
      var lede = section.querySelector('.lede'); if (lede) lede.style.opacity = 1 - 0.65 * ease(seg(p, 0.03, 0.18));
    };
    var ticking = false;
    addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(function () { ticking = false; draw(); }); } }, { passive: true });
    addEventListener('resize', measure);
    measure();
  }

  // Stars, from the public GitHub API with no sign in. The number stays hidden when the API cannot be reached.
  var cnts = [].slice.call(document.querySelectorAll('.cnt'));
  function show(n) { var t = n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n); cnts.forEach(function (c) { c.textContent = t; c.style.display = ''; }); }
  var KEY = 'trio_stars', cached = null;
  try { cached = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { /* private window */ }
  if (cached && Date.now() - cached.at < 36e5) show(cached.n);
  else fetch('https://api.github.com/repos/guicheffer/trio-interview').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (!d || typeof d.stargazers_count !== 'number') return;
    try { sessionStorage.setItem(KEY, JSON.stringify({ n: d.stargazers_count, at: Date.now() })); } catch (e) { /* private window */ }
    show(d.stargazers_count);
  }).catch(function () { /* offline: no number */ });
})();
