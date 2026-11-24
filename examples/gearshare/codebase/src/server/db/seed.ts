import type { DatabaseSync } from 'node:sqlite';

const USERS = [
  ['Ana Torres', 'ana@example.test', 'member'],
  ['Ben Okafor', 'ben@example.test', 'member'],
  ['Chloe Martin', 'chloe@example.test', 'member'],
  ['Dev Patel', 'dev@example.test', 'admin'],
] as const;

const ITEMS = [
  [1, 'Cordless drill', 'tools', 500, 2000],
  [1, 'Extension ladder', 'tools', 800, 3000],
  [2, 'Two person tent', 'camping', 700, 2500],
  [2, 'Camping stove', 'camping', 300, 1000],
  [3, 'Projector', 'electronics', 1200, 5000],
  [3, 'Party speaker', 'electronics', 900, 3000],
] as const;

export function seed(db: DatabaseSync): void {
  const hasUsers = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
  if (hasUsers.n > 0) return;
  const addUser = db.prepare('INSERT INTO users (name, email, role) VALUES (?, ?, ?)');
  for (const u of USERS) addUser.run(...u);
  const addItem = db.prepare('INSERT INTO items (owner_id, name, category, daily_fee_cents, deposit_cents) VALUES (?, ?, ?, ?, ?)');
  for (const i of ITEMS) addItem.run(...i);
  // One loan that is already running, so the calendar has something in it
  db.prepare(`INSERT INTO loans (item_id, borrower_id, start_date, end_date, status, total_cents) VALUES (?, ?, ?, ?, 'active', ?)`)
    .run(1, 2, '2030-01-10', '2030-01-13', 1500);
}
