/** Days are whole calendar days. A loan from the 10th to the 13th is 3 days. */
export function daysBetween(start: string, end: string): number {
  const ms = Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z');
  return Math.round(ms / 86_400_000);
}

/** Whether two date ranges, given as YYYY-MM-DD, share any time. */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export interface Quote {
  days: number;
  feeCents: number;
  depositCents: number;
  totalCents: number;
}

/** The longer a loan runs, the less each day costs. The fee is the daily fee times the days, after the discount. */
export function quote(dailyFeeCents: number, depositCents: number, start: string, end: string): Quote {
  const days = daysBetween(start, end);
  const discount = days >= 14 ? 0.2 : days > 7 ? 0.1 : 0;
  const feeCents = Math.round(dailyFeeCents * days * (1 - discount));
  return { days, feeCents, depositCents, totalCents: feeCents + depositCents };
}

export function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}
