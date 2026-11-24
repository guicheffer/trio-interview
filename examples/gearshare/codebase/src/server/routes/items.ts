import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { requireUser } from '../auth.js';
import { quote, validDate } from '../pricing.js';

export const itemsRouter = Router();

itemsRouter.get('/', (req, res) => {
  const { category, q } = req.query;
  const clauses: string[] = [`i.status = 'available'`];
  const params: string[] = [];
  if (typeof category === 'string' && category) { clauses.push('i.category = ?'); params.push(category); }
  if (typeof q === 'string' && q.trim()) { clauses.push('LOWER(i.name) LIKE ?'); params.push(`%${q.trim().toLowerCase()}%`); }
  const rows = getDb().prepare(`
    SELECT i.id, i.name, i.category, i.daily_fee_cents, i.deposit_cents, u.name AS owner_name
    FROM items i JOIN users u ON u.id = i.owner_id
    WHERE ${clauses.join(' AND ')} ORDER BY i.name
  `).all(...params);
  res.json(rows);
});

itemsRouter.get('/:id', (req, res) => {
  const item = getDb().prepare(`
    SELECT i.*, u.name AS owner_name FROM items i JOIN users u ON u.id = i.owner_id WHERE i.id = ?
  `).get(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Item not found' });
  res.json(item);
});

/** What it would cost, before asking */
itemsRouter.get('/:id/quote', (req, res) => {
  const { start, end } = req.query;
  if (!validDate(start) || !validDate(end) || end <= start) return res.status(400).json({ error: 'Send start and end as 2030-01-31, end after start' });
  const item = getDb().prepare('SELECT daily_fee_cents, deposit_cents FROM items WHERE id = ?').get(Number(req.params.id)) as { daily_fee_cents: number; deposit_cents: number } | undefined;
  if (!item) return res.status(404).json({ error: 'Item not found' });
  res.json(quote(item.daily_fee_cents, item.deposit_cents, start, end));
});

itemsRouter.post('/', requireUser, (req, res) => {
  const { name, category, dailyFeeCents, depositCents } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'A name is required' });
  if (typeof category !== 'string' || !category.trim()) return res.status(400).json({ error: 'A category is required' });
  if (!Number.isInteger(dailyFeeCents) || dailyFeeCents < 0) return res.status(400).json({ error: 'The daily fee must be a whole number of cents' });
  const deposit = Number.isInteger(depositCents) && depositCents >= 0 ? depositCents : 0;
  const result = getDb().prepare('INSERT INTO items (owner_id, name, category, daily_fee_cents, deposit_cents) VALUES (?, ?, ?, ?, ?)')
    .run(req.user!.id, name.trim(), category.trim(), dailyFeeCents, deposit);
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});
