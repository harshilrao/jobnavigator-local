import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  getJob,
  getDocuments,
  getJobMatches,
  listCoverLetterTemplates,
  generateCoverLetter,
  approveGeneratedDocument,
  exportGeneratedDocument,
  type DocumentView,
  type JobView,
  type MatchReportView,
  type CoverLetterTemplateView,
  type GeneratedCoverLetterResponse,
  type CanonicalCoverLetter,
} from '../lib/api';
import { TemplateSelector } from '../components/TemplateSelector';

interface CoverLetterState {
  step: 'select' | 'preview' | 'approved';
  resumeId?: string;
  matchReportId?: string;
  templateId?: string;
  coverLetterResponse?: GeneratedCoverLetterResponse;
  generatedDocId?: string;
  loading: boolean;
  error: string | null;
  // Form fields
  tone: 'professional' | 'enthusiastic' | 'confident' | 'conversational';
  length: 'short' | 'medium' | 'long';
  recipientName: string;
  recipientTitle: string;
  companyAddress: string;
  instructions: string;
}

const TONE_OPTIONS = [
  { value: 'professional' as const, label: 'Professional', description: 'Formal, polished, standard business tone' },
  { value: 'enthusiastic' as const, label: 'Enthusiastic', description: 'Energetic, shows genuine excitement' },
  { value: 'confident' as const, label: 'Confident', description: 'Assertive, highlights achievements strongly' },
  { value: 'conversational' as const, label: 'Conversational', description: 'Friendly, approachable, less formal' },
];

const LENGTH_OPTIONS = [
  { value: 'short' as const, label: 'Short', description: '~150-200 words, concise' },
  { value: 'medium' as const, label: 'Medium', description: '~250-350 words, standard' },
  { value: 'long' as const, label: 'Long', description: '~400-500 words, detailed' },
];

