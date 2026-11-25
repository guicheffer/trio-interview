// A small JavaScript tokenizer that writes the classes Monaco writes in its dark theme, so the demo editor can colour code as the
// user types without loading the editor. It is the same one as scripts/tokenize-js.py (which build-landing.py checks against real
// Monaco output), and scripts/__tests__/demo-page.test.ts checks that the two give the same text for the exercise file.
(function (root) {
  'use strict';
  var KEYWORDS = {}, GLOBALS = {};
  'function if else for while return throw new const let var of in typeof class try catch finally switch case break continue do async await import from export default'.split(' ').forEach(function (w) { KEYWORDS[w] = 1; });
  'Number RangeError Object Array Math JSON Error Map Set String Boolean Symbol Promise'.split(' ').forEach(function (w) { GLOBALS[w] = 1; });
  var TOKEN = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|([^\sA-Za-z_$\d'"`]+)|(\s+)/g;

  function esc(t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, ' '); }

  function parts(line) {
    var out = [], m;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(line)) !== null) {
      var text = m[0], cls = null;
      if (m[1] !== undefined) cls = 'mtk7';
      else if (m[2] !== undefined) cls = 'mtk5';
      else if (m[3] !== undefined) cls = 'mtk6';
      else if (m[4] !== undefined) cls = KEYWORDS.hasOwnProperty(text) ? 'mtk8' : (GLOBALS.hasOwnProperty(text) ? 'mtk22' : 'mtk1');
      else if (m[5] !== undefined) cls = 'mtk9';
      out.push([cls, text]);
    }
    return out;
  }

  function join(list) {
    var merged = [];
    list.forEach(function (p) {
      var cls = p[0], text = p[1], last = merged[merged.length - 1];
      if (cls === null) {
        if (last && (last[0] === 'mtk1' || last[0] === null)) merged[merged.length - 1] = [last[0] || 'mtk1', last[1] + text];
        else merged.push(['mtk1', text]);
      } else if (last && last[0] === cls && cls === 'mtk1') merged[merged.length - 1] = [cls, last[1] + text];
      else merged.push([cls, text]);
    });
    if (!merged.length) return '<span><span></span></span>';
    return '<span>' + merged.map(function (p) { return '<span class="' + p[0] + '">' + esc(p[1]) + '</span>'; }).join('') + '</span>';
  }

  /** The lines of a source text as Monaco colours them. A block comment can cover several lines, so the state is carried over. */
  function codeHtml(source) {
    var out = [], inside = false;
    source.split('\n').forEach(function (line) {
      if (inside) {
        var end = line.indexOf('*/');
        if (end === -1) { out.push('<span><span class="mtk7">' + esc(line) + '</span></span>'); return; }
        inside = false;
        out.push(join([['mtk7', line.slice(0, end + 2)]].concat(parts(line.slice(end + 2)))));
        return;
      }
      var start = line.indexOf('/*');
      var quotes = ["'", '"', '`'].map(function (q) { return line.indexOf(q); }).filter(function (i) { return i !== -1; });
      var quote = quotes.length ? Math.min.apply(null, quotes) : -1;
      if (start !== -1 && (quote === -1 || start < quote) && line.indexOf('*/', start + 2) === -1) {
        out.push(join(parts(line.slice(0, start)).concat([['mtk7', line.slice(start)]])));
        inside = true;
        return;
      }
      out.push(join(parts(line)));
    });
    return out;
  }

  var api = { codeHtml: codeHtml };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DemoTokenize = api;
})(typeof window !== 'undefined' ? window : {});
