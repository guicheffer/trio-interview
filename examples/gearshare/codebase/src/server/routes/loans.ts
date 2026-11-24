import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { requireUser } from '../auth.js';
import { RuleError, changeStatus, createLoan } from '../loans.js';

export const loansRouter = Router();
loansRouter.use(requireUser);

function handle<T>(res: import('express').Response, work: () => T, okStatus = 200) {
  try { res.status(okStatus).json(work()); }
  catch (err) {
    if (err instanceof RuleError) return res.status(err.status).json({ error: err.message });
    throw err;
  }
}

/** My loans: what I borrowed and what others asked of me */
loansRouter.get('/', (req, res) => {
  const rows = getDb().prepare(`
    SELECT l.*, i.name AS item_name, i.owner_id,
           CASE WHEN l.borrower_id = ? THEN 'borrowing' ELSE 'lending' END AS side
    FROM loans l JOIN items i ON i.id = l.item_id
    WHERE l.borrower_id = ? OR i.owner_id = ?
    ORDER BY l.start_date DESC
  `).all(req.user!.id, req.user!.id, req.user!.id);
  res.json(rows);
});

loansRouter.post('/', (req, res) => {
  handle(res, () => createLoan(getDb(), { itemId: Number(req.body?.itemId), borrowerId: req.user!.id, start: req.body?.start, end: req.body?.end }), 201);
});

loansRouter.post('/:id/status', (req, res) => {
  handle(res, () => changeStatus(getDb(), Number(req.params.id), req.user!.id, String(req.body?.status ?? '')));
});
