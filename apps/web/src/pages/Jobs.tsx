import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  getJobs,
  addJob,
  importJobs,
  updateUserJob,
  type JobView,
  type JobFilter,
  type ImportResult,
  type NewJobInput,
  type UserJobUpdate,
  setAuthToken,
  getAuthToken,
} from '@/lib/api';

type SavedState = JobView['savedState'];

const EMPTY_FILTER: JobFilter = {
  page: 1,
  limit: 25,
  sort: 'createdAt',
  order: 'desc',
};

const REMOTE_TYPES: { value: JobView['remoteType']; label: string }[] = [
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'Onsite' },
  { value: 'unspecified', label: 'Unspecified' },
];

const SAVED_STATES: { value: SavedState; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'saved', label: 'Saved' },
  { value: 'ignored', label: 'Ignored' },
  { value: 'viewed', label: 'Viewed' },
];

const STAGES: UserJobUpdate['stage'][] = [
  'saved',
  'preparing',
  'ready_for_review',
  'applied',
  'assessment',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
];

function cn(...classes: (string | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function Jobs() {
  const [filter, setFilter] = useState<JobFilter>({ ...EMPTY_FILTER });
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const [importOpen, setImportOpen] = useState(false);
  const [importFormat, setImportFormat] = useState<'csv' | 'json' | 'url'>('csv');
  const [importData, setImportData] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const [detailJob, setDetailJob] = useState<JobView | null>(null);

  // Persist the auth token so protected API calls work.
  useEffect(() => {
    setAuthToken(getAuthToken() ?? localStorage.getItem('jn_token') ?? null);
  }, []);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getJobs({ ...filter, page });
      setJobs(result.jobs);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleFilterChange = useCallback(
    (key: keyof JobFilter, value: unknown) => {
      setPage(1);
      setFilter((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleSaveState = useCallback(
    async (id: string, savedState: SavedState) => {
      try {
        await updateUserJob(id, { savedState });
        await fetchJobs();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update saved state');
      }
    },
    [fetchJobs],
  );

  const handleNote = useCallback(async (id: string, notes: string) => {
    try {
      await updateUserJob(id, { notes });
      await fetchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note');
    }
  }, [fetchJobs]);

  const handleStage = useCallback(async (id: string, stage: UserJobUpdate['stage']) => {
    try {
      await updateUserJob(id, { stage });
      await fetchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update stage');
    }
  }, [fetchJobs]);

  const handleAddJob = useCallback(async (input: NewJobInput) => {
    try {
      await addJob(input);
      setError(null);
      await fetchJobs();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add job');
      return false;
    }
  }, [fetchJobs]);

  const handleImport = useCallback(async () => {
    setImporting(true);
    setError(null);
    try {
      const result = await importJobs(importFormat, importData);
      setImportResult(result);
      await fetchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }, [importFormat, importData, fetchJobs]);

  const totalPages = Math.ceil(total / filter.limit!);

  const savedCounts = useMemo(() => {
    const counts: Record<SavedState, number> = { none: 0, saved: 0, ignored: 0, viewed: 0 };
    for (const j of jobs) counts[j.savedState] = (counts[j.savedState] ?? 0) + 1;
    return counts;
  }, [jobs]);

  return (
    <div className="layer-panel p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Jobs</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Track and filter your job inventory. {total} job(s) matched.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const t = window.prompt('Job title');
              if (!t) return;
              handleAddJob({ title: t, source: 'manual' });
            }}
            className="px-3 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
            disabled={loading}
          >
            Add Job
          </button>
          <button
            onClick={() => {
              setImportFormat('csv');
              setImportData('');
              setImportResult(null);
              setImportOpen(true);
            }}
            className="px-3 py-2 text-sm bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"
            disabled={loading}
          >
            Import
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Filters */}
      <details className="mb-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30">
        <summary className="list-none p-3 cursor-pointer font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50 rounded-t-lg">
          Filters
        </summary>
        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 border-t border-slate-200 dark:border-slate-700">
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Search</label>
            <input
              className="w-full px-2 py-1.5 text-sm border rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              value={filter.q ?? ''}
              onChange={(e) => handleFilterChange('q', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Saved state</label>
            <select
              className="w-full px-2 py-1.5 text-sm border rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              value={filter.savedState ?? ''}
              onChange={(e) => handleFilterChange('savedState', e.target.value || undefined)}
            >
              <option value="">All</option>
              {SAVED_STATES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Remote type</label>
            <select
              className="w-full px-2 py-1.5 text-sm border rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              value={filter.remoteType ?? ''}
              onChange={(e) => handleFilterChange('remoteType', e.target.value || undefined)}
            >
              <option value="">All</option>
              {REMOTE_TYPES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Seniority</label>
            <select
              className="w-full px-2 py-1.5 text-sm border rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              value={filter.seniority ?? ''}
              onChange={(e) => handleFilterChange('seniority', e.target.value || undefined)}
            >
              <option value="">All</option>
              {['intern', 'entry', 'mid', 'senior', 'lead', 'unspecified'].map((v) => (
                <option key={v} value={v}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Employment type</label>
            <select
              className="w-full px-2 py-1.5 text-sm border rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              value={filter.employmentType ?? ''}
              onChange={(e) => handleFilterChange('employmentType', e.target.value || undefined)}
            >
              <option value="">All</option>
              {[
                'full-time',
                'part-time',
                'contract',
                'temporary',
                'freelance',
                'unspecified',
              ].map((v) => (
                <option key={v} value={v}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Description</label>
            <select
              className="w-full px-2 py-1.5 text-sm border rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              value={filter.descriptionStatus ?? ''}
              onChange={(e) => handleFilterChange('descriptionStatus', e.target.value || undefined)}
            >
              <option value="">All</option>
              {['complete', 'partial', 'missing', 'blocked', 'closed'].map((v) => (
                <option key={v} value={v}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Quality</label>
            <select
              className="w-full px-2 py-1.5 text-sm border rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              value={filter.qualityStatus ?? ''}
              onChange={(e) => handleFilterChange('qualityStatus', e.target.value || undefined)}
            >
              <option value="">All</option>
              {['good', 'limited', 'unsupported'].map((v) => (
                <option key={v} value={v}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Closed</label>
            <select
              className="w-full px-2 py-1.5 text-sm border rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              value={String(filter.isClosed ?? '')}
              onChange={(e) => handleFilterChange('isClosed', e.target.value === 'true')}
            >
              <option value="">All</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>
          <div className="col-span-2 lg:col-span-4">
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Salary (min – max)</label>
            <div className="flex gap-2">
              <input
                className="flex-1 px-2 py-1.5 text-sm border rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                type="number"
                placeholder="min"
                value={filter.minSalary ?? ''}
                onChange={(e) =>
                  handleFilterChange('minSalary', e.target.value === '' ? undefined : Number(e.target.value))
                }
              />
              <input
                className="flex-1 px-2 py-1.5 text-sm border rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                type="number"
                placeholder="max"
                value={filter.maxSalary ?? ''}
                onChange={(e) =>
                  handleFilterChange('maxSalary', e.target.value === '' ? undefined : Number(e.target.value))
                }
              />
            </div>
          </div>
        </div>
      </details>

      {/* Table */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Title</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Company</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Location</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Remote</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">State</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                  Loading jobs…
                </td>
              </tr>
            ) : jobs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                  No jobs matched the current filters.
                </td>
              </tr>
            ) : (
              jobs.map((job) => (
                <tr
                  key={job.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer"
                  onClick={() => setDetailJob(job)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 dark:text-slate-100">{job.title}</div>
                    {job.description && (
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[400px]">
                        {job.description}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                    {job.companyName || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                    {[
                      job.location.city,
                      job.location.region,
                      job.location.country,
                    ]
                      .filter(Boolean)
                      .join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                      job.remoteType === 'remote'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                        : job.remoteType === 'hybrid'
                        ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                        : job.remoteType === 'onsite'
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
                    )}>
                      {job.remoteType}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
                      job.savedState === 'saved'
                        ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                        : job.savedState === 'ignored'
                        ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
                        : job.savedState === 'viewed'
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-500 border-slate-200 dark:border-slate-700',
                    )}>
                      {job.savedState}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSaveState(
                            job.id,
                            job.savedState === 'saved' ? 'none' : 'saved',
                          );
                        }}
                        className="p-1.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                        title={job.savedState === 'saved' ? 'Unsave' : 'Save'}
                      >
                        {job.savedState === 'saved' ? '★' : '☆'}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const n = window.prompt('Note for ' + job.title, job.savedState ? '' : '');
                          if (n !== null) handleNote(job.id, n);
                        }}
                        className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                        title="Note"
                      >
                        📝
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const s = window.prompt(
                            'Stage (' + STAGES.join(', ') + ')',
                            'applied',
                          );
                          if (s && STAGES.includes(s as UserJobUpdate['stage'])) {
                            handleStage(job.id, s as UserJobUpdate['stage']);
                          }
                        }}
                        className="p-1.5 text-slate-500 hover:text-purple-600 dark:hover:text-purple-400 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                        title="Stage"
                      >
                        📌
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
          <div>
            Showing {jobs.length} of {total}
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="px-2 py-1 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              Prev
            </button>
            <span className="px-2">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="px-2 py-1 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Summary chips */}
      <div className="mt-4 flex gap-2">
        {SAVED_STATES.map((s) => (
          <button
            key={s.value}
            onClick={() => handleFilterChange('savedState', s.value)}
            className={cn(
              'px-3 py-1 rounded text-sm border',
              filter.savedState === s.value
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700',
            )}
          >
            {s.label} ({savedCounts[s.value]})
          </button>
        ))}
      </div>

      {/* Job detail modal */}
      {detailJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setDetailJob(null)}
          />
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 relative">
            <button
              onClick={() => setDetailJob(null)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
            >
              ✕
            </button>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">
              {detailJob.title}
            </h3>
            <div className="text-slate-600 dark:text-slate-400 mb-4">
              {detailJob.companyName || 'No company'} •
              {[
                detailJob.location.city,
                detailJob.location.region,
                detailJob.location.country,
              ]
                .filter(Boolean)
                .join(', ') || 'No location'} •
              {detailJob.remoteType}
            </div>
            {detailJob.description && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Description</p>
                <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{detailJob.description}</p>
              </div>
            )}
            <div className="mb-4">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Provenance</p>
              <p className="text-slate-700 dark:text-slate-300 text-sm">
                {detailJob.provenance.source} • {detailJob.provenance.retrievalMethod}
              </p>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  const ns = detailJob.savedState === 'saved' ? 'none' : 'saved';
                  handleSaveState(detailJob.id, ns);
                  setDetailJob(null);
                }}
                className="flex-1 px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 text-sm"
              >
                {detailJob.savedState === 'saved' ? 'Unsave' : 'Save'}
              </button>
              <button
                onClick={() => setDetailJob(null)}
                className="flex-1 px-4 py-2 rounded border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import dialog */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setImportOpen(false)}
          />
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 w-full max-w-lg p-6 relative">
            <button
              onClick={() => setImportOpen(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
            >
              ✕
            </button>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">Import Jobs</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Paste CSV, JSON, or a URL. Dedup is by source + sourceJobId.
            </p>
            <select
              value={importFormat}
              onChange={(e) =>
                setImportFormat(e.target.value as 'csv' | 'json' | 'url')
              }
              className="w-full px-2 py-2 text-sm border rounded mb-4 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
              <option value="url">URL (fetch JSON/CSV)</option>
            </select>
            <textarea
              value={importData}
              onChange={(e) => setImportData(e.target.value)}
              rows={8}
              className="w-full px-2 py-2 text-sm border rounded mb-4 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
              placeholder="Paste your CSV/JSON data or a URL here…"
            />
            {importResult && (
              <div className={cn(
                'p-3 rounded text-sm mb-4',
                importResult.imported > 0
                  ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700',
              )}>
                Imported {importResult.imported} of {importResult.total} ({importResult.skipped} skipped)
                {importResult.errors.length > 0 && (
                  <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                    {importResult.errors.slice(0, 5).join('; ')}
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleImport}
                disabled={importing || !importData.trim()}
                className="flex-1 px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 text-sm"
              >
                {importing ? 'Importing…' : 'Import'}
              </button>
              <button
                onClick={() => setImportOpen(false)}
                className="px-4 py-2 rounded border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
