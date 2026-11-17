export function Settings({ theme, setTheme }: { theme: 'light' | 'dark' | 'system'; setTheme: (t: 'light' | 'dark' | 'system') => void }) {
  return (
    <div className="layer-panel p-6 max-w-md">
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">Settings</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Appearance</label>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')}
            className="w-full rounded border px-2 py-1.5 text-sm bg-white dark:bg-slate-800 dark:border-slate-600"
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Default AI provider: <span className="font-mono text-slate-700 dark:text-slate-200">Ollama (qwen2.5:3b)</span>
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Free Claude Code proxy: <span className="font-mono text-amber-500">disabled by default</span>
          </p>
        </div>
      </div>
    </div>
  );
}
