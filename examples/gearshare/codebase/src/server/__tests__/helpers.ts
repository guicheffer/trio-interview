import request from 'supertest';
import { createApp } from '../app.js';
import { openDatabase, setDb } from '../db/connection.js';
import { seed } from '../db/seed.js';

/** A fresh in-memory database with the demo data, and an app on top of it */
export function freshApp() {
  const db = openDatabase(':memory:');
  seed(db);
  setDb(db);
  return { db, app: createApp() };
}

/** A supertest agent already logged in as the given email */
export async function loginAs(app: ReturnType<typeof createApp>, email: string) {
  const agent = request.agent(app);
  await agent.post('/api/session/login').send({ email }).expect(200);
  return agent;
}
