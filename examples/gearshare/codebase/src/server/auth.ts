import type { NextFunction, Request, Response } from 'express';
import { getDb } from './db/connection.js';

export interface SessionUser { id: number; name: string; email: string; role: string }

declare module 'express-serve-static-core' {
  interface Request { user?: SessionUser }
}

/** A demo login: the cookie holds the user id. Good enough for an exercise, not for production. */
export function loadUser(req: Request, _res: Response, next: NextFunction) {
  const id = Number(req.cookies?.gs_user);
  if (Number.isInteger(id) && id > 0) {
    req.user = getDb().prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(id) as SessionUser | undefined;
  }
  next();
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Log in first' });
  next();
}
