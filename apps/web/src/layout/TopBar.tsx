export type Theme = 'light' | 'dark' | 'system';

export function TopBar({ theme, onThemeToggle }: { theme: Theme; onThemeToggle: () => void }) {
  const icon = theme === 'light' ? '🌙' : theme === 'dark' ? '☀️' : '🖥️';
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="font-semibold text-slate-800 dark:text-slate-100">JobNavigator Local</span>
        <span className="text-xs font-mono text-slate-400">v0.1.0</span>
      </div>
      <div className="flex items-center gap-2">
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
