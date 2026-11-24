import express from 'express';
import cookieParser from 'cookie-parser';
import { loadUser } from './auth.js';
import { sessionRouter } from './routes/session.js';
import { itemsRouter } from './routes/items.js';
import { loansRouter } from './routes/loans.js';

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(loadUser);
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/session', sessionRouter);
  app.use('/api/items', itemsRouter);
  app.use('/api/loans', loansRouter);
  return app;
}
