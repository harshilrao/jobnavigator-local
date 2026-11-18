import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  login,
  register,
  setAuthToken,
  setCurrentUser,
  type Credentials,
} from '@/lib/api';

type Mode = 'login' | 'register';

export function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSending(true);
    const creds: Credentials = { email, password };
    try {
      const res = mode === 'login' ? await login(creds) : await register(creds);
      setAuthToken(res.accessToken);
      setCurrentUser({ id: res.user.id, email: res.user.email });
      navigate('/');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : mode === 'login' ? 'Login failed' : 'Registration failed',
      );
    } finally {
      setSending(false);
    }
  };

  const isLogin = mode === 'login';
  return (
    <div className="layer-panel p-6 max-w-md mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {isLogin ? 'Sign in' : 'Create account'}
        </h2>
        <button
          onClick={() => setMode(isLogin ? 'register' : 'login')}
          className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          {isLogin ? 'Create an account' : 'Already have an account? Sign in'}
        </button>
      </div>

      {error && (
        <div className="mb-3 p-2 rounded text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            Password
          </label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            {isLogin ? 'Your account password' : 'Must be at least 8 characters'}
          </p>
        </div>
        <button
          type="submit"
          disabled={sending}
          className="w-full py-2 rounded-lg bg-indigo-600 disabled:bg-indigo-300 text-white text-sm font-semibold hover:bg-indigo-700 disabled:cursor-not-allowed transition"
        >
          {sending ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <div className="mt-4 text-xs text-slate-500 dark:text-slate-400 text-center">
        Jobs, scrape sessions, and settings require a signed-in account.
      </div>
    </div>
  );
}