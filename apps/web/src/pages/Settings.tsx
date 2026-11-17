import { useState, useEffect } from 'react';
import { getAdapters, type AdapterDescriptor } from '@/lib/api';

export interface User {
  id: string;
  email: string;
}

const SOURCE_LABELS: Record<string, string> = {
  greenhouse: 'Greenhouse (board ID)',
  lever: 'Lever (company ID)',
  ashby: 'Ashby (job board ID)',
  smartrecruiters: 'SmartRecruiters (company ID)',
  other: 'Other',
};

export function Settings({
  theme,
  setTheme,
  user,
}: {
  theme: 'light' | 'dark' | 'system';
  setTheme: (t: 'light' | 'dark' | 'system') => void;
  user: User | null;
}) {
  const [adapters, setAdapters] = useState<AdapterDescriptor[]>([]);
  const [identifiers, setIdentifiers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // Load persisted identifiers from localStorage.
    const stored: Record<string, string> = {};
    if (typeof localStorage !== 'undefined') {
      for (const key of Object.keys(localStorage)) {
        const match = key.match(/^jn_scrape_(.+)$/);
        if (match) stored[match[1]] = localStorage.getItem(key) ?? '';
      }
    }
    setIdentifiers(stored);
    getAdapters().then((data) => setAdapters(data.adapters)).catch(() => {
      /* adapters load failure is non-fatal for configuration */
    });
  }, []);

  const SOURCE_IDS: string[] = ['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'other'];

  const saveIdentifier = async (sourceId: string, value: string) => {
    setSaving((prev) => ({ ...prev, [sourceId]: true }));
    setMessage(null);
    try {
      const trimmed = value.trim();
      if (typeof localStorage !== 'undefined') {
        if (trimmed) localStorage.setItem(`jn_scrape_${sourceId}`, trimmed);
        else localStorage.removeItem(`jn_scrape_${sourceId}`);
      }
      setIdentifiers((prev) => ({ ...prev, [sourceId]: trimmed }));
      setMessage(`Saved ${SOURCE_LABELS[sourceId] ?? sourceId} configuration.`);
    } finally {
      setSaving((prev) => {
        const next = { ...prev };
        delete next[sourceId];
        return next;
      });
    }
  };

  if (!user) {
    return (
      <div className="layer-panel p-6 max-w-md mx-auto">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">Settings</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Sign in to configure scrape sources.</p>
        <button
          onClick={() => {
            // App handles navigation via TopBar login button; keep this as a hint.
          }}
          className="py-2 px-4 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
        >
          Sign in from the top bar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Settings</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Signed in as <span className="font-mono">{user.email}</span>.
        </p>
      </div>

      {/* Appearance */}
      <div className="layer-panel p-4">
        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-3">Appearance</h3>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Theme</label>
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
      </div>

      {/* AI provider (info only) */}
      <div className="layer-panel p-4">
        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-3">AI provider</h3>
        <div className="space-y-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Default AI provider: <span className="font-mono text-slate-700 dark:text-slate-200">Ollama (qwen2.5:3b)</span>
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Free Claude Code proxy: <span className="font-mono text-amber-500">disabled by default</span>
          </p>
        </div>
      </div>

      {/* Scrape source configuration */}
      <div className="layer-panel p-4">
        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-3">
          Scrape sources (Phase 4)
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Enter the employer-specific identifier for each ATS board you want to scrape (e.g. a Greenhouse
          board ID or Lever company ID). These are used when you start a scrape session. Configure at least
          one source before starting a scrape.
        </p>
        {adapters.length === 0 ? (
          <div className="text-sm text-slate-500">Loading sources…</div>
        ) : (
          <div className="space-y-3">
            {SOURCE_IDS.map((sourceId) => {
              const adapter = adapters.find((a) => a.sourceId === sourceId);
              const configured = !!identifiers[sourceId];
              return (
                <div
                  key={sourceId}
                  className="rounded border p-3 flex items-center justify-between bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                >
                  <div>
                    <div className="text-xs font-medium text-slate-700 dark:text-slate-200">
                      {SOURCE_LABELS[sourceId] ?? sourceId}
                    </div>
                    {adapter && (
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {adapter.supportsQuery ? 'query search · ' : ''}
                        {adapter.supportsCompany ? 'company filter · ' : ''}
                        {adapter.supportsLocation ? 'location filter · ' : ''}
                        cap {adapter.sourcePolicies.concurrency}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={identifiers[sourceId] ?? ''}
                      onChange={(e) => saveIdentifier(sourceId, e.target.value)}
                      placeholder="board / company ID"
                      disabled={saving[sourceId]}
                      className="w-48 rounded border border-slate-300 dark:border-slate-600 px-2.5 py-1.5 text-sm bg-white dark:bg-slate-800 disabled:bg-slate-200 dark:disabled:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed"
                    />
                    {configured && (
                      <span className="text-[10px] rounded px-1.5 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400 border border-green-200 dark:border-green-900/40">
                        configured
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {message && (
          <div className="p-2 rounded text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/30">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
