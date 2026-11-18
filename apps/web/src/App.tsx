import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from '@/layout/Sidebar';
import { TopBar } from '@/layout/TopBar';
import { Dashboard } from '@/pages/Dashboard';
import { Jobs } from '@/pages/Jobs';
import { Searches } from '@/pages/Searches';
import { Documents } from '@/pages/Documents';
import { Settings } from '@/pages/Settings';
import { Login } from '@/pages/Login';
import { Scrape } from '@/pages/Scrape';
import {
  getCurrentUser,
  getAuthToken,
  setAuthToken,
  setCurrentUser,
  logout,
} from '@/lib/api';

export type Theme = 'light' | 'dark' | 'system';
export type Page =
  | 'dashboard'
  | 'jobs'
  | 'searches'
  | 'documents'
  | 'settings'
  | 'login'
  | 'scrape';

function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    const mq =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;
    return (mq?.matches ?? false) ? 'dark' : 'light';
  }
  return theme;
}

export function App() {
  const [theme, setTheme] = useState<Theme>('system');
  const [page, setPage] = useState<Page>('dashboard');
  const [user, setUser] = useState(() => getCurrentUser());

  useEffect(() => {
    const stored = localStorage.getItem('jn_theme') as Theme | null;
    if (stored) setTheme(stored);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const resolved = resolveTheme(theme);
    if (resolved === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);

  const cycleTheme = useCallback(() => {
    setTheme((t) => (t === 'light' ? 'dark' : t === 'dark' ? 'system' : 'light'));
  }, []);

  const handleLogin = useCallback((u: { id: string; email: string }) => {
    setUser(u);
    setPage('dashboard');
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await logout(getAuthToken() ?? undefined);
    } catch {
      /* ignore API errors on logout — clear local state regardless */
    } finally {
      setAuthToken(null);
      setCurrentUser(null);
      setUser(null);
      setPage('dashboard');
    }
  }, []);

  const requiresAuth: Page[] = ['jobs', 'searches', 'documents', 'settings', 'scrape'];

  const pages: Record<Page, React.ReactNode> = {
    dashboard: <Dashboard />,
    jobs: <Jobs />,
    searches: <Searches />,
    documents: <Documents />,
    settings: <Settings theme={theme} setTheme={setTheme} user={user} />,
    login: <Login onAuthenticated={handleLogin} />,
    scrape: <Scrape />,
  };

  const content = requiresAuth.includes(page) && !user ? (
    <div className="layer-panel p-6 max-w-md mx-auto">
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">
        Sign in required
      </h2>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
        You need to be signed in to use this page.
      </p>
      <button
        onClick={() => setPage('login')}
        className="py-2 px-4 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
      >
        Sign in
      </button>
    </div>
  ) : (
    pages[page]
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar currentPage={page} onSelect={setPage} user={user} onLogout={handleLogout} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar
          theme={theme}
          onThemeToggle={cycleTheme}
          user={user}
          onLogin={() => setPage('login')}
          onLogout={handleLogout}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{content}</main>
      </div>
    </div>
  );
}

export default App;
