import { describe, expect, test } from 'vitest';
import { daysBetween, quote, rangesOverlap, validDate } from '../pricing.js';

describe('pricing', () => {
  test('counts whole days between two dates', () => {
    expect(daysBetween('2030-01-10', '2030-01-13')).toBe(3);
    expect(daysBetween('2030-02-27', '2030-03-02')).toBe(3);
    expect(daysBetween('2030-03-30', '2030-04-01')).toBe(2);
  });

  test('ranges that only touch do not overlap', () => {
    expect(rangesOverlap('2030-01-10', '2030-01-13', '2030-01-13', '2030-01-15')).toBe(false);
    expect(rangesOverlap('2030-01-10', '2030-01-13', '2030-01-12', '2030-01-15')).toBe(true);
    expect(rangesOverlap('2030-01-10', '2030-01-20', '2030-01-12', '2030-01-14')).toBe(true);
  });

  test('the price drops for longer loans', () => {
    expect(quote(1000, 2000, '2030-01-01', '2030-01-04')).toEqual({ days: 3, feeCents: 3000, depositCents: 2000, totalCents: 5000 });
    expect(quote(1000, 0, '2030-01-01', '2030-01-08').feeCents).toBe(6300);
    expect(quote(1000, 0, '2030-01-01', '2030-01-15').feeCents).toBe(11200);
  });

  test('only real dates are accepted', () => {
    expect(validDate('2030-01-31')).toBe(true);
    expect(validDate('2030-13-45')).toBe(false);
    expect(validDate('tomorrow')).toBe(false);
    expect(validDate(20300131)).toBe(false);
  });
});
