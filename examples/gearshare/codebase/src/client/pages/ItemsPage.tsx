import { useEffect, useState } from 'react';
import { api, money, type Item, type Quote } from '../api';

export function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Item | null>(null);

  useEffect(() => { api.items({ category, q }).then(setItems); }, [category, q]);

  return (
    <>
      <div className="filters">
        <input placeholder="Search" value={q} onChange={e => setQ(e.target.value)} />
        <select value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">All categories</option>
          <option value="tools">Tools</option>
          <option value="camping">Camping</option>
          <option value="electronics">Electronics</option>
        </select>
      </div>
      <ul className="cards">
        {items.map(item => (
          <li key={item.id} className="card">
            <h3>{item.name}</h3>
            <p className="muted">{item.category} · owned by {item.owner_name}</p>
            <p>{money(item.daily_fee_cents)} per day · {money(item.deposit_cents)} deposit</p>
            <button onClick={() => setPicked(item)}>Request</button>
          </li>
        ))}
        {items.length === 0 && <li className="muted">Nothing matches.</li>}
      </ul>
      {picked && <RequestForm item={picked} onClose={() => setPicked(null)} />}
    </>
  );
}

function RequestForm({ item, onClose }: { item: Item; onClose: () => void }) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setQuote(null);
    if (start && end && end > start) api.quote(item.id, start, end).then(setQuote).catch(() => setQuote(null));
  }, [item.id, start, end]);

  async function submit() {
    try { await api.request(item.id, start, end); setMessage('Requested. The owner will answer.'); }
    catch (e) { setMessage((e as Error).message); }
  }

  return (
    <div className="modal" role="dialog" aria-label={`Request ${item.name}`}>
      <div className="panel">
        <h3>{item.name}</h3>
        <label>From <input type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
        <label>To <input type="date" value={end} onChange={e => setEnd(e.target.value)} /></label>
        {quote && <p>{quote.days} days · fee {money(quote.feeCents)} · deposit {money(quote.depositCents)} · <strong>total {money(quote.totalCents)}</strong></p>}
        {message && <p>{message}</p>}
        <div className="row">
          <button onClick={submit} disabled={!quote}>Send request</button>
          <button className="ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
