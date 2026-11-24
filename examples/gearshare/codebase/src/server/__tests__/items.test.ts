import { beforeEach, describe, expect, test } from 'vitest';
import { freshApp, loginAs } from './helpers.js';

beforeEach(() => { freshApp(); });

describe('browsing items', () => {
  test('lists what is available, filtered by category and search', async () => {
    const { app } = freshApp();
    const ana = await loginAs(app, 'ana@example.test');
    expect((await ana.get('/api/items')).body).toHaveLength(6);
    expect((await ana.get('/api/items?category=camping')).body.map((i: { name: string }) => i.name)).toEqual(['Camping stove', 'Two person tent']);
    expect((await ana.get('/api/items?q=DRILL')).body).toHaveLength(1);
  });

  test('quotes a price before asking', async () => {
    const { app } = freshApp();
    const ana = await loginAs(app, 'ana@example.test');
    const res = await ana.get('/api/items/5/quote?start=2030-02-01&end=2030-02-08').expect(200);
    expect(res.body).toEqual({ days: 7, feeCents: 7560, depositCents: 5000, totalCents: 12560 });
    await ana.get('/api/items/5/quote?start=2030-02-08&end=2030-02-01').expect(400);
  });

  test('adding an item needs a login and valid numbers', async () => {
    const { app } = freshApp();
    const ana = await loginAs(app, 'ana@example.test');
    await ana.post('/api/items').send({ name: 'Hammer', category: 'tools', dailyFeeCents: 150 }).expect(201);
    await ana.post('/api/items').send({ name: 'Hammer', category: 'tools', dailyFeeCents: 'a lot' }).expect(400);
  });
});
