import { beforeEach, describe, expect, test } from 'vitest';
import request from 'supertest';
import { freshApp, loginAs } from './helpers.js';

let ctx: ReturnType<typeof freshApp>;
beforeEach(() => { ctx = freshApp(); });

describe('requesting a loan', () => {
  test('a borrower gets a priced request', async () => {
    const ben = await loginAs(ctx.app, 'ben@example.test');
    const res = await ben.post('/api/loans').send({ itemId: 5, start: '2030-02-01', end: '2030-02-04' }).expect(201);
    expect(res.body.status).toBe('requested');
    expect(res.body.total_cents).toBe(3 * 1200 + 5000);
  });

  test('you cannot borrow your own item', async () => {
    const ana = await loginAs(ctx.app, 'ana@example.test');
    await ana.post('/api/loans').send({ itemId: 1, start: '2030-02-01', end: '2030-02-04' }).expect(400);
  });

  test('dates must be real and in order', async () => {
    const ben = await loginAs(ctx.app, 'ben@example.test');
    await ben.post('/api/loans').send({ itemId: 5, start: '2030-02-04', end: '2030-02-01' }).expect(400);
    await ben.post('/api/loans').send({ itemId: 5, start: 'soon', end: '2030-02-01' }).expect(400);
  });

  test('an item already booked cannot be booked again for overlapping dates', async () => {
    const chloe = await loginAs(ctx.app, 'chloe@example.test');
    await chloe.post('/api/loans').send({ itemId: 1, start: '2030-01-12', end: '2030-01-15' }).expect(409);
  });

  test('a booking can start the day another one ends', async () => {
    const chloe = await loginAs(ctx.app, 'chloe@example.test');
    await chloe.post('/api/loans').send({ itemId: 1, start: '2030-01-13', end: '2030-01-15' }).expect(201);
  });

  test('you must be logged in', async () => {
    await request(ctx.app).post('/api/loans').send({ itemId: 5, start: '2030-02-01', end: '2030-02-04' }).expect(401);
  });
});

describe('the life of a loan', () => {
  async function requested() {
    const ben = await loginAs(ctx.app, 'ben@example.test');
    const res = await ben.post('/api/loans').send({ itemId: 5, start: '2030-02-01', end: '2030-02-04' }).expect(201);
    return { ben, id: res.body.id as number };
  }

  test('only the owner approves', async () => {
    const { ben, id } = await requested();
    await ben.post(`/api/loans/${id}/status`).send({ status: 'approved' }).expect(403);
    const chloe = await loginAs(ctx.app, 'chloe@example.test');
    await chloe.post(`/api/loans/${id}/status`).send({ status: 'approved' }).expect(200);
  });

  test('a loan cannot skip steps', async () => {
    const { id } = await requested();
    const chloe = await loginAs(ctx.app, 'chloe@example.test');
    await chloe.post(`/api/loans/${id}/status`).send({ status: 'returned' }).expect(409);
  });

  test('the borrower can cancel a request', async () => {
    const { ben, id } = await requested();
    await ben.post(`/api/loans/${id}/status`).send({ status: 'cancelled' }).expect(200);
  });

  test('a returned loan records when it came back', async () => {
    const { id } = await requested();
    const chloe = await loginAs(ctx.app, 'chloe@example.test');
    for (const status of ['approved', 'active', 'returned']) await chloe.post(`/api/loans/${id}/status`).send({ status }).expect(200);
    const mine = await chloe.get('/api/loans').expect(200);
    expect(mine.body.find((l: { id: number }) => l.id === id).returned_at).toBeTruthy();
  });
});

describe('cancelling', () => {
  test('the owner can cancel an approved loan, and a stranger cannot cancel anything', async () => {
    const ben = await loginAs(ctx.app, 'ben@example.test');
    const made = await ben.post('/api/loans').send({ itemId: 5, start: '2030-02-01', end: '2030-02-04' }).expect(201);
    const id = made.body.id as number;
    const chloe = await loginAs(ctx.app, 'chloe@example.test');
    await chloe.post(`/api/loans/${id}/status`).send({ status: 'approved' }).expect(200);
    const ana = await loginAs(ctx.app, 'ana@example.test');
    await ana.post(`/api/loans/${id}/status`).send({ status: 'cancelled' }).expect(403);
    await chloe.post(`/api/loans/${id}/status`).send({ status: 'cancelled' }).expect(200);
  });
});
