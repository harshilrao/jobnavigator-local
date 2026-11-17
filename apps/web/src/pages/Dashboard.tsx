import { useState, useEffect } from 'react';
import { getHealth, getDemo, type HealthResponse, type DemoResponse } from '@/lib/api';

type AsyncState<T> = { loaded: boolean; error?: string; data?: T };

export function Dashboard() {
  const [health, setHealth] = useState<AsyncState<HealthResponse>>({ loaded: false });
  const [demo, setDemo] = useState<AsyncState<DemoResponse>>({ loaded: false });

  const fetchHealth = async () => {
    try {
      const d = await getHealth();
      setHealth({ loaded: true, data: d });
    } catch (e) {
      setHealth({ loaded: true, error: e instanceof Error ? e.message : String(e) });
    }
  };

  const fetchDemo = async () => {
    try {
      const d = await getDemo();
      setDemo({ loaded: true, data: d });
    } catch (e) {
      setDemo({ loaded: true, error: e instanceof Error ? e.message : String(e) });
    }
  };

  useEffect(() => { fetchHealth(); }, []);
  useEffect(() => { fetchDemo(); }, []);

  const card = (title: string, s: AsyncState<any>) => (
    <div className="layer-panel p-4">
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">{title}</h2>
      {s.error ? (
        <div className="text-sm text-red-600 dark:text-red-400">Error: {s.error}</div>
      ) : !s.loaded ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : (
        <pre className="text-xs text-slate-500 dark:text-slate-400 mt-2 break-all">{JSON.stringify(s.data, null, 2)}</pre>
      )}
    </div>
  );

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <div className="col-span-full">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Dashboard</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">
          Welcome to JobNavigator Local. API and frontend are wired together — data loads from <code className="font-mono text-xs">/api/health</code> and <code className="font-mono text-xs">/api/demo</code>.
        </p>
      </div>
      {card('API /api/health', health)}
      {card('API /api/demo', demo)}
      <div className="layer-panel p-4 col-span-full">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">How to inspect</h2>
        <ul className="text-sm text-slate-600 dark:text-slate-400 list-disc pl-5 space-y-1">
          <li>API: <code className="font-mono text-xs">http://localhost:3000/api/health</code></li>
          <li>Demo: <code className="font-mono text-xs">http://localhost:3000/api/demo</code> (development only)</li>
          <li>Web: <code className="font-mono text-xs">http://localhost:5173</code> (proxies <code className="font-mono text-xs">/api</code> to the API)</li>
        </ul>
      </div>
    </div>
  );
}
