"""Builds site/index.html and site/app/scene-*.html from the app snapshots in site/app/.
Each scene is the real markup and the real (pruned) CSS of the app, shown in an iframe so the
layout, which uses the window height, behaves exactly as in a browser of 1440 x 900."""
import os, re

SITE = os.path.join(os.path.dirname(__file__), '..', 'site')
A = os.path.join(SITE, 'app')
SRC = os.path.join(SITE, 'source')


def frag(name):
    return open(os.path.join(SRC, name + '.html')).read()


def scene(name, body, extra_js=''):
    html = f'''<!doctype html><html class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=1440">
<link rel="stylesheet" href="app.css" onload="document.documentElement.classList.add('styled')"><style>
html,body{{margin:0;height:100%;overflow:hidden;background:#0b0b14}}
/* nothing of the scene shows until its stylesheet has been applied, so a slow connection shows the dark frame and never the bare page */
html:not(.styled) body{{visibility:hidden}}
/* the app hides the real cursor of the other person with its own element; we only need these */
.demo-cursor{{position:absolute;z-index:50;pointer-events:none;transition:left .9s cubic-bezier(.4,0,.2,1),top .9s cubic-bezier(.4,0,.2,1)}}
.demo-cursor i{{display:block;width:14px;height:14px;background:#e0529c;clip-path:polygon(0 0,100% 55%,45% 60%,30% 100%)}}
.demo-cursor b{{position:absolute;left:12px;top:14px;background:#e0529c;color:#fff;font:600 11px/1 system-ui;padding:3px 7px;border-radius:5px;white-space:nowrap}}
</style></head><body>{body}<script>{extra_js}</script></body></html>'''
    open(os.path.join(A, f'scene-{name}.html'), 'w').write(html)


# --- scene scripts (each runs inside its own iframe; the page tells it what to show) -------------
XTERM_LINE = lambda w, inner: f'<div style="width: {w}px; height: 16px; line-height: 16px; overflow: hidden;">{inner}</div>'

COMMON_JS = r'''
(function(){
  var q=function(s,r){return (r||document).querySelector(s)}, qa=function(s,r){return [].slice.call((r||document).querySelectorAll(s))};
  function btn(t){return qa('button').filter(function(b){return b.textContent.replace(/\s+/g,' ').trim().indexOf(t)===0})[0]}
  function rows(i){return qa('.xterm-rows')[i]}
  function line(w,html){return '<div style="width:'+w+'px;height:16px;line-height:16px;overflow:hidden;">'+html+'</div>'}
  function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;')}
  window.Scene={q:q,qa:qa,btn:btn,rows:rows,line:line,esc:esc};
})();
'''

SCENE_WORK = COMMON_JS + r'''
(function(){
  var S=window.Scene;
  // the real terminal panes get the same markup xterm makes, with a script of ours as the text
  function setPane(i,w,lines){S.qa('.xterm-rows').filter(function(_,k){return k%2===i}).forEach(function(r){r.innerHTML=lines.map(function(l){return S.line(w,l)}).join('')})}
  var proj=[
    '<span>[0] </span><span>GearShare API on http://127.0.0.1:3002</span>',
    '<span>[1] </span>',
    '<span>[1]   </span><span class="xterm-fg-2">➜</span><span>  </span><span class="xterm-bold">Local</span><span>:   </span><span class="xterm-fg-6">http://127.0.0.1:5173/preview/maya/gearshare/</span>',
    '',
    '<span class="xterm-fg-2">&gt; Preview ready: </span><span class="xterm-underline-1 xterm-fg-4">http://localhost:3000/preview/maya/gearshare/</span>'
  ];
  setPane(0,726,proj);
  var Q='<span style="background-color:#373737">❯ How does a request become a loan?</span>';
  var ANS=['<span>● A request is created by a borrower, the owner approves it, and the</span>',
           '<span>  loan moves on to active and then returned.</span>'];
  var base=['<span style="color:#d77757;"> ▐</span><span style="background-color:#000000;color:#d77757;">▛███▛█</span><span>   </span><span class="xterm-bold">Claude Code</span><span> </span><span style="color:#999999;">v2.1.331</span>',
            '<span style="color:#d77757;">▝▜</span><span style="background-color:#000000;color:#d77757;">█████</span><span style="color:#d77757;">█▀</span><span>  </span><span style="color:#999999;">Sonnet 5.5 · API Usage Billing</span>',
            '<span style="color:#d77757;"> ▝▝   ▝▝ </span><span>  </span><span style="color:#999999;">~/interviews/gearshare</span>',''];
  window.setChat=function(n){ var out=base.slice(); if(n>=1) out.push(Q,''); if(n>=2) out=out.concat(ANS); setPane(1,413,out) };
  setChat(0);
  window.addEventListener('load',function(){ if(document.getElementById('st-hidden')) setChat(2) });
})();
'''

