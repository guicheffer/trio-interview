import { Router } from 'express';
import { getDb } from '../db/connection.js';

export const sessionRouter = Router();

sessionRouter.get('/users', (_req, res) => {
  res.json(getDb().prepare('SELECT id, name, email, role FROM users ORDER BY id').all());
});

sessionRouter.post('/login', (req, res) => {
  const user = getDb().prepare('SELECT id, name, email, role FROM users WHERE email = ?').get(String(req.body?.email ?? '').toLowerCase()) as { id: number } | undefined;
  if (!user) return res.status(401).json({ error: 'Unknown email' });
  res.cookie('gs_user', String(user.id), { httpOnly: true, sameSite: 'lax' });
  res.json(user);
});

sessionRouter.post('/logout', (_req, res) => {
  res.clearCookie('gs_user');
  res.json({ ok: true });
});

sessionRouter.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not logged in' });
  res.json(req.user);
});
