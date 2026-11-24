import { useEffect, useState } from 'react';
import { api, type User } from '../api';

export function LoginPage({ onLogin }: { onLogin: (u: User) => void }) {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { api.users().then(setUsers).catch(e => setError(e.message)); }, []);

  return (
    <div className="login">
      <h1>GearShare</h1>
      <p className="muted">Borrow tools, camping gear and electronics from people nearby. Pick a demo user.</p>
      {error && <p className="error">{error}</p>}
      {users.map(u => (
        <button key={u.id} className="user" onClick={() => api.login(u.email).then(onLogin).catch(e => setError(e.message))}>
          {u.name} <span className="muted">{u.email}</span>
        </button>
      ))}
    </div>
  );
}
