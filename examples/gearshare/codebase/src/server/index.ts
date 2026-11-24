import { createApp } from './app.js';
import { getDb } from './db/connection.js';
import { seed } from './db/seed.js';

seed(getDb());
const port = Number(process.env.PORT ?? 3002);
createApp().listen(port, '127.0.0.1', () => console.log(`GearShare API on http://127.0.0.1:${port}`));
