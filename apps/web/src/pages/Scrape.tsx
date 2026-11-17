import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getAdapters,
  createScrapeSession,
  cancelScrapeSession,
  listScrapeSessions,
  getScrapeSession,
  getAuthToken,
  scrapeEventStream,
  type AdapterDescriptor,
  type ScrapeSession,
  type ScrapeSessionStatus,
  type ScrapeEvent,
  type StreamController,
} from '@/lib/api';

const POLL_INTERVAL_MS = 3000;

const SOURCE_LABELS: Record<string, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  smartrecruiters: 'SmartRecruiters',
  other: 'Other (URL)',
};

const TYPE_ICONS: Record<string, string> = {
  started: '🟢',
  source_started: '📡',
  job_discovered: '🔎',
  job_saved: '✅',
  job_skipped: '⏭️',
  progress: '⏳',
  error: '❌',
  cancelled: '🛑',
  complete: '🏁',
};

export function Scrape() {
  const [adapters, setAdapters] = useState<AdapterDescriptor[]>([]);
  const [adaptersError, setAdaptersError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ScrapeSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<ScrapeSession | null>(null);
  const [events, setEvents] = useState<ScrapeEvent[]>([]);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Start-scrape form state.
  const [query, setQuery] = useState('');
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [locations, setLocations] = useState('');

  const streamRef = useRef<StreamController | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearStream = useCallback(() => {
    streamRef.current?.close();
    streamRef.current = null;
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const loadAdapters = async () => {
    try {
      const data = await getAdapters();
      setAdapters(data.adapters);
      setAdaptersError(null);
    } catch (err) {
      setAdaptersError(
        err instanceof Error ? err.message : 'Failed to load available sources.',
      );
    }
  };

  const loadSessions = async () => {
    try {
      const data = await listScrapeSessions();
      setSessions(data.sessions);
    } catch {
      /* list failures are non-fatal */
    }
  };

  useEffect(() => {
    loadAdapters();
    loadSessions();
    return () => {
      clearStream();
    };
  }, [clearStream]);

  // Refresh the recent-session list periodically so statuses stay current.
  useEffect(() => {
    const id = setInterval(loadSessions, 5000);
    return () => clearInterval(id);
  }, []);

  const startScrape = async () => {
    setStreamError(null);
    setEvents([]);
    setCreating(true);
    try {
      const sources = [...selectedSources];
      if (sources.length === 0) {
        setStreamError('Select at least one source.');
        setCreating(false);
        return;
      }

      const created = await createScrapeSession({
        filter: {
          q: query || undefined,
          page: 1,
          limit: 20,
          sort: 'createdAt',
          order: 'desc',
          locations: locations.split(',').map((s) => s.trim()).filter(Boolean),
        },
        sources,
        locations: locations.split(',').map((s) => s.trim()).filter(Boolean),
      });

      setActiveSessionId(created.id);
      setActiveSession({
        ...created,
        status: 'queued' as ScrapeSessionStatus,
        locations: [],
        counts: [],
        totalFetched: 0,
        totalSaved: 0,
        totalSkipped: 0,
        totalFailed: 0,
        cancelRequested: false,
        startedAt: created.createdAt,
        completedAt: undefined,
        updatedAt: created.createdAt,
      } as unknown as ScrapeSession);

      // Build configured sources from adapter settings so adapters use real IDs.
      const userConfiguredSources: Record<string, { identifier: string; baseUrl?: string }> = {};
      for (const src of sources) {
        const adapter = adapters.find((a) => a.sourceId === src);
        if (adapter && adapter.configured) {
          const identifier = localStorage.getItem(`jn_scrape_${src}`);
          if (identifier) {
            userConfiguredSources[src] = { identifier };
          }
        }
      }

      // Start the session running (backend runs the loop in the background).
      const token = getAuthToken();
      await fetch(`/api/scrape/sessions/${encodeURIComponent(created.id)}/run`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sources: userConfiguredSources }),
      });
      // A 400/409 here just means the session is already running — that's fine.

      openStream(created.id);
      loadSessions();
    } catch (err) {
      setStreamError(err instanceof Error ? err.message : 'Failed to start scrape session.');
    } finally {
      setCreating(false);
    }
  };

  const openStream = (sessionId: string) => {
    clearStream();
    const ctrl = scrapeEventStream(
      sessionId,
      (event) => {
        setEvents((prev) => [...prev.slice(-99), event]);
        if (event.counts) {
          setActiveSession((s) =>
            s ? { ...s, counts: event.counts as ScrapeSession['counts'] } : s,
          );
        }
      },
      (err) => {
        setStreamError(err instanceof Error ? err.message : 'SSE stream error.');
      },
    );
    streamRef.current = ctrl;

    // Poll session status so we reflect completion even if SSE drops.
    pollRef.current = setInterval(async () => {
      try {
        const s = await getScrapeSession(sessionId);
        setActiveSession(s);
        if (s && (s.status === 'completed' || s.status === 'cancelled' || s.status === 'failed')) {
          clearStream();
        }
      } catch {
        /* ignore poll errors */
      }
    }, POLL_INTERVAL_MS);
  };

  const handleCancel = async () => {
    if (!activeSessionId) return;
    try {
      await cancelScrapeSession(activeSessionId);
      const s = await getScrapeSession(activeSessionId);
      setActiveSession(s);
      setStreamError(null);
      clearStream();
      loadSessions();
    } catch (err) {
      setStreamError(err instanceof Error ? err.message : 'Failed to cancel session.');
    }
  };

  const toggleSource = (sourceId: string) => {
    setSelectedSources((prev) =>
      prev.includes(sourceId) ? prev.filter((s) => s !== sourceId) : [...prev, sourceId],
    );
  };

  const statusColor = (status?: string) => {
    switch (status) {
      case 'running': return 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300';
      case 'queued': return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
      case 'completed': return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
      case 'cancelled': return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300';
      case 'failed': return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
      default: return 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400';
    }
  };

  const terminal = activeSession
    ? activeSession.status === 'completed' ||
      activeSession.status === 'cancelled' ||
      activeSession.status === 'failed'
    : false;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Scrape sessions</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Start a scraping session against ATS boards. Saved jobs appear in the Jobs table as they are
          discovered, without reloading the page.
        </p>
      </div>

      {/* Available sources */}
      <div className="layer-panel p-4">
        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-3">Available sources</h3>
        {adaptersError ? (
          <div className="text-sm text-red-600 dark:text-red-400">{adaptersError}</div>
        ) : adapters.length === 0 ? (
          <div className="text-sm text-slate-500">Loading sources…</div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {adapters.map((a) => (
              <div
                key={a.sourceId}
                className="rounded border p-2 text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
              >
                <div className="flex justify-between mb-1">
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {SOURCE_LABELS[a.sourceId] ?? a.sourceId}
                  </span>
                  <span className="text-[10px] rounded px-1.5 py-0.5 border {a.configured ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-900/40' : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'}">
                    {a.configured ? 'configured' : 'not configured'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 space-y-0.5">
                  {a.supportsQuery && <div>• query search</div>}
                  {a.supportsCompany && <div>• company filter</div>}
                  {a.supportsLocation && <div>• location filter</div>}
                  <div>cap {a.sourcePolicies.concurrency} / {a.sourcePolicies.rateLimitMs}ms</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Start a new scrape */}
      <div className="layer-panel p-4">
        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-3">Start a new scrape</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Search query</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. software engineer"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Locations</label>
            <input
              value={locations}
              onChange={(e) => setLocations(e.target.value)}
              className="w-full rounded border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. New York, Remote"
            />
          </div>
          <div className="col-span-full sm:col-span-auto lg:col-span-auto">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Sources</label>
            <div className="flex flex-wrap gap-2">
              {adapters.map((a) => (
                <label key={a.sourceId} className="flex items-center gap-2 cursor-pointer select-none text-xs">
                  <input
                    type="checkbox"
                    checked={selectedSources.includes(a.sourceId)}
                    onChange={() => toggleSource(a.sourceId)}
                    className="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                  />
                  {SOURCE_LABELS[a.sourceId] ?? a.sourceId}
                </label>
              ))}
            </div>
          </div>
          <button
            onClick={startScrape}
            disabled={creating || adapters.length === 0}
            className="w-full py-2 rounded-lg bg-indigo-600 disabled:bg-indigo-300 text-white text-sm font-semibold hover:bg-indigo-700 disabled:cursor-not-allowed transition"
          >
            {creating ? 'Starting…' : 'Start scrape'}
          </button>
        </div>
      </div>

      {/* Stream error */}
      {streamError && (
        <div className="p-3 rounded text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30">
          {streamError}
        </div>
      )}

      {/* Active session */}
      {activeSessionId && activeSession && (
        <div className="layer-panel p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Active session</h3>
              <div className="text-sm font-mono text-slate-700 dark:text-slate-200 truncate max-w-[200px]">
                {activeSessionId}
              </div>
            </div>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${statusColor(activeSession.status)}`}>
              {activeSession.status}
            </span>
          </div>

          <div className="grid gap-2 sm:grid-cols-4 mb-3">
            <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/50">
              <div className="text-[10px] text-slate-500 dark:text-slate-400">Fetched</div>
              <div className="text-sm font-mono font-semibold">{activeSession.totalFetched}</div>
            </div>
            <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/50">
              <div className="text-[10px] text-slate-500 dark:text-slate-400">Saved</div>
              <div className="text-sm font-mono font-semibold text-green-700 dark:text-green-400">
                {activeSession.totalSaved}
              </div>
            </div>
            <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/50">
              <div className="text-[10px] text-slate-500 dark:text-slate-400">Skipped</div>
              <div className="text-sm font-mono font-semibold">{activeSession.totalSkipped}</div>
            </div>
            <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/50">
              <div className="text-[10px] text-slate-500 dark:text-slate-400">Failed</div>
              <div className="text-sm font-mono font-semibold text-red-700 dark:text-red-400">
                {activeSession.totalFailed}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 mb-3">
            {(!terminal || activeSession.status === 'running') && (
              <button
                onClick={handleCancel}
                disabled={terminal}
                className="px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Cancel
              </button>
            )}
            {!terminal && activeSession.status !== 'running' && activeSession.status !== 'queued' && (
              <button
                onClick={() => openStream(activeSessionId)}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition"
              >
                Reconnect stream
              </button>
            )}
          </div>

          {activeSession.errorMessage && (
            <div className="p-2 rounded text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 mb-3">
              {activeSession.errorMessage}
            </div>
          )}

          <div className="max-h-64 overflow-y-auto border rounded p-2 text-xs bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700">
            {events.length === 0 ? (
              <div className="text-slate-500 dark:text-slate-500">Waiting for events…</div>
            ) : (
              <div className="space-y-2">
                {events.map((ev, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="shrink-0">{TYPE_ICONS[ev.type] ?? '•'}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-semibold capitalize text-slate-400">{ev.type}</span>
                        {ev.source && (
                          <span className="text-[10px] text-indigo-600 dark:text-indigo-400">[{ev.source}]</span>
                        )}
                        <span className="text-[10px] text-slate-400">
                          {new Date(ev.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-sm text-slate-700 dark:text-slate-200 leading-snug">
                        {ev.message}
                        {ev.jobTitle && <span className="ml-2 font-mono text-slate-500 dark:text-slate-400">— {ev.jobTitle}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {terminal && (
            <div className="mt-3 p-3 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 text-sm">
              Session {activeSession.status}. {activeSession.totalSaved} job(s) saved — open the Jobs page to view them.
            </div>
          )}
        </div>
      )}

      {/* Recent sessions */}
      <div className="layer-panel p-4">
        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-3">Recent sessions</h3>
        {sessions.length === 0 ? (
          <div className="text-sm text-slate-500">No sessions yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left pb-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400">ID</th>
                  <th className="text-left pb-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400">Sources</th>
                  <th className="text-left pb-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400">Status</th>
                  <th className="text-right pb-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400">Saved</th>
                  <th className="text-right pb-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400">Fetched</th>
                  <th className="text-right pb-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400">Failed</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="py-2 font-mono text-[11px] text-slate-600 dark:text-slate-400 truncate max-w-[140px]">
                      {s.id}
                    </td>
                    <td className="py-2 text-[11px] text-slate-600 dark:text-slate-400">{s.sources.join(', ')}</td>
                    <td className="py-2">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusColor(s.status)}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="py-2 text-right text-[11px] font-mono text-slate-700 dark:text-slate-200">{s.totalSaved}</td>
                    <td className="py-2 text-right text-[11px] font-mono text-slate-700 dark:text-slate-200">{s.totalFetched}</td>
                    <td className="py-2 text-right text-[11px] font-mono text-slate-700 dark:text-slate-200">{s.totalFailed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
