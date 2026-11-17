import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getJobs,
  updateUserJob,
  listScrapeSessions,
  type JobView,
  type JobFilter,
} from '@/lib/api';

export interface User {
  id: string;
  email: string;
}

const REFRESH_INTERVAL_MS = 4000;

export function Jobs() {
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<JobFilter>({ page: 1, limit: 20, sort: 'createdAt', order: 'desc' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getJobs(filter);
      setJobs(result.jobs);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  // Detect whether a scrape session is running/queued so we can auto-refresh
  // the jobs table as new scrape results are saved.
  useEffect(() => {
    const check = async () => {
      try {
        const data = await listScrapeSessions();
        const active = data.sessions.some(
          (s) => s.status === 'queued' || s.status === 'running',
        );
        if (active && !autoRefresh) {
          setAutoRefresh(true);
        } else if (!active && autoRefresh) {
          setAutoRefresh(false);
        }
      } catch {
        /* ignore */
      }
    };
    check();
    const id = setInterval(check, 5000);
    return () => clearInterval(id);
  }, [autoRefresh]);

  // Load jobs on mount and whenever the filter changes.
  useEffect(() => {
    clearPoll();
    fetchJobs();
    if (autoRefresh) {
      pollRef.current = setInterval(fetchJobs, REFRESH_INTERVAL_MS);
    }
    return () => clearPoll();
  }, [filter, autoRefresh, clearPoll, fetchJobs]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilter({ ...filter, page: 1, q: e.target.value });
  };

  const handleSavedState = (jobId: string, savedState: JobView['savedState']) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, savedState } : j)),
    );
    updateUserJob(jobId, { savedState }).catch(() => {
      /* optimistic revert handled by refetch on next poll */
    });
  };

  const handleRefresh = () => {
    fetchJobs();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Jobs</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {total} job(s) — scraped jobs appear here live while a session runs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 disabled:opacity-60 transition"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          {autoRefresh && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-[10px] font-semibold text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900/40">
              🔄 live
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 rounded text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30">
          {error}
        </div>
      )}

      <div className="layer-panel p-4">
        <div className="flex items-center gap-3 mb-4">
          <input
            type="text"
            value={filter.q ?? ''}
            onChange={handleSearch}
            placeholder="Search jobs…"
            className="w-full sm:w-72 rounded border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <select
            value={filter.savedState ?? 'none'}
            onChange={(e) => {
              const v = e.target.value;
              setFilter({ ...filter, page: 1, savedState: (v === 'none' ? undefined : v) as JobFilter['savedState'] | undefined });
            }}
            className="rounded border border-slate-300 dark:border-slate-600 px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="none">All states</option>
            <option value="saved">Saved</option>
            <option value="ignored">Ignored</option>
            <option value="viewed">Viewed</option>
          </select>
        </div>

        {jobs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-8 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">No jobs yet.</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Start a scrape session from the Scrape page, or import jobs (Phase 3).
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left pb-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400">Title</th>
                  <th className="text-left pb-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400">Company</th>
                  <th className="text-left pb-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400">Location</th>
                  <th className="text-left pb-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400">Status</th>
                  <th className="text-right pb-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400">Action</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr
                    key={job.id}
                    className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 group"
                  >
                    <td className="py-2">
                      <div className="font-medium text-slate-700 dark:text-slate-200">{job.title}</div>
                      {job.descriptionStatus === 'missing' && (
                        <span className="ml-2 text-[10px] rounded border px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-900/40">
                          missing JD
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-slate-600 dark:text-slate-400">
                      {job.companyName ?? '—'}
                    </td>
                    <td className="py-2 text-slate-600 dark:text-slate-400 text-[11px]">
                      {job.location.city || (job.location.remoteType !== 'unspecified' ? job.location.remoteType : '—')}
                    </td>
                    <td className="py-2">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        job.savedState === 'saved'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400 border border-green-200 dark:border-green-900/40'
                          : job.savedState === 'ignored'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-200 dark:border-red-900/40'
                          : 'bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                      }`}>
                        {job.savedState}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() =>
                          handleSavedState(
                            job.id,
                            job.savedState === 'saved' ? 'none' : 'saved',
                          )
                        }
                        className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                          job.savedState === 'saved'
                            ? 'bg-green-600 text-white hover:bg-green-700'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700'
                        }`}
                      >
                        {job.savedState === 'saved' ? 'Unsave' : 'Save'}
                      </button>
                    </td>
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
