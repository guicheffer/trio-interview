"""Builds site/app/ from DOM snapshots of the running app (see docs: landing page).
Keeps only the CSS rules the snapshot uses, so the replica is the real markup with the real styles."""
import re, sys, os
src, out = sys.argv[1], sys.argv[2]
s = open(src).read()
css = re.search(r'<style>(.*?)</style>', s, re.S).group(1)
body = s[s.index('</head>') + 7:]
used = set(c for m in re.findall(r'class="([^"]*)"', body) for c in m.split())
tags = set(re.findall(r'<([a-z0-9]+)', body))
used |= {'dark', 'light'}  # these live on <html>, not in the markup

def blocks(text):
    i, depth, start = 0, 0, 0
    while i < len(text):
        c = text[i]
        if c == '{': depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                yield text[start:i + 1]; start = i + 1
        i += 1

# The editor and the terminals make classes while they run (colours, bracket levels, line numbers), so what the
# captured markup happens to use is not the whole list. Their rules are all kept, the rest is pruned by the markup.
ALWAYS = re.compile(r'monaco|\.mtk\d|bracket-|\.codicon|\.xterm|line-numbers|\.minimap|\.decorationsOverviewRuler|\.scrollbar|\.margin-view|\.glyph-margin|\.overflow-guard|\.view-|\.lines-content|\.cursors-layer|\.core-guide|\.selected-text|\.current-line')


def split_selectors(head):
    """A selector list cut at its top level commas only. `:is(.a, .b)` and `[x="a,b"]` keep their commas, because cutting
    inside them leaves an open parenthesis, which makes the browser swallow every rule that follows."""
    parts, depth, quote, buf = [], 0, '', ''
    for ch in head:
        if quote:
            buf += ch
            if ch == quote: quote = ''
            continue
        if ch in '"\'': quote = ch
        elif ch in '([': depth += 1
        elif ch in ')]': depth = max(0, depth - 1)
        if ch == ',' and depth == 0: parts.append(buf); buf = ''
        else: buf += ch
    if buf.strip(): parts.append(buf)
    return parts


def keep_selector(sel):
    if ALWAYS.search(sel): return True
    if re.search(r'^(\*|:root|html|body|::|\[data|\.dark|\.light)', sel.strip()) and not re.search(r'\.[\w\\:\[\]/.%-]+', sel): return True
    cl = set(re.findall(r'\.((?:\\.|[\w-])+)', sel))
    cl = {re.sub(r'\\(.)', r'\1', c) for c in cl}
    if cl: return cl <= used or bool(cl & used) and all(c in used or not c for c in cl)
    t = re.findall(r'(?:^|[\s>+~,(])([a-z][a-z0-9]*)', sel)
    return not t or all(x in tags or x in ('html', 'body') for x in t)

def prune(text):
    res = []
    for b in blocks(text):
        b = b.strip()
        if not b: continue
        head = b[:b.index('{')].strip()
        if head.startswith('@font-face') or head.startswith('@keyframes') or head.startswith('@property'):
            res.append(b); continue
        if head.startswith('@media') or head.startswith('@supports') or head.startswith('@layer'):
            inner = b[b.index('{') + 1:b.rindex('}')]
            p = prune(inner)
            if p.strip(): res.append(head + '{' + p + '}')
            continue
        sels = [x for x in split_selectors(head) if keep_selector(x)]
        if sels: res.append(','.join(sels) + b[b.index('{'):])
    return '\n'.join(res)

# The editor's own stylesheet comes from a CDN, so the browser will not let a page read its rules (cssRules throws for another
# origin) and a capture made from document.styleSheets silently has none of them. It is kept in the repository instead.
VENDOR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site', 'vendor', 'monaco', 'editor.main.css')
vendor = open(VENDOR).read() if os.path.exists(VENDOR) else ''
if not vendor: print('warning: site/vendor/monaco/editor.main.css is missing, the editor will be drawn without its layout')
css = vendor + '\n' + css

# The icon font (162 KB as base64) and the 66 KB of variables that name its glyphs draw nothing in a still picture of the editor
css = re.sub(r'@font-face\s*\{[^}]*font-family:\s*codicon[^}]*\}', '', css)
css = re.sub(r':root\s*\{(?:\s*--vscode-icon-[^;]*;)+\s*\}', '', css)

pruned = prune(css)
pruned = re.sub(r'url\(/__nextjs_font/([^)]+)\)', r'url(../fonts/\1)', pruned)
os.makedirs(out, exist_ok=True)
name = os.path.basename(src).replace('.html', '')
open(f'{out}/app.css', 'w').write(pruned) if name == 'workspace' else None
open(f'{out}/{name}.frag.html', 'w').write(body.replace('<body>', '').replace('</body>', '').replace('</html>', ''))
print(name, 'css', len(css), '->', len(pruned), 'frag', len(body))
