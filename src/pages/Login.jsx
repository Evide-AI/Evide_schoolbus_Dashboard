import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import './Login.css';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const err = await signIn(email.trim(), password);
    if (err) {
      setError(err.message === 'Invalid login credentials'
        ? 'Email or password is incorrect.'
        : err.message);
      setSubmitting(false);
    }
    // On success, AuthContext flips session and the router shows the dashboard.
  }

  return (
    <div className="login-shell">
      <div className="login-brand">
        <div className="login-brand-inner">
          <img src="/evide-logo.png" alt="Evide School Bus" className="login-logo" />
          <p className="login-brand-sub">
            Live bus tracking, student rosters, and parent alerts — managed from one place.
          </p>
        </div>
        <div className="login-brand-foot">Management console</div>
      </div>

      <div className="login-form-side">
        <form className="login-form" onSubmit={handleSubmit}>
          <h2>Sign in</h2>
          <p className="muted login-form-hint">Use the management account issued to your school.</p>

          {error && <div className="login-error">{error}</div>}

          <div className="login-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@school.edu"
              required
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button className="btn btn-primary login-submit" type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