export function CoverLetterPage() {
  const navigate = useNavigate();
  const { jobId } = useParams<{ jobId: string }>();
  const [searchParams] = useSearchParams();
  const [job, setJob] = useState<JobView | null>(null);
  const [documents, setDocuments] = useState<DocumentView[]>([]);
  const [matchReports, setMatchReports] = useState<MatchReportView[]>([]);
  const [templates, setTemplates] = useState<CoverLetterTemplateView[]>([]);
  const [state, setState] = useState<CoverLetterState>({
    step: 'select',
    tone: 'professional',
    length: 'medium',
    recipientName: '',
    recipientTitle: '',
    companyAddress: '',
    instructions: '',
    loading: false,
    error: null,
  });

  // Load initial data
  useEffect(() => {
    if (!jobId) return;
    loadJob();
    loadDocuments();
    loadMatchReports();
    loadTemplates();
  }, [jobId]);

  // Auto-select resume and match report from query params
  useEffect(() => {
    if (!jobId) return;
    const resumeId = searchParams.get('resume');
    const matchReportId = searchParams.get('match');
    if (resumeId) {
      setState(prev => ({ ...prev, resumeId }));
    }
    if (matchReportId) {
      setState(prev => ({ ...prev, matchReportId }));
    }
  }, [jobId, searchParams]);

  const loadJob = async () => {
    try {
      const j = await getJob(jobId!);
      setJob(j);
      // Pre-fill company name if available
      if (j.companyName) {
        // We'll use it in the preview
      }
    } catch (err) {
      console.error('Failed to load job:', err);
    }
  };

  const loadDocuments = async () => {
    try {
      const docs = await getDocuments();
      const resumes = docs.filter(d => d.documentType === 'resume' && d.textExtractionStatus === 'complete');
      setDocuments(resumes);
    } catch (err) {
      console.error('Failed to load documents:', err);
    }
  };

  const loadMatchReports = async () => {
    try {
      const { matches } = await getJobMatches(jobId!);
      setMatchReports(matches.filter(m => m.status === 'complete'));
    } catch (err) {
      console.error('Failed to load match reports:', err);
    }
  };

  const loadTemplates = async () => {
    try {
      const tmpls = await listCoverLetterTemplates();
      setTemplates(tmpls);
      const defaultTmpl = tmpls.find(t => t.isDefault);
      if (defaultTmpl) {
        setState(prev => ({ ...prev, templateId: defaultTmpl.id }));
      }
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
  };

  const handleGenerate = async () => {
    console.log('[CoverLetter] handleGenerate called', { resumeId: state.resumeId, templateId: state.templateId, matchReportId: state.matchReportId, jobId, tone: state.tone, length: state.length });
    if (!state.resumeId || !state.templateId) {
      console.log('[CoverLetter] Missing resumeId or templateId');
      setState(prev => ({ ...prev, error: 'Please select a resume and template' }));
      return;
    }

    const startTime = Date.now();
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      console.log('[CoverLetter] Calling generateCoverLetter API... (this may take 60-120s for Ollama)');
      const apiStartTime = Date.now();
      const response = await generateCoverLetter({
        originalResumeId: state.resumeId,
        jobId: jobId!,
        matchReportId: state.matchReportId,
        templateId: state.templateId,
        tone: state.tone,
        length: state.length,
        recipientName: state.recipientName || undefined,
        recipientTitle: state.recipientTitle || undefined,
        companyAddress: state.companyAddress || undefined,
        instructions: state.instructions || undefined,
      });
      const apiDuration = Date.now() - apiStartTime;
      console.log('[CoverLetter] generateCoverLetter API completed in', apiDuration, 'ms');
      console.log('[CoverLetter] generateCoverLetter response:', response);

      setState(prev => ({
        ...prev,
        step: 'preview',
        coverLetterResponse: response,
        generatedDocId: response.generatedDocumentId,
        loading: false,
      }));
      const totalDuration = Date.now() - startTime;
      console.log('[CoverLetter] Total handleGenerate completed in', totalDuration, 'ms');
      console.log('[CoverLetter] State updated to preview step');
    } catch (err) {
      const totalDuration = Date.now() - startTime;
      console.error('[CoverLetter] Error after', totalDuration, 'ms:', err);
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to generate cover letter',
      }));
    }
  };

  const handleApprove = async () => {
    if (!state.coverLetterResponse || !state.generatedDocId) return;

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // The generateCoverLetter endpoint already saves the document as a draft with generatedDocumentId
      // We just need to approve it using that ID
      const approved = await approveGeneratedDocument(state.generatedDocId);
      setState(prev => ({
        ...prev,
        step: 'approved',
        generatedDocId: approved.id,
        loading: false,
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to approve document',
      }));
    }
  };

  const handleExport = async (format: 'pdf' | 'docx' | 'html') => {
    if (!state.generatedDocId) return;

    try {
      const { blob, fileName } = await exportGeneratedDocument(state.generatedDocId, {
        format,
        margins: { top: 25, right: 25, bottom: 25, left: 25 },
        pageSize: 'A4',
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to export document',
      }));
    }
  };

  const handleBack = () => {
    if (state.step === 'preview') {
      setState(prev => ({ ...prev, step: 'select', coverLetterResponse: undefined }));
    } else if (state.step === 'approved') {
      setState(prev => ({ ...prev, step: 'preview' }));
    } else {
      navigate(-1);
    }
  };

  const updateField = <K extends keyof CoverLetterState>(field: K, value: CoverLetterState[K]) => {
    setState(prev => ({ ...prev, [field]: value }));
  };

  if (!jobId) {
    return (
      <div className="p-6 text-center text-gray-500">
        No job ID provided
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-2 inline-flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Jobs
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Generate Cover Letter</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Create a tailored cover letter for <strong>{job?.title || 'this position'}</strong>
            {job?.companyName && <span> at <strong>{job.companyName}</strong></span>}
          </p>
        </div>
        {state.step === 'approved' && state.generatedDocId && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleExport('pdf')}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg"
            >
              Export PDF
            </button>
            <button
              type="button"
              onClick={() => handleExport('docx')}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
            >
              Export DOCX
            </button>
            <button
              type="button"
              onClick={() => handleExport('html')}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg"
            >
              Export HTML
            </button>
          </div>
        )}
      </div>

      {/* Error Banner */}
      {state.error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 flex items-center justify-between">
          <span>{state.error}</span>
          <button
            type="button"
            onClick={() => setState(prev => ({ ...prev, error: null }))}
            className="text-red-500 hover:text-red-700"
          >
            ×
          </button>
        </div>
      )}

      {/* Step 1: Select Resume, Match Report, Template, Options */}
      {state.step === 'select' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Resume & Match Report Selection */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Select Base Resume</h2>
              {documents.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <svg className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <p className="mt-2">No resumes uploaded yet</p>
                  <p className="text-sm">Upload a resume on the Documents page first</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {documents.map(doc => (
                    <label
                      key={doc.id}
                      className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                        state.resumeId === doc.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="resume"
                        value={doc.id}
                        checked={state.resumeId === doc.id}
                        onChange={() => setState(prev => ({ ...prev, resumeId: doc.id }))}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                      />
                      <div className="ml-4 flex-1 min-w-0">
                        <div className="font-medium text-gray-900 dark:text-white truncate">{doc.originalFilename}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                          <span>{(doc.size / 1024).toFixed(1)} KB</span>
                          <span className="px-2 py-0.5 text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded">
                            Text Extracted
                          </span>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Match Report Selection */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Match Report (Optional)</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                Using a match report helps the AI reference matched skills and address gaps in the letter.
              </p>
              <label className="flex items-center p-4 rounded-lg border-2 cursor-pointer transition-colors border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600">
                <input
                  type="radio"
                  name="matchReport"
                  value=""
                  checked={!state.matchReportId}
                  onChange={() => setState(prev => ({ ...prev, matchReportId: undefined }))}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                />
                <div className="ml-4">
                  <div className="font-medium text-gray-900 dark:text-white">No match report (use job description only)</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">AI will analyze the job description directly</div>
                </div>
              </label>
              {matchReports.map(report => (
                <label
                  key={report.id}
                  className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                    state.matchReportId === report.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="matchReport"
                    value={report.id}
                    checked={state.matchReportId === report.id}
                    onChange={() => setState(prev => ({ ...prev, matchReportId: report.id }))}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                  />
                  <div className="ml-4 flex-1 min-w-0">
                    <div className="font-medium text-gray-900 dark:text-white">Match Report — Score: {report.matchScore}/100</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                      <span>Generated {new Date(report.generatedAt).toLocaleDateString()}</span>
                      <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded">
                        {report.provider}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{report.matchReport.fitSummary as string}</div>
                  </div>
                </label>
              ))}
            </div>

            {/* Letter Settings */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Letter Settings</h2>

              {/* Tone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Tone</label>
                <div className="grid grid-cols-2 gap-3">
                  {TONE_OPTIONS.map(option => (
                    <label
                      key={option.value}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                        state.tone === option.value
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="tone"
                        value={option.value}
                        checked={state.tone === option.value}
                        onChange={() => updateField('tone', option.value)}
                        className="sr-only"
                      />
                      <div className="font-medium text-gray-900 dark:text-white">{option.label}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{option.description}</div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Length */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Length</label>
                <div className="grid grid-cols-3 gap-3">
                  {LENGTH_OPTIONS.map(option => (
                    <label
                      key={option.value}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-colors text-center ${
                        state.length === option.value
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="length"
                        value={option.value}
                        checked={state.length === option.value}
                        onChange={() => updateField('length', option.value)}
                        className="sr-only"
                      />
                      <div className="font-medium text-gray-900 dark:text-white">{option.label}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{option.description}</div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Recipient Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Recipient Name (optional)
                  </label>
                  <input
                    type="text"
                    value={state.recipientName}
                    onChange={e => updateField('recipientName', e.target.value)}
                    placeholder="Hiring Manager"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Recipient Title (optional)
                  </label>
                  <input
                    type="text"
                    value={state.recipientTitle}
                    onChange={e => updateField('recipientTitle', e.target.value)}
                    placeholder="Senior Technical Recruiter"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Company Address (optional)
                </label>
                <textarea
                  value={state.companyAddress}
                  onChange={e => updateField('companyAddress', e.target.value)}
                  placeholder="123 Main St&#10;San Francisco, CA 94102"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Instructions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Additional Instructions (Optional)
                </label>
                <textarea
                  value={state.instructions}
                  onChange={e => updateField('instructions', e.target.value)}
                  placeholder="e.g., Mention my referral from John Doe, emphasize my passion for the company mission..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Template Selection */}
          <div className="space-y-6">
            <TemplateSelector
              type="cover-letter"
              selectedId={state.templateId}
              onSelect={id => setState(prev => ({ ...prev, templateId: id }))}
              onCreateNew={() => {}}
            />

            {/* Generate Button */}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={state.loading || !state.resumeId || !state.templateId}
              className="w-full py-3 px-4 text-lg font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              {state.loading ? 'Generating... (Ollama may take 60-120s, check console)' : 'Generate Cover Letter'}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Preview */}
      {state.step === 'preview' && state.coverLetterResponse && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Review Cover Letter</h2>
              <p className="text-gray-500 dark:text-gray-400">
                Review the generated letter. You can adjust settings and regenerate if needed.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleBack}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={state.loading}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg"
              >
                {state.loading ? 'Approving...' : 'Approve & Continue'}
              </button>
            </div>
          </div>

          {/* Warnings */}
          {state.coverLetterResponse.warnings.length > 0 && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <h3 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2 flex items-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Warnings
              </h3>
              <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                {state.coverLetterResponse.warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span>•</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Letter Preview */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 max-w-2xl mx-auto">
            <div
              className="prose dark:prose-invert max-w-none whitespace-pre-wrap font-serif"
              dangerouslySetInnerHTML={{ __html: state.coverLetterResponse.htmlPreview }}
            />
          </div>

          {/* Raw JSON for debugging */}
          <details className="group">
            <summary className="cursor-pointer font-medium text-gray-900 dark:text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-gray-500 group-open:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              View Canonical JSON
            </summary>
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 max-h-96 overflow-auto">
              <pre className="text-sm text-gray-700 dark:text-gray-300 font-mono">
                {JSON.stringify(state.coverLetterResponse.canonicalCoverLetter, null, 2)}
              </pre>
            </div>
          </details>
        </div>
      )}

      {/* Step 3: Approved */}
      {state.step === 'approved' && state.generatedDocId && (
        <div className="space-y-6">
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-green-800 dark:text-green-200">Cover Letter Approved!</h2>
                <p className="text-green-700 dark:text-green-300 mt-1">
                  Your cover letter has been approved and saved. You can now export it.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Export Options</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                type="button"
                onClick={() => handleExport('pdf')}
                className="p-6 text-center border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-red-500 dark:hover:border-red-500 transition-colors"
              >
                <div className="w-12 h-12 mx-auto mb-3 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zm0 12a4 4 0 004-4V8a4 4 0 10-8 0v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a4 4 0 004 4z" />
                  </svg>
                </div>
                <div className="font-medium text-gray-900 dark:text-white">PDF</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Best for applications</div>
              </button>

              <button
                type="button"
                onClick={() => handleExport('docx')}
                className="p-6 text-center border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-blue-500 dark:hover:border-blue-500 transition-colors"
              >
                <div className="w-12 h-12 mx-auto mb-3 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                    <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="font-medium text-gray-900 dark:text-white">DOCX</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Editable in Word</div>
              </button>

              <button
                type="button"
                onClick={() => handleExport('html')}
                className="p-6 text-center border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-gray-500 dark:hover:border-gray-500 transition-colors"
              >
                <div className="w-12 h-12 mx-auto mb-3 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-600 dark:text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 000 1.414l7 7a1 1 0 001.414-1.414L4.414 10l6.293-6.293a1 1 0 000-1.414z" />
                    <path d="M9.293 2.293a1 1 0 011.414 0l7 7a1 1 0 010 1.414l-7 7a1 1 0 01-1.414-1.414L15.586 10l-6.293-6.293a1 1 0 010-1.414z" />
                  </svg>
                </div>
                <div className="font-medium text-gray-900 dark:text-white">HTML</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">For web or further editing</div>
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg"
            >
              Back to Preview
            </button>
            <button
              type="button"
              onClick={() => navigate('/jobs')}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
            >
              Back to Jobs
            </button>
          </div>
        </div>
      )}
    </div>
  );
}