import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from '@/layout/Sidebar';
import { TopBar } from '@/layout/TopBar';
import { Dashboard } from '@/pages/Dashboard';
import { Jobs } from '@/pages/Jobs';
import { Searches } from '@/pages/Searches';
import { Documents } from '@/pages/Documents';
import { Settings } from '@/pages/Settings';
import { Login } from '@/pages/Login';
import { Scrape } from '@/pages/Scrape';
import { ResumeTailorPage } from '@/pages/ResumeTailor';
import { CoverLetterPage } from '@/pages/CoverLetter';
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

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = getCurrentUser();
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

export function App() {
  const [theme, setTheme] = useState<Theme>('system');
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

  const handleLogin = useCallback(() => {
    setUser(getCurrentUser()!);
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
    }
  }, []);

  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden">
        <Sidebar user={user} onLogout={handleLogout} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar
            theme={theme}
            onThemeToggle={cycleTheme}
            user={user}
          />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/jobs"
                element={
                  <ProtectedRoute>
                    <Jobs />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/jobs/:jobId/tailor"
                element={
                  <ProtectedRoute>
                    <ResumeTailorPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/jobs/:jobId/cover-letter"
                element={
                  <ProtectedRoute>
                    <CoverLetterPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/searches"
                element={
                  <ProtectedRoute>
                    <Searches />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/documents"
                element={
                  <ProtectedRoute>
                    <Documents />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <Settings theme={theme} setTheme={setTheme} user={user} />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/scrape"
                element={
                  <ProtectedRoute>
                    <Scrape />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;