// The live demo page. The workspace is the scene of the landing page (../app/scene-fib.html), embedded by address, so whatever
// improves there improves here. This file only fits it to the window and swaps what the right panel shows. Nothing is sent anywhere.
(function () {
  var frame = document.getElementById('app'), box = document.getElementById('box'), stage = document.getElementById('stage');
  var buttons = [].slice.call(document.querySelectorAll('.opt'));

  function fit() {
    var w = stage.clientWidth - 24, h = stage.clientHeight - 24;
    var s = Math.max(0.1, Math.min(w / 1440, h / 900));
    box.style.width = Math.round(1440 * s) + 'px';
    box.style.height = Math.round(900 * s) + 'px';
    frame.style.transform = 'scale(' + s + ')';
  }
  fit(); addEventListener('resize', fit);

  var CSS = '.demo-chat{display:flex;flex-direction:column;height:100%;background:#111827;color:#f3f4f6;font:14px/1.4 system-ui,sans-serif;border-left:1px solid #374151}' +
    '.demo-chat .hd{padding:12px 16px;border-bottom:1px solid #374151}.demo-chat .hd .r{display:flex;justify-content:space-between;align-items:center}' +
    '.demo-chat h3{margin:0;font-size:14px;font-weight:600}.demo-chat .m{margin:2px 0 0;font:12px ui-monospace,monospace;color:#f472b6}' +
    '.demo-chat .sub{margin:4px 0 0;font-size:12px;color:#9ca3af}.demo-chat .st{font-size:12px;background:#22c55e;color:#fff;border-radius:8px;padding:6px 10px;font-weight:500;opacity:.5}' +
    '.demo-chat .body{flex:1;overflow:auto;padding:16px;text-align:center;color:#9ca3af;font-size:14px;padding-top:48px}.demo-chat .body svg{width:40px;height:40px;opacity:.4;margin-bottom:12px}' +
    '.demo-chat form{border-top:1px solid #374151;padding:16px;display:flex;flex-direction:column;gap:8px}' +
    '.demo-chat textarea{width:100%;box-sizing:border-box;min-height:36px;padding:8px 16px;border:1px solid #4b5563;border-radius:8px;background:#1f2937;color:#f3f4f6;font:14px/20px system-ui,sans-serif;resize:none}' +
    '.demo-chat textarea::placeholder{color:#6b7280}.demo-chat .row{display:flex;justify-content:space-between;align-items:center;gap:8px}' +
    '.demo-chat select{min-width:120px;font-size:12px;background:#374151;color:#d1d5db;border:1px solid #4b5563;border-radius:8px;padding:8px}' +
    '.demo-chat .send{background:#16a34a;color:#fff;border:0;border-radius:8px;padding:8px 16px;font-size:14px;font-weight:500;opacity:.5}' +
    '.demo-note{flex:none;padding:5px 12px;font:11px/1.35 system-ui,sans-serif;color:#9ca3af;background:#1a1a2e;border-bottom:1px solid #374151}' +
    '.demo-oc{height:100%;background:#1a1a2e;color:#e5e7eb;font:13px/16px "Cascadia Code","Fira Code",Menlo,monospace;padding:12px;box-sizing:border-box;overflow:hidden}' +
    '.demo-oc .bx{border:1px solid #4b5563;border-radius:4px;padding:8px 10px;margin-top:10px;color:#9ca3af}.demo-oc b{color:#e5e7eb}';

  var chatHtml = '<div class="demo-chat"><div class="hd"><div class="r"><div><h3>AI Assistant</h3><p class="m">claude-sonnet-5-5</p></div><span class="st">&#9654; Start</span></div><p class="sub">Ask questions or request help</p></div>' +
    '<div class="body"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg><p>Click &#9654; Start to get a guided introduction</p></div>' +
    '<form onsubmit="return false"><textarea rows="1" disabled aria-label="Message to the assistant (disabled in the demo)" placeholder="Ask AI for help… (Shift+Enter for new line)"></textarea>' +
    '<div class="row"><select disabled aria-label="Model"><option>Sonnet 5.5 (latest)</option></select><button class="send" type="button" disabled>Send</button></div></form></div>';

  function setup(doc) {
    var st = doc.createElement('style'); st.textContent = CSS; doc.head.appendChild(st);
    var inner = doc.querySelector('#chat .relative.h-full'); if (!inner) return null;
    var claude = inner.firstElementChild;
    // The header and the terminal of Claude Code stay as the app drew them; the input is off and a note says why
    var tag = claude.querySelector('.text-green-400'); if (tag) { tag.textContent = '○ shown only'; tag.className = 'text-xs text-gray-500'; }
    var change = claude.querySelector('button'); if (change) change.disabled = true;
    var helper = claude.querySelector('textarea'); if (helper) { helper.disabled = true; helper.setAttribute('aria-label', 'Terminal input (disabled in the demo)'); }
    var note = doc.createElement('div'); note.className = 'demo-note'; note.textContent = 'The assistant is shown, not connected: nobody can send it a message here.';
    claude.insertBefore(note, claude.children[1]);

    var chat = doc.createElement('div'); chat.style.height = '100%'; chat.innerHTML = chatHtml;
    // OpenCode has no capture of its own: this is built from the same terminal header the app uses, with a script of ours as the text
    var oc = claude.cloneNode(false); oc.innerHTML = claude.firstElementChild.outerHTML;
    oc.appendChild(note.cloneNode(true));
    var body = doc.createElement('div'); body.className = 'demo-oc';
    body.innerHTML = '<div><b>OpenCode</b></div><div style="color:#9ca3af">~/interviews/fibonacci</div><div class="bx">Ask anything… "Fix a bug in fibonacci.js"</div>';
    oc.appendChild(body);
    var head = oc.firstElementChild;
    var names = head.querySelectorAll('span'); if (names[0]) names[0].textContent = 'OpenCode';
    var icon = head.querySelector('svg');
    if (icon) icon.outerHTML = '<svg class="h-4 w-4" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" shapeRendering="crispEdges"><path fill="#9CA3AF" d="M4 3h16v18H4z"/><path fill="#1F1F1F" d="M8 8h8v8H8z"/><path fill="#E5E7EB" d="M10 10h4v4h-4z"/></svg>';
    var b = head.querySelector('button'); if (b) b.disabled = true;
    return { inner: inner, views: { 'claude-code': claude, chat: chat, opencode: oc } };
  }

  var parts = null;
  function show(mode) {
    if (!parts) return;
    var cur = parts.inner.firstElementChild;
    if (cur !== parts.views[mode]) parts.inner.replaceChild(parts.views[mode], cur);
    buttons.forEach(function (b) { var on = b.dataset.mode === mode; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  }
  buttons.forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.mode); }); });

  function ready() { parts = setup(frame.contentDocument); show('claude-code'); document.documentElement.dataset.ready = '1'; }
  if (frame.contentDocument && frame.contentDocument.readyState === 'complete' && frame.contentDocument.querySelector('#chat')) ready();
  else frame.addEventListener('load', ready);
})();
