import { useEffect, useState } from 'react';
import { HashRouter, Link, Route, Routes } from 'react-router-dom';
import { adminApi } from './api';
import { ImportPage } from './ImportPage';
import { SetListPage } from './SetListPage';
import { SetPage } from './SetPage';
import { UsagePage } from './UsagePage';

type Auth = { state: 'checking' } | { state: 'out' } | { state: 'in'; username: string };

export default function AdminApp() {
  const [auth, setAuth] = useState<Auth>({ state: 'checking' });

  useEffect(() => {
    document.title = 'EUSKALDUO — Admin';
    adminApi
      .session()
      .then((s) => setAuth(s.authenticated ? { state: 'in', username: s.username ?? '' } : { state: 'out' }))
      .catch(() => setAuth({ state: 'out' }));
  }, []);

  if (auth.state === 'checking') return <p className="center-note">Loading…</p>;
  if (auth.state === 'out') return <LoginForm onLogin={(username) => setAuth({ state: 'in', username })} />;

  return (
    <HashRouter>
      <div className="admin">
        <header className="app-header admin-header">
          <Link to="/" className="logo">
            <span className="logo-mark" aria-hidden="true">E</span>
            <span className="logo-text">EUSKALDUO admin</span>
          </Link>
          <nav className="app-nav" aria-label="Admin">
            <Link to="/">Homework sets</Link>
            <Link to="/import">Import</Link>
            <Link to="/uso">Usage</Link>
            <a href="/" target="_blank" rel="noopener">
              Learner view ↗
            </a>
            <button
              className="btn btn-small"
              onClick={async () => {
                await adminApi.logout().catch(() => undefined);
                setAuth({ state: 'out' });
              }}
            >
              Log out {auth.username}
            </button>
          </nav>
        </header>
        <main className="app-main admin-main">
          <Routes>
            <Route path="/" element={<SetListPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/sets/:id" element={<SetPage />} />
            <Route path="/uso" element={<UsagePage />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}

function LoginForm({ onLogin }: { onLogin: (username: string) => void }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <main className="app-main">
      <form
        className="card login"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            const state = await adminApi.login(username, password);
            if (state.authenticated) onLogin(state.username ?? username);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
            setPassword('');
          }
        }}
      >
        <h1>EUSKALDUO admin</h1>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && (
          <p className="issue issue-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          Log in
        </button>
        <p className="muted">
          Learners don’t need an account. <a href="/">Go to the learner app</a>.
        </p>
      </form>
    </main>
  );
}
