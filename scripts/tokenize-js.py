"""A small JavaScript tokenizer that writes the same classes Monaco does in its dark theme, so the landing page can show
code without loading the editor. It only knows what the exercises use. scripts/build-landing.py checks it against real Monaco output."""
import re, html

KEYWORDS = {'function','if','else','for','while','return','throw','new','const','let','var','of','in','typeof','class','try','catch','finally','switch','case','break','continue','do','async','await','import','from','export','default'}
GLOBALS = {'Number','RangeError','Object','Array','Math','JSON','Error','Map','Set','String','Boolean','Symbol','Promise'}
TOKEN = re.compile(r"""(?P<comment>//[^\n]*|/\*.*?\*/)|(?P<string>'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|(?P<number>\b\d+(?:\.\d+)?\b)|(?P<word>[A-Za-z_$][\w$]*)|(?P<punct>[^\sA-Za-z_$\d'"`]+)|(?P<space>\s+)""", re.S)


def esc(t):
    return html.escape(t, quote=False).replace(' ', ' ')


def code_html(source):
    """The lines of a source text as Monaco colours them. A /* */ comment can cover several lines, so the state is carried over."""
    out, inside = [], False
    for line in source.split('\n'):
        if inside:
            end = line.find('*/')
            if end == -1:
                out.append(f'<span><span class="mtk7">{esc(line)}</span></span>'); continue
            head, rest, inside = line[:end + 2], line[end + 2:], False
            out.append(_join([('mtk7', head)] + _parts(rest)))
            continue
        start = line.find('/*')
        quote = min([i for i in (line.find("'"), line.find('"'), line.find('`')) if i != -1], default=-1)
        if start != -1 and (quote == -1 or start < quote) and '*/' not in line[start + 2:]:
            out.append(_join(_parts(line[:start]) + [('mtk7', line[start:])])); inside = True
            continue
        out.append(_join(_parts(line)))
    return out


def line_html(line):
    return _join(_parts(line))


def _parts(line):
    parts = []  # (class, text)
    for m in TOKEN.finditer(line):
        kind, text = m.lastgroup, m.group()
        if kind == 'comment': cls = 'mtk7'
        elif kind == 'string': cls = 'mtk5'
        elif kind == 'number': cls = 'mtk6'
        elif kind == 'word': cls = 'mtk8' if text in KEYWORDS else ('mtk22' if text in GLOBALS else 'mtk1')
        elif kind == 'punct': cls = 'mtk9'
        else: cls = None  # whitespace takes the class of what is around it
        parts.append((cls, text))
    return parts


def _join(parts):
    # whitespace joins the previous text token (Monaco gives it the class of the surrounding identifier text)
    merged = []
    for cls, text in parts:
        if cls is None:
            if merged and merged[-1][0] in ('mtk1', None): merged[-1] = (merged[-1][0] or 'mtk1', merged[-1][1] + text)
            else: merged.append(('mtk1', text))
        elif merged and merged[-1][0] == cls and cls == 'mtk1':
            merged[-1] = (cls, merged[-1][1] + text)
        else:
            merged.append((cls, text))
    if not merged: return '<span><span></span></span>'
    return '<span>' + ''.join(f'<span class="{c}">{esc(t)}</span>' for c, t in merged) + '</span>'
