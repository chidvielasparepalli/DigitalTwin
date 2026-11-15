import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { AuthForm } from '../components/AuthForm';

export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  if (user) return <Navigate to="/" replace />;
  return (
    <div className="auth-page">
      <AuthForm mode="login" onSubmit={async ({ email, password }) => { await login(email, password); navigate('/'); }} />
      <p className="muted">
        No account? <Link to="/register">Create one</Link>
      </p>
      <p className="muted small">Demo: demo@digitaltwin.dev / demo1234</p>
    </div>
  );
}

export function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  if (user) return <Navigate to="/" replace />;
  return (
    <div className="auth-page">
      <AuthForm mode="register" onSubmit={async ({ email, name, password }) => { await register(email, name!, password); navigate('/'); }} />
      <p className="muted">
        Have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
