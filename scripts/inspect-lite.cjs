// A small copy of how Node prints a value with console.log, enough for the exercises (numbers, strings, arrays, plain objects).
// The landing page runs the exercise code in the browser and prints its output with this, so it reads like the real terminal.
// scripts/__tests__/inspect-lite.test.ts compares it with Node's own util.inspect.
(function (root) {
  var BREAK = 80, COMPACT = 3, ENTRIES_OUTPUT_LIMIT = 6;

  function quote(s) {
    var q = s.indexOf("'") === -1 ? "'" : (s.indexOf('"') === -1 ? '"' : (s.indexOf('`') === -1 && s.indexOf('${') === -1 ? '`' : "'"));
    var out = s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r');
    if (q === "'") out = out.replace(/'/g, "\\'");
    return q + out + q;
  }

  function primitive(v) {
    if (typeof v === 'string') return quote(v);
    if (typeof v === 'number') return Object.is(v, -0) ? '-0' : String(v);
    if (typeof v === 'bigint') return v + 'n';
    return String(v);
  }

  function key(k) { return /^[A-Za-z_$][\w$]*$/.test(k) ? k : quote(k); }

  // Node groups a long array of short entries into aligned columns
  function groupArrayElements(output, outputLength, value) {
    var totalLength = 0, maxLength = 0, i = 0;
    var separatorSpace = 2, dataLen = new Array(outputLength);
    for (; i < outputLength; i++) {
      var len = output[i].length;
      dataLen[i] = len;
      totalLength += len + separatorSpace;
      if (maxLength < len) maxLength = len;
    }
    var actualMax = maxLength + separatorSpace;
    if (actualMax * 3 + 2 < BREAK && (totalLength / actualMax > 5 || maxLength <= 6)) {
      var approxCharHeights = 2.5, averageBias = Math.sqrt(actualMax - totalLength / output.length), biasedMax = Math.max(actualMax - 3 - averageBias, 1);
      var columns = Math.min(
        Math.round(Math.sqrt(approxCharHeights * biasedMax * outputLength) / biasedMax),
        Math.floor((BREAK - 2) / actualMax),
        COMPACT * 4,
        15
      );
      if (columns <= 1) return output;
      var tmp = [], maxLineLength = [];
      for (i = 0; i < columns; i++) {
        var lineLength = 0;
        for (var j = i; j < output.length; j += columns) if (dataLen[j] > lineLength) lineLength = dataLen[j];
        maxLineLength.push(lineLength + separatorSpace);
      }
      var order = String.prototype.padStart;
      if (value !== undefined) {
        for (i = 0; i < output.length; i++) if (typeof value[i] !== 'number' && typeof value[i] !== 'bigint') { order = String.prototype.padEnd; break; }
      }
      for (i = 0; i < outputLength; i += columns) {
        var max = Math.min(i + columns, outputLength), str = '', k = i;
        for (; k < max - 1; k++) {
          var padding = maxLineLength[k - i] + output[k].length - dataLen[k];
          str += order.call(output[k] + ', ', padding, ' ');
        }
        if (order === String.prototype.padStart) {
          var padding2 = maxLineLength[k - i] + output[k].length - dataLen[k] - separatorSpace;
          str += output[k].padStart(padding2, ' ');
        } else {
          str += output[k];
        }
        tmp.push(str);
      }
      output = tmp;
    }
    return output;
  }

  function reduceToSingleString(output, base, braces, extrasType, indentationLvl, isArrayLike) {
    var entries = output.length;
    if (extrasType === 'array' && entries > ENTRIES_OUTPUT_LIMIT) output = groupArrayElements(output, output.length, isArrayLike);
    if (entries === output.length || extrasType !== 'array') {
      // Node's "compact" mode: the entries go on one line when they fit in the break length
      var start = output.length + indentationLvl + braces[0].length + base.length + 10;
      var totalLength = output.length + start;
      if (totalLength + output.length <= BREAK) {
        for (var i = 0; i < output.length; i++) totalLength += output[i].length;
        if (totalLength <= BREAK && output.every(function (o) { return o.indexOf('\n') === -1; })) {
          return (base ? base + ' ' : '') + braces[0] + ' ' + output.join(', ') + ' ' + braces[1];
        }
      }
    }
    var ind = '\n' + ' '.repeat(indentationLvl);
    return (base ? base + ' ' : '') + braces[0] + ind + '  ' + output.join(',' + ind + '  ') + ind + braces[1];
  }

  function format(v, depth, indent) {
    if (v === null || typeof v !== 'object') return primitive(v);
    if (depth > 2) return Array.isArray(v) ? '[Array]' : '[Object]';
    if (Array.isArray(v)) {
      if (v.length === 0) return '[]';
      var out = [], shown = Math.min(v.length, 100);
      for (var i = 0; i < shown; i++) out.push(format(v[i], depth + 1, indent + 2));
      if (v.length > shown) out.push('... ' + (v.length - shown) + ' more item' + (v.length - shown > 1 ? 's' : ''));
      var combine = out.length > 6 && depth === 0 ? 'array' : (out.length > 6 ? 'array' : 'array');
      return reduceToSingleString(out, '', ['[', ']'], combine, indent, v);
    }
    var keys = Object.keys(v);
    if (!keys.length) return '{}';
    var props = keys.map(function (k) { return key(k) + ': ' + format(v[k], depth + 1, indent + 2); });
    return reduceToSingleString(props, '', ['{', '}'], 'object', indent, undefined);
  }

  // console.log(a, b): strings are printed as they are, everything else is inspected, joined by a space
  function line(args) { return args.map(function (a) { return typeof a === 'string' ? a : format(a, 0, 0); }).join(' '); }

  root.inspectLite = { format: function (v) { return format(v, 0, 0); }, line: line };
  if (typeof module !== 'undefined') module.exports = root.inspectLite;
})(typeof self !== "undefined" ? self : globalThis);
