import { useState, type FormEvent } from 'react';
import { ApiError } from '../lib/api';

interface Props {
  mode: 'login' | 'register';
  onSubmit: (data: { email: string; name?: string; password: string }) => Promise<void>;
}

export function AuthForm({ mode, onSubmit }: Props) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSubmit({ email, name, password });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handle} className="card">
      <h2>{mode === 'login' ? 'Log in' : 'Create account'}</h2>
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      </label>
      {mode === 'register' && (
        <label>
          Name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
        </label>
      )}
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={mode === 'register' ? 8 : undefined}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        />
      </label>
      {error && <p className="err">{error}</p>}
      <button type="submit" disabled={busy}>
        {busy ? '…' : mode === 'login' ? 'Log in' : 'Create account'}
      </button>
    </form>
  );
}
