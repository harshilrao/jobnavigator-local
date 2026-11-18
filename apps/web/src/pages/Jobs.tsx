import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getJobs,
  updateUserJob,
  listScrapeSessions,
  getDocuments,
  scoreJob,
  getJobMatches,
  getCurrentUser,
  type JobView,
  type JobFilter,
  type MatchReportView,
  type DocumentView,
  type AIProviderId,
} from '@/lib/api';

interface MatchReportContent {
  fitSummary?: string;
  requiredSkills?: Array<{
    skill: string;
    requirement: 'required' | 'preferred';
    jdEvidence: string;
    resumeEvidence: string;
    status: 'met' | 'partial' | 'missing' | 'unknown';
  }>;
  relevantKeywords?: string[];
  cautions?: string[];
  suggestedImprovements?: string[];
  matchScore?: number;
  rubric?: string;
}

export interface User {
  id: string;
  email: string;
}

const REFRESH_INTERVAL_MS = 4000;

export function Jobs() {
  const user = getCurrentUser();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<JobFilter>({ page: 1, limit: 20, sort: 'createdAt', order: 'desc' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Job detail modal
  const [selectedJob, setSelectedJob] = useState<JobView | null>(null);
  const [resumes, setResumes] = useState<DocumentView[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string>('');
  const [resumesLoading, setResumesLoading] = useState(false);
  const [scoring, setScoring] = useState<Record<string, boolean>>({});
  const [matches, setMatches] = useState<MatchReportView[]>([]);
  const [scoreError, setScoreError] = useState<string | null>(null);

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

  // Load resumes when a job is selected.
  useEffect(() => {
    if (!selectedJob) return;
    setResumesLoading(true);
    getDocuments()
      .then((docs) => {
        const resumeList = docs.filter((d) => d.documentType === 'resume');
        setResumes(resumeList);
        if (resumeList.length > 0 && !selectedResumeId) {
          setSelectedResumeId(resumeList[0].id);
        }
      })
      .catch(() => setResumes([]))
      .finally(() => setResumesLoading(false));
  }, [selectedJob]);

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

  const openJobDetail = (job: JobView) => {
    setSelectedJob(job);
    setMatches([]);
    setScoreError(null);
  };

  const closeJobDetail = () => {
    setSelectedJob(null);
    setScoreError(null);
  };

  const handleScoreJob = async (
    resumeId: string,
    provider: AIProviderId = 'ollama',
  ) => {
    if (!selectedJob) return;
    setScoring((prev) => ({ ...prev, [selectedJob.id]: true }));
    setScoreError(null);
    try {
      const report = await scoreJob(selectedJob.id, { resumeId, provider });
      setMatches((prev) => [report, ...prev.filter((m) => m.id !== report.id)]);
      // Refresh the job row so aiScore shows in the table.
      setJobs((prev) =>
        prev.map((j) =>
          j.id === selectedJob!.id ? { ...j, aiScore: report.matchScore } : j,
        ),
      );
    } catch (err) {
      setScoreError(
        err instanceof Error ? err.message : 'Failed to score job.',
      );
    } finally {
      setScoring((prev) => {
        const next = { ...prev };
        delete next[selectedJob!.id];
        return next;
      });
    }
  };

  const loadMatches = async () => {
    if (!selectedJob) return;
    try {
      const data = await getJobMatches(selectedJob.id);
      setMatches(data.matches);
    } catch {
      /* matches load failure is non-fatal */
    }
  };

  useEffect(() => {
    loadMatches();
  }, [selectedJob]);

  if (!user) return null;

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
                    className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 group cursor-pointer"
                    onClick={() => openJobDetail(job)}
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
                      {job.aiScore !== undefined && (
                        <span className="ml-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                          AI: {job.aiScore}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSavedState(
                            job.id,
                            job.savedState === 'saved' ? 'none' : 'saved',
                          );
                        }}
                        className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                          job.savedState === 'saved'
                            ? 'bg-green-600 text-white hover:bg-green-700'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700'
                        }`}
                      >
                        {job.savedState === 'saved' ? 'Unsave' : 'Save'}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openJobDetail(job);
                        }}
                        className="ml-2 px-2.5 py-1 rounded text-xs font-semibold bg-slate-600 text-white hover:bg-slate-700 transition"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Job detail modal with scoring */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeJobDetail}
          />
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">
                {selectedJob.title}
              </h3>
              <button
                onClick={closeJobDetail}
                className="rounded p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition"
              >
                <span className="sr-only">Close</span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Company</div>
                  <div className="text-slate-700 dark:text-slate-200">{selectedJob.companyName ?? '—'}</div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Location</div>
                  <div className="text-slate-700 dark:text-slate-200">
                    {selectedJob.location.city || (selectedJob.location.remoteType !== 'unspecified' ? selectedJob.location.remoteType : '—')}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Description</div>
                  <div className="text-slate-700 dark:text-slate-200 capitalize">
                    {selectedJob.descriptionStatus}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">AI score</div>
                  <div className="text-slate-700 dark:text-slate-200 font-mono">
                    {selectedJob.aiScore !== undefined ? String(selectedJob.aiScore) : '—'}
                  </div>
                </div>
              </div>

              {selectedJob.description && (
                <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2">Job description</div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                    {selectedJob.description}
                  </div>
                </div>
              )}

              {/* Scoring section */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Score against resume</div>
                </div>

                {resumesLoading ? (
                  <div className="text-sm text-slate-500">Loading resumes…</div>
                ) : resumes.length === 0 ? (
                  <div className="p-3 rounded border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                      No resume documents found. Upload a resume (PDF/DOCX) from the Documents page first.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Resume</label>
                        <select
                          value={selectedResumeId}
                          onChange={(e) => setSelectedResumeId(e.target.value)}
                          className="w-full rounded border border-slate-300 dark:border-slate-600 px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          {resumes.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.originalFilename} ({r.textExtractionStatus})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-end">
                        <button
                          onClick={() => {
                            if (!selectedResumeId) return;
                            handleScoreJob(selectedResumeId, 'ollama');
                          }}
                          disabled={scoring[selectedJob.id] || !selectedResumeId}
                          className="w-full py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
                        >
                          {scoring[selectedJob.id] ? 'Scoring…' : 'Score with Ollama'}
                        </button>
                      </div>
                    </div>

                    {scoreError && (
                      <div className="p-2 rounded text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30">
                        {scoreError}
                      </div>
                    )}

                    {/* Match report results */}
                    {matches.length > 0 && (
                      <div className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Match report</span>
                          <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${
                            matches[0].matchScore >= 70 ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' :
                            matches[0].matchScore >= 40 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' :
                            'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                          }`}>
                            {matches[0].matchScore}/100
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {matches[0].provider} · {matches[0].model}
                          </span>
                        </div>

                        {(() => {
                          const content = matches[0].matchReport as MatchReportContent;
                          if (typeof content.fitSummary === 'string') {
                            return (
                              <div className="mb-3">
                                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">
                                  Fit summary
                                </div>
                                <div className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                                  {content.fitSummary}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })()}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {(() => {
                            const content = matches[0].matchReport as MatchReportContent;
                            if (!Array.isArray(content.requiredSkills)) return null;
                            return (
                              <div className="mb-3">
                                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">
                                  Required skills
                                </div>
                                <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1 list-disc pl-4">
                                  {content.requiredSkills.map((s, i) => (
                                    <li key={i}>
                                      {s.skill} <span className="font-normal text-[10px] text-slate-400">({s.status})</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            );
                          })()}
                          {(() => {
                            const content = matches[0].matchReport as MatchReportContent;
                            if (!Array.isArray(content.cautions)) return null;
                            return (
                              <div className="mb-3">
                                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">
                                  Cautions
                                </div>
                                <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1 list-disc pl-4">
                                  {content.cautions.map((c, i) => (
                                    <li key={i}>{c}</li>
                                  ))}
                                </ul>
                              </div>
                            );
                          })()}
                        </div>

                        {(() => {
                          const content = matches[0].matchReport as MatchReportContent;
                          if (!Array.isArray(content.suggestedImprovements)) return null;
                          return (
                            <div className="mt-3">
                              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">
                                Suggested improvements
                              </div>
                              <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1 list-disc pl-4">
                                {content.suggestedImprovements.map((s, i) => (
                                  <li key={i}>{s}</li>
                                ))}
                              </ul>
                            </div>
                          );
                        })()}

                        <div className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
                          Generated {new Date(matches[0].generatedAt).toLocaleString()} · status: {matches[0].status}
                        </div>

                        {/* Phase 6: Tailor Resume & Cover Letter buttons */}
                        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => navigate(`/jobs/${selectedJob.id}/tailor?resume=${selectedResumeId}&match=${matches[0].id}`)}
                              className="px-3 py-1.5 rounded text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 transition"
                            >
                              Tailor Resume
                            </button>
                            <button
                              onClick={() => navigate(`/jobs/${selectedJob.id}/cover-letter?resume=${selectedResumeId}&match=${matches[0].id}`)}
                              className="px-3 py-1.5 rounded text-xs font-semibold bg-pink-600 text-white hover:bg-pink-700 transition"
                            >
                              Generate Cover Letter
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
