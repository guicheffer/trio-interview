export interface Cell { col: number; row: number }
export interface Selection { anchor: Cell; head: Cell }

export type SelectKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End';

/** Moves the free end of a keyboard selection; the other end (anchor) stays where the selection began */
export function moveHead(head: Cell, key: SelectKey, size: { cols: number; rows: number }): Cell {
  const lastRow = size.rows - 1;
  switch (key) {
    case 'ArrowLeft':
      if (head.col > 0) return { col: head.col - 1, row: head.row };
      return head.row > 0 ? { col: size.cols - 1, row: head.row - 1 } : head;
    case 'ArrowRight':
      if (head.col < size.cols) return { col: head.col + 1, row: head.row };
      return head.row < lastRow ? { col: 1, row: head.row + 1 } : head;
    case 'ArrowUp': return { col: head.col, row: Math.max(0, head.row - 1) };
    case 'ArrowDown': return { col: head.col, row: Math.min(lastRow, head.row + 1) };
    case 'Home': return { col: 0, row: head.row };
    default: return { col: size.cols, row: head.row };
  }
}

/** The arguments of xterm's select(column, row, length) for a selection between two cells, whichever comes first */
export function selectionRange(sel: Selection, cols: number): { col: number; row: number; length: number } {
  const before = sel.anchor.row < sel.head.row || (sel.anchor.row === sel.head.row && sel.anchor.col <= sel.head.col);
  const start = before ? sel.anchor : sel.head;
  const end = before ? sel.head : sel.anchor;
  return { col: start.col, row: start.row, length: (end.row - start.row) * cols + (end.col - start.col) };
}
