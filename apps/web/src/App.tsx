import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from '@/layout/Sidebar';
import { TopBar } from '@/layout/TopBar';
import { Dashboard } from '@/pages/Dashboard';
import { Jobs } from '@/pages/Jobs';
import { Searches } from '@/pages/Searches';
import { Documents } from '@/pages/Documents';
import { Settings } from '@/pages/Settings';

export type Theme = 'light' | 'dark' | 'system';
export type Page = 'dashboard' | 'jobs' | 'searches' | 'documents' | 'settings';

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

  const pages: Record<Page, React.ReactNode> = {
    dashboard: <Dashboard />,
    jobs: <Jobs />,
    searches: <Searches />,
    documents: <Documents />,
    settings: <Settings theme={theme} setTheme={setTheme} />,
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar currentPage={page} onSelect={setPage} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar theme={theme} onThemeToggle={cycleTheme} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {pages[page]}
        </main>
      </div>
    </div>
  );
}

export default App;
