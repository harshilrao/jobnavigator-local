export type Theme = 'light' | 'dark' | 'system';

export interface User {
  id: string;
  email: string;
}

export function TopBar({
  theme,
  onThemeToggle,
  user,
  onLogin,
  onLogout,
}: {
  theme: Theme;
  onThemeToggle: () => void;
  user: User | null;
  onLogin: () => void;
  onLogout: () => void;
}) {
  const icon = theme === 'light' ? '🌙' : theme === 'dark' ? '☀️' : '🖥️';
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="font-semibold text-slate-800 dark:text-slate-100">JobNavigator Local</span>
        <span className="text-xs font-mono text-slate-400">v0.1.0</span>
      </div>
      <div className="flex items-center gap-2">
        {user ? (
          <>
            <span className="hidden sm:block text-xs text-slate-500 dark:text-slate-400">
              {user.email}
            </span>
            <button
              onClick={onLogout}
              className="p-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
              title="Log out"
              aria-label="Log out"
            >
              🚪
            </button>
          </>
        ) : (
          <button
            onClick={onLogin}
            className="p-2 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
            title="Sign in"
            aria-label="Sign in"
          >
            🔑
          </button>
        )}
        <button
          onClick={onThemeToggle}
          className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          title="Toggle theme"
          aria-label="Toggle appearance"
        >
          {icon}
        </button>
      </div>
    </header>
  );
}