SCENE_VIEW = COMMON_JS + r'''
(function(){
  var S=window.Scene;
  var hid=document.getElementById('st-hidden'), rev=document.getElementById('st-revealed');
  window.reveal=function(on){ hid.style.display=on?'none':'block'; rev.style.display=on?'block':'none'; };
  window.showCursor=function(x,y,label){
    var c=document.getElementById('dc'); if(!c){c=document.createElement('div');c.id='dc';c.className='demo-cursor';c.innerHTML='<i></i><b></b>';document.body.appendChild(c)}
    c.querySelector('b').textContent=label||'Maya'; c.style.left=x+'px'; c.style.top=y+'px';
  };
})();
'''


# --- the fibonacci scene: the real editor and terminals, driven by the script of what really happened ----------
import json, importlib.util as _u, sys as _sys

_sys.path.insert(0, os.path.dirname(__file__))
_spec = _u.spec_from_file_location('monaco_view', os.path.join(os.path.dirname(__file__), 'monaco_view.py'))
mv = _u.module_from_spec(_spec); _spec.loader.exec_module(mv)

def fib_page():
    """The workspace of the fibonacci exercise as the app drew it, with the machine specific bits made neutral"""
    page = open(os.path.join(SRC, 'fibonacci-workspace.html')).read()
    return page.replace('/\u2026/.solutions/maya/fibonacci', '~/interviews/fibonacci')


_sr_spec = _u.spec_from_file_location('story_rows', os.path.join(os.path.dirname(__file__), 'story_rows.py'))
story = _u.module_from_spec(_sr_spec); _sr_spec.loader.exec_module(story)


def build_fib():
    session = json.load(open(os.path.join(SRC, 'fibonacci-session.json')))
    src_before, src_after, terms = session['before'], session['after'], session['terminals']
    neutral = lambda rows: [r.replace('/\u2026/.solutions/maya/fibonacci', '~/interviews/fibonacci') for r in rows]
    page = mv.swap_code(fib_page(), src_before)
    data = {
        'before': src_before, 'after': src_after,
        'linesBefore': mv.lines_markup(src_before), 'linesAfter': mv.lines_markup(src_after),
        'gutterBefore': mv.gutter_markup(src_before, mv.foldable_lines(src_before)), 'gutterAfter': mv.gutter_markup(src_after, mv.foldable_lines(src_after)),
        'claudeAfter': neutral(story.after_screen(src_before, src_after, terms['fibafter_claude_captured'])),
        'claudeBefore': neutral(terms['fibbefore_claude']),
        'inspectLite': open(os.path.join(os.path.dirname(__file__), 'inspect-lite.cjs')).read(),
        'tests': open(os.path.join(os.path.dirname(__file__), '..', 'examples', 'fibonacci', 'fibonacci.test.js')).read(),
    }
    js = open(os.path.join(os.path.dirname(__file__), 'fib-scene.js')).read()
    scene('fib', page, 'window.FIB=' + json.dumps(data, ensure_ascii=False).replace('</', '<\\/') + ';\n' + COMMON_JS + js)
    print('fibonacci scene written')


def build():
    iv, rv, wc, pk, wk = frag('interviewer'), frag('revealed'), frag('welcome'), frag('picker'), frag('workspace')
    scene('welcome', wc)
    scene('picker', pk)
    scene('work', wk, SCENE_WORK)
    both = ('<div id="st-hidden">' + iv + '</div><div id="st-revealed" style="display:none">' + rv + '</div>')
    scene('view', both, SCENE_WORK + SCENE_VIEW)
    build_fib()
    print('scenes written')


if __name__ == '__main__':
    build()
