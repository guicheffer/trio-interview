export interface DiffHunk {
  /** Where the hunk starts in the new text (0 based line) */
  line: number;
  removed: string[];
  added: string[];
}

type Op = { kind: 'same' | 'del' | 'add'; text: string };

const MAX_LINES = 2500;

function lines(text: string): string[] {
  return text === '' ? [] : text.split('\n');
}

/** Line by line difference between two texts, as a list of unchanged, removed and added lines. Null when too big. */
function operations(before: string[], after: string[]): Op[] | null {
  if (before.length > MAX_LINES || after.length > MAX_LINES) return null;
  const n = before.length;
  const m = after.length;
  const width = m + 1;
  const table = new Uint16Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] = before[i] === after[j]
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) { ops.push({ kind: 'same', text: before[i] }); i++; j++; }
    else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) { ops.push({ kind: 'del', text: before[i++] }); }
    else { ops.push({ kind: 'add', text: after[j++] }); }
  }
  while (i < n) ops.push({ kind: 'del', text: before[i++] });
  while (j < m) ops.push({ kind: 'add', text: after[j++] });
  return ops;
}

/** Groups of changed lines in a row; each one can be undone on its own */
export function diffHunks(before: string, after: string): DiffHunk[] | null {
  const ops = operations(lines(before), lines(after));
  if (!ops) return null;
  const hunks: DiffHunk[] = [];
  let newLine = 0;
  let current: DiffHunk | null = null;
  for (const op of ops) {
    if (op.kind === 'same') { current = null; newLine++; continue; }
    if (!current) { current = { line: newLine, removed: [], added: [] }; hunks.push(current); }
    if (op.kind === 'del') current.removed.push(op.text);
    else { current.added.push(op.text); newLine++; }
  }
  return hunks;
}

/** The text with one hunk put back the way it was before */
export function revertHunk(before: string, after: string, index: number): string | null {
  const ops = operations(lines(before), lines(after));
  if (!ops) return null;
  const out: string[] = [];
  let hunk = -1;
  let inHunk = false;
  for (const op of ops) {
    if (op.kind === 'same') { inHunk = false; out.push(op.text); continue; }
    if (!inHunk) { inHunk = true; hunk++; }
    if (hunk === index) { if (op.kind === 'del') out.push(op.text); }
    else if (op.kind === 'add') out.push(op.text);
  }
  return out.join('\n');
}

/** How many lines were added and removed going from one text to the other (null when the files are too big to compare) */
export function countChanges(before: string, after: string): { added: number; removed: number } | null {
  const hunks = diffHunks(before, after);
  if (!hunks) return null;
  return {
    added: hunks.reduce((n, h) => n + h.added.length, 0),
    removed: hunks.reduce((n, h) => n + h.removed.length, 0),
  };
}
