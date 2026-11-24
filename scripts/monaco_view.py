"""Rebuilds the code area of the app's editor (Monaco) for any source text, using the same markup it makes, so the landing page
can show the exercise file changing without loading the editor. The rest of the editor (header, tabs, scrollbars) is kept
from a real capture. tests compare the output with what the editor produced."""
import html, importlib.util, os, re

_here = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('tokenize_js', os.path.join(_here, 'tokenize-js.py'))
tk = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(tk)

LINE = 21


OPEN, CLOSE = '([{', ')]}'


def bracket_levels(source):
    """For every bracket, the nesting level Monaco colours it with: the depth of the pair it belongs to, over all kinds of brackets.
    Returns {(line index, offset in line): level}. Brackets inside strings and comments do not count."""
    levels, stack, in_block = {}, [], False
    for li, line in enumerate(source.split('\n')):
        i = 0
        while i < len(line):
            two = line[i:i + 2]
            if in_block:
                end = line.find('*/', i)
                i = len(line) if end == -1 else end + 2
                in_block = end == -1
                continue
            if two == '/*': in_block = True; i += 2; continue
            if two == '//': break
            c = line[i]
            if c in '\'"`':
                j = i + 1
                while j < len(line) and line[j] != c: j += 2 if line[j] == '\\' else 1
                i = j + 1; continue
            if c in OPEN:
                levels[(li, i)] = len(stack); stack.append(((li, i), c))
            elif c in CLOSE and stack:
                (pl, pi), _ = stack.pop(); levels[(li, i)] = levels[(pl, pi)]
            i += 1
    return levels


def paint_brackets(rows, source):
    """Adds the bracket colour class to the brackets of each rendered line, the way the editor does"""
    levels = bracket_levels(source)
    out = []
    for li, markup in enumerate(rows):
        pos = 0
        def span(m):
            nonlocal pos
            cls, text = m.group(1), m.group(2)
            if cls != 'mtk9': pos += len(html.unescape(text)); return m.group(0)
            raw, built = html.unescape(text), []
            for k, ch in enumerate(raw):
                lvl = levels.get((li, pos + k)) if ch in OPEN + CLOSE else None
                built.append((ch, lvl))
            pos += len(raw)
            # a run of text with brackets is cut so each bracket gets its own class, and the others stay in one piece
            pieces, buf = [], ''
            for ch, lvl in built:
                if lvl is None: buf += ch
                else:
                    if buf: pieces.append((buf, None)); buf = ''
                    pieces.append((ch, lvl))
            if buf: pieces.append((buf, None))
            return ''.join(f'<span class="mtk9{"" if l is None else f" bracket-highlighting-{l}"}">{html.escape(t, quote=False)}</span>' for t, l in pieces)
        out.append(re.sub(r'<span class="(mtk\d+)">([^<]*)</span>', span, markup))
    return out


def nbsp(markup):
    """Monaco writes the spaces inside code as non breaking spaces"""
    return re.sub(r'(<span class="mtk\d+">)([^<]*)(</span>)', lambda m: m.group(1) + m.group(2).replace(' ', '&nbsp;') + m.group(3), markup)


def lines_markup(source):
    rows = []
    for i, markup in enumerate(paint_brackets(tk.code_html(source), source)):
        rows.append(f'<div style="top:{i * LINE}px;height:{LINE}px;line-height:{LINE}px;" class="view-line">{nbsp(markup)}</div>')
    return ''.join(rows)


def gutter_markup(source, foldable):
    """Line numbers. `foldable` is the set of 1 based lines that open a block, which get the fold arrow"""
    rows = []
    for n in range(1, len(source.split('\n')) + 1):
        # the fold arrows are drawn with opacity 0 until the mouse is over the margin, so a still picture has none to show
        fold = ''
        rows.append(f'<div style="top:{(n - 1) * LINE}px;height:{LINE}px;line-height:{LINE}px;">{fold}<div class="line-numbers" style="left:0px;width:42px;">{n}</div></div>')
    return ''.join(rows)


def foldable_lines(source):
    """The lines Monaco puts a fold arrow on: the ones that open a block comment or a brace that closes on a later line"""
    out, stack = set(), []
    for n, line in enumerate(source.split('\n'), 1):
        s = line.strip()
        if s.startswith('/**') and '*/' not in s: stack.append(('c', n))
        elif s.endswith('*/') and stack and stack[-1][0] == 'c':
            _, start = stack.pop(); out.add(start)
        elif s.endswith('{'): stack.append(('b', n))
        elif s.startswith('}') and stack and stack[-1][0] == 'b':
            _, start = stack.pop()
            if n > start: out.add(start)
    return out


from html.parser import HTMLParser

_VOID = {'br', 'img', 'input', 'hr', 'meta', 'link', 'path', 'circle', 'rect', 'source', 'wbr', 'area', 'base', 'col', 'embed', 'param', 'track'}


class _Blocks(HTMLParser):
    """Finds where the inside of an element with a given class starts and ends, by position in the text"""

    def __init__(self, text, wanted):
        super().__init__(convert_charrefs=False)
        self.text, self.wanted, self.stack, self.found = text, wanted, [], {}
        self._starts = [0]
        for line in text.split('\n'): self._starts.append(self._starts[-1] + len(line) + 1)

    def _offset(self):
        line, col = self.getpos()
        return self._starts[line - 1] + col

    def handle_starttag(self, tag, attrs):
        if tag in _VOID: return
        cls = dict(attrs).get('class') or ''
        key = next((w for w in self.wanted if cls.split(' ')[0] == w), None)
        self.stack.append((tag, key, self._offset() + len(self.get_starttag_text())))
        if key and key not in self.found: self.found[key] = [self._offset() + len(self.get_starttag_text()), None]

    def handle_endtag(self, tag):
        if not self.stack or self.stack[-1][0] != tag: return
        _, key, _ = self.stack.pop()
        if key and self.found[key][1] is None: self.found[key][1] = self._offset()


def region(page, name):
    """(start, end) of what is inside the first element of that class"""
    b = _Blocks(page, [name]); b.feed(page)
    return tuple(b.found[name])


def swap_code(page, source):
    """Puts `source` into a captured page: the lines, the line numbers, and the heights that depend on how many lines there are"""
    height = len(source.split('\n')) * LINE
    # work from the end of the text to the start so earlier positions stay valid
    parts = [('view-lines', lines_markup(source)), ('margin-view-overlays', gutter_markup(source, foldable_lines(source)))]
    parts.sort(key=lambda p: -region(page, p[0])[0])
    for name, markup in parts:
        a, z = region(page, name)
        page = page[:a] + markup + page[z:]
    return page
