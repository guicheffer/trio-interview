import type { DatabaseSync } from 'node:sqlite';
import { quote, rangesOverlap, validDate } from './pricing.js';

export interface Item { id: number; owner_id: number; name: string; category: string; daily_fee_cents: number; deposit_cents: number; status: string }
export interface Loan { id: number; item_id: number; borrower_id: number; start_date: string; end_date: string; status: string; total_cents: number; returned_at: string | null }

export class RuleError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

/** Loans that block the calendar: a request nobody answered yet does not. */
const BLOCKING = ['approved', 'active'];

export function createLoan(db: DatabaseSync, input: { itemId: number; borrowerId: number; start: unknown; end: unknown }): Loan {
  const { itemId, borrowerId, start, end } = input;
  if (!validDate(start) || !validDate(end)) throw new RuleError(400, 'Dates must look like 2030-01-31');
  if (end <= start) throw new RuleError(400, 'The end date must be after the start date');

  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId) as unknown as Item | undefined;
  if (!item) throw new RuleError(404, 'Item not found');
  if (item.status !== 'available') throw new RuleError(409, 'This item is not available right now');
  if (item.owner_id === borrowerId) throw new RuleError(400, 'You cannot borrow your own item');

  const existing = db.prepare(`SELECT * FROM loans WHERE item_id = ? AND status IN (${BLOCKING.map(() => '?').join(',')})`)
    .all(itemId, ...BLOCKING) as unknown as Loan[];
  if (existing.some(l => rangesOverlap(start, end, l.start_date, l.end_date))) {
    throw new RuleError(409, 'The item is already booked for those dates');
  }

  const price = quote(item.daily_fee_cents, item.deposit_cents, start, end);
  const result = db.prepare('INSERT INTO loans (item_id, borrower_id, start_date, end_date, total_cents) VALUES (?, ?, ?, ?, ?)')
    .run(itemId, borrowerId, start, end, price.totalCents);
  return db.prepare('SELECT * FROM loans WHERE id = ?').get(Number(result.lastInsertRowid)) as unknown as Loan;
}

const NEXT: Record<string, string[]> = {
  requested: ['approved', 'declined', 'cancelled'],
  approved: ['active', 'cancelled'],
  active: ['returned'],
};

/** Moves a loan along its life cycle. Only the item's owner approves, declines or marks it active. */
export function changeStatus(db: DatabaseSync, loanId: number, actorId: number, next: string): Loan {
  const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(loanId) as unknown as Loan | undefined;
  if (!loan) throw new RuleError(404, 'Loan not found');
  if (!(NEXT[loan.status] ?? []).includes(next)) throw new RuleError(409, `A ${loan.status} loan cannot become ${next}`);

  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(loan.item_id) as unknown as Item;
  const ownerOnly = ['approved', 'declined', 'active', 'returned'];
  if (ownerOnly.includes(next) && item.owner_id !== actorId) throw new RuleError(403, 'Only the owner can do that');
  if (next === 'cancelled' && loan.borrower_id !== actorId) throw new RuleError(403, 'Not your loan');

  if (next === 'approved') {
    const clash = db.prepare(`SELECT * FROM loans WHERE item_id = ? AND id != ? AND status IN ('approved','active')`)
      .all(loan.item_id, loan.id) as unknown as Loan[];
    if (clash.some(l => rangesOverlap(loan.start_date, loan.end_date, l.start_date, l.end_date))) {
      throw new RuleError(409, 'Another loan already holds those dates');
    }
  }
  const returnedAt = next === 'returned' ? new Date().toISOString() : null;
  db.prepare('UPDATE loans SET status = ?, returned_at = COALESCE(?, returned_at) WHERE id = ?').run(next, returnedAt, loanId);
  return db.prepare('SELECT * FROM loans WHERE id = ?').get(loanId) as unknown as Loan;
}
