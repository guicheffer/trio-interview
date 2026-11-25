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
    { scene: 'welcome', note: '' },
    { scene: 'fib', note: '', ask: true, live: true },
    { scene: 'fib', note: '', run: true, live: true },
    { scene: 'picker', note: '' },
    { scene: 'view', note: '', reveal: false },
    { scene: 'view', note: '', reveal: true }
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
      if (p.run) call(f, 'fibShowAnswer');   // the answer is already in the editor; the code runs when Run is pressed
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
  var runit = document.getElementById('runit');
  var ranmsg = document.getElementById('ranmsg');
  if (runit) runit.addEventListener('click', function () { call(by.fib, 'fibRun'); });
  // the scene says when the code starts and when it has run, so the button can show it worked and offer to run again
  addEventListener('message', function (e) {
    var d = e.data; if (!d || d.trio !== 'fib' || !runit) return;
    if (d.state === 'running') { runit.disabled = true; ranmsg.textContent = 'Running...'; ranmsg.classList.remove('ok'); }
    if (d.state === 'done') {
      runit.disabled = false; runit.textContent = 'Run again';
      ranmsg.textContent = d.n > 1 ? 'Ran again (' + d.n + ' times), see the terminal' : 'Ran, see the terminal'; ranmsg.classList.add('ok');
      ranmsg.classList.remove('pulse'); void ranmsg.offsetWidth; ranmsg.classList.add('pulse');
    }
    if (d.state === 'idle') { runit.disabled = false; runit.textContent = 'Run fibonacci.js'; ranmsg.textContent = ''; ranmsg.classList.remove('ok'); }
  });
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
      // parts are in the order of the markup: assistant, interviewer, candidate. They join as assistant, candidate, interviewer.
      var order = [0, 2, 1];
      parts.forEach(function (el, k) {
        var at = 0.08 + order[k] * 0.22, n = ease(seg(p, at, at + 0.2)), a = aim[k];
        // the interviewer is the middle piece, already close to its place, so it only settles
        el.querySelector('.txt').style.opacity = k === 1 ? 1 : 1 - ease(seg(p, at + 0.12, at + 0.2));
        if (a) el.querySelector('svg').style.transform = 'translate(' + (a.dx * n) + 'px,' + (a.dy * n) + 'px) scale(' + (1 + (a.s - 1) * n) + ')';
      });
      // the interviewer's text is left alone until the logo is whole, then it says what the middle piece means
      trio.classList.toggle('whole', p >= 0.74);
    };
    var ticking = false;
    addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(function () { ticking = false; draw(); }); } }, { passive: true });
    addEventListener('resize', measure);
    measure();
  }

  // Easter egg: the three pieces of the logo in the bar shuffle and come back when the pointer (or the keyboard) reaches it.
  var brand = document.querySelector('.brand');
  if (brand && !reduce) {
    var playing = false;
    // once the entrance has played it must not come back when the shuffle class is taken off
    setTimeout(function () { brand.classList.add('built'); }, 1200);
    var play = function () { if (playing) return; playing = true; brand.classList.add('play'); };
    brand.addEventListener('pointerenter', play); brand.addEventListener('focus', play);
    brand.querySelector('svg').addEventListener('animationend', function (e) {
      if (e.animationName !== 'shuffle' || e.target !== brand.querySelectorAll('svg use')[2]) return;
      brand.classList.add('built'); brand.classList.remove('play'); playing = false;
    });
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
