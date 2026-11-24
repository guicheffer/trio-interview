import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { SCHEMA } from './schema.js';

const defaultPath = resolve(process.cwd(), 'data', 'gearshare.db');

/** One shared connection. Tests pass ':memory:' to get a fresh database. */
export function openDatabase(path: string = process.env.DB_PATH ?? defaultPath): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

let shared: DatabaseSync | null = null;
export function getDb(): DatabaseSync {
  return (shared ??= openDatabase());
}
export function setDb(db: DatabaseSync | null): void {
  shared = db;
}
