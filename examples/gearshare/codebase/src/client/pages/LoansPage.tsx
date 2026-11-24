import { useEffect, useState } from 'react';
import { api, money, type Loan, type User } from '../api';

const ACTIONS: Record<string, { lending: string[]; borrowing: string[] }> = {
  requested: { lending: ['approved', 'declined'], borrowing: ['cancelled'] },
  approved: { lending: ['active', 'cancelled'], borrowing: ['cancelled'] },
  active: { lending: ['returned'], borrowing: [] },
};

export function LoansPage({ me }: { me: User }) {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [error, setError] = useState('');
  const load = () => api.loans().then(setLoans).catch(e => setError(e.message));
  useEffect(() => { load(); }, [me.id]);

  async function act(id: number, status: string) {
    setError('');
    try { await api.setStatus(id, status); await load(); } catch (e) { setError((e as Error).message); }
  }

  return (
    <>
      {error && <p className="error">{error}</p>}
      <table className="table">
        <thead><tr><th>Item</th><th>Dates</th><th>Total</th><th>Status</th><th /></tr></thead>
        <tbody>
          {loans.map(l => (
            <tr key={l.id}>
              <td>{l.item_name} <span className="muted">({l.side})</span></td>
              <td>{l.start_date} to {l.end_date}</td>
              <td>{money(l.total_cents)}</td>
              <td>{l.status}</td>
              <td>{(ACTIONS[l.status]?.[l.side] ?? []).map(s => <button key={s} onClick={() => act(l.id, s)}>{s}</button>)}</td>
            </tr>
          ))}
          {loans.length === 0 && <tr><td colSpan={5} className="muted">No loans yet.</td></tr>}
        </tbody>
      </table>
    </>
  );
}
