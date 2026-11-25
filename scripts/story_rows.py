"""The assistant's terminal in the landing scene: the diff it prints and its closing message, built from the exercise file before and
after the change. Change the code in site/source/fibonacci-session.json and rebuild, and the rows, the numbers and the editor follow.
The colours are the ones the real tool printed. The closing message is text we wrote: it is not a recording of a session."""
import html, importlib.util, os, difflib

_here = os.path.dirname(__file__)
_spec = importlib.util.spec_from_file_location('tk', os.path.join(_here, 'tokenize-js.py'))
tk = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(tk)

COL = {'keyword': '#f92672', 'function': '#a6e22e', 'number': '#be84ff', 'string': '#e6db74', 'comment': '#75715e', 'const': '#66d9ef'}
W = 44                      # the width of the assistant's pane, in characters
GREEN_BG, RED_BG = '#022800', '#3d0100'
HI = 'color:#b1b9f9;'


def cells(code):
    out = []
    for m in tk.TOKEN.finditer(code):
        t, k, c = m.group(0), m.lastgroup, '#f8f8f2'
        if k == 'comment': c = COL['comment']
        elif k == 'string': c = COL['string']
        elif k == 'number': c = COL['number']
        elif k == 'word':
            if t in ('const', 'let', 'var', 'function'): c = COL['const']
            elif t in tk.KEYWORDS: c = COL['keyword']
            elif t in tk.GLOBALS or code[m.end():m.end() + 1] == '(': c = COL['function']
        out += [(c, ch) for ch in t]
    return out


def paint(cs, bg, pad=0):
    cs = cs + [('#f8f8f2', ' ')] * max(0, pad - len(cs))
    out, cur, run = [], None, ''
    for c, ch in cs:
        if c != cur:
            if run: out.append('<span style="background-color:%s;color:%s;">%s</span>' % (bg, cur, html.escape(run, quote=False)))
            cur, run = c, ''
        run += ch
    if run: out.append('<span style="background-color:%s;color:%s;">%s</span>' % (bg, cur, html.escape(run, quote=False)))
    return ''.join(out)


def _row(num, sign, cs, bg, signcol, first):
    label = f' {num:>2} {sign}' if first else f'    {sign}'
    return '<span>     </span><span style="background-color:%s;color:%s;">%s</span>' % (bg, signcol, label) + paint(cs, bg, W)


def _context(num, text):
    body = paint(cells(text), 'transparent').replace('background-color:transparent;', '') if text else ''
    return '<span>     </span><span class="xterm-dim"> %d </span>%s' % (num, body)


def diff_rows(before, after):
    """What Claude Code prints for an edit: a little context, the removed lines in red, the added ones in green, long lines wrapped"""
    a, b = before.split('\n'), after.split('\n')
    ops = difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes()
    changes = [o for o in ops if o[0] != 'equal']
    first, last = changes[0], changes[-1]
    rows = []
    for tag, i1, i2, j1, j2 in ops:
        if tag == 'equal':
            seg = list(range(j1, j2))
            if j1 < first[3]: take = [j for j in seg if j >= first[3] - 3]
            elif j2 > last[4]: take = [j for j in seg if j < last[4] + 2]
            else: take = [j for j in seg if j < j1 + 2 or j >= j2 - 2]
            if take != seg and j1 >= first[3] and j2 <= last[4]: rows.append(None)
            rows += [('ctx', j + 1, b[j]) for j in take]
        else:
            rows += [('del', i + 1, a[i]) for i in range(i1, i2)] + [('add', j + 1, b[j]) for j in range(j1, j2)]
    out = []
    for r in rows:
        if r is None: out.append('<span>     </span><span class="xterm-dim">  \u2026</span>'); continue
        kind, n, text = r
        if kind == 'ctx': out.append(_context(n, text)); continue
        bg, sc, sg = (RED_BG, '#dc5a5a', '-') if kind == 'del' else (GREEN_BG, '#50c850', '+')
        cs = cells(text)
        parts = [cs[i:i + W] for i in range(0, max(1, len(cs)), W)] or [[]]
        out += [_row(n, sg, part, bg, sc, k == 0) for k, part in enumerate(parts)]
    return out


def _span(t, hi=False):
    return '<span%s>%s</span>' % (' style="%s"' % HI if hi else '', html.escape(t, quote=False))


# the closing message, as pairs of (text, highlighted). The first row begins with the white dot Claude Code prints.
MESSAGE = [
    [('\u23fa', 0), (' I implemented ', 0), ('fibonacci(n)', 1), (' and ', 0), ('fibonacciUpTo', 1)],
    [('  (limit)', 0), (' in ', 0), ('fibonacci.js', 1), ('. Both reject', 0)],
    [('  invalid input with a ', 0), ('RangeError', 1), ('.', 0)],
    [],
    [('  I ran ', 0), ('node fibonacci.js', 1), (' and the four', 0)],
    [('  checks print what the comments expect. Then', 0)],
    [('  I ran ', 0), ('node --test', 1), (': all 10 tests pass.', 0)],
]


def message_rows():
    out = []
    for parts in MESSAGE:
        row = ''
        for t, hi in parts:
            row += '<span style="color: rgb(255, 255, 255); letter-spacing: -0.395047px;">\u23fa</span>' if t == '\u23fa' else _span(t, hi)
        out.append(row)
    return out


def after_screen(before, after, template):
    """The whole screen after the answer. `template` is the captured screen, whose last rows (the rule, the prompt, the status line) are kept"""
    ran = template[21].replace('1</span><span style="color:#999999;"> shell command', '2</span><span style="color:#999999;"> shell commands')
    return diff_rows(before, after) + ['', ran, ''] + message_rows() + ['', template[37]] + template[38:43]
