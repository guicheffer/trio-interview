export interface User { id: number; name: string; email: string; role: string }
export interface Item { id: number; name: string; category: string; daily_fee_cents: number; deposit_cents: number; owner_name: string }
export interface Loan { id: number; item_id: number; item_name: string; start_date: string; end_date: string; status: string; total_cents: number; side: 'borrowing' | 'lending'; returned_at: string | null }
export interface Quote { days: number; feeCents: number; depositCents: number; totalCents: number }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  users: () => call<User[]>('/api/session/users'),
  me: () => call<User>('/api/session/me'),
  login: (email: string) => call<User>('/api/session/login', { method: 'POST', body: JSON.stringify({ email }) }),
  logout: () => call<{ ok: boolean }>('/api/session/logout', { method: 'POST' }),
  items: (params: { category?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (params.category) qs.set('category', params.category);
    if (params.q) qs.set('q', params.q);
    return call<Item[]>(`/api/items?${qs}`);
  },
  quote: (id: number, start: string, end: string) => call<Quote>(`/api/items/${id}/quote?start=${start}&end=${end}`),
  loans: () => call<Loan[]>('/api/loans'),
  request: (itemId: number, start: string, end: string) => call<Loan>('/api/loans', { method: 'POST', body: JSON.stringify({ itemId, start, end }) }),
  setStatus: (id: number, status: string) => call<Loan>(`/api/loans/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
};

export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
