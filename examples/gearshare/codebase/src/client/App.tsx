import { useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { api, type User } from './api';
import { LoginPage } from './pages/LoginPage';
import { ItemsPage } from './pages/ItemsPage';
import { LoansPage } from './pages/LoansPage';

export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => { api.me().then(setUser).catch(() => setUser(null)); }, []);

  if (user === undefined) return <p className="muted pad">Loading...</p>;
  if (!user) return <LoginPage onLogin={setUser} />;

  return (
    <div className="shell">
      <header className="bar">
        <strong>GearShare</strong>
        <nav>
          <NavLink to="/" end>Browse</NavLink>
          <NavLink to="/loans">My loans</NavLink>
        </nav>
        <span className="muted">{user.name}</span>
        <button onClick={async () => { await api.logout(); setUser(null); }}>Log out</button>
      </header>
      <main className="pad">
        <Routes>
          <Route path="/" element={<ItemsPage />} />
          <Route path="/loans" element={<LoansPage me={user} />} />
        </Routes>
      </main>
    </div>
  );
}
