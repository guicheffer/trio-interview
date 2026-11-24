import { openDatabase } from './connection.js';
import { seed } from './seed.js';

const db = openDatabase();
seed(db);
console.log('Database ready.');
db.close();
