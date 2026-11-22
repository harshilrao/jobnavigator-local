import type { JobFilter, SourceCapabilityStatus } from '@jobnavigator/shared';

export type { JobFilter, SourceCapabilityStatus } from '@jobnavigator/shared';

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:3000';

/** Bearer token held in memory; persisted to localStorage so sessions survive reloads. */
let authToken: string | null = null;
let currentUser: { id: string; email: string } | null = null;

function loadStoredSession(): void {
  if (typeof localStorage === 'undefined') return;
  const stored = localStorage.getItem('jn_token');
  if (stored) authToken = stored;
  const userRaw = localStorage.getItem('jn_user');
  if (userRaw) {
    try {
      currentUser = JSON.parse(userRaw);
    } catch {
      /* ignore corrupt stored user */
    }
  }
}
loadStoredSession();

export function setAuthToken(token: string | null) {
  authToken = token;
  if (typeof localStorage !== 'undefined') {
    if (token) localStorage.setItem('jn_token', token);
    else localStorage.removeItem('jn_token');
  }
}

export function getAuthToken(): string | null {
  return authToken;
}

export function setCurrentUser(user: { id: string; email: string } | null) {
  currentUser = user;
  if (typeof localStorage !== 'undefined') {
    if (user) localStorage.setItem('jn_user', JSON.stringify(user));
    else localStorage.removeItem('jn_user');
  }
}

export function getCurrentUser(): { id: string; email: string } | null {
  return currentUser;
}

async function fetchJson<T>(
  path: string,
  init?: RequestInit,
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(init.headers)) {
      for (const [key, value] of init.headers) {
        headers[key] = value;
      }
    } else {
      Object.assign(headers, init.headers);
    }
  }
  const effectiveToken = token ?? authToken;
  if (effectiveToken) {
    headers.Authorization = `Bearer ${effectiveToken}`;
  }
  console.log('[API] fetchJson', { path, method: init?.method || 'GET', hasToken: !!effectiveToken });
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[API] fetchJson error', { path, status: res.status, statusText: res.statusText, response: text });
    throw new Error(
      `API ${res.status} ${res.statusText}${text ? ': ' + text : ''}`,
    );
  }
  const data = (await res.json()) as T;
  console.log('[API] fetchJson success', { path, data });
  return data;
}

export interface HealthResponse {
  status: string;
  version: string;
  uptime: number;
  database: { connected: boolean; status: string; name?: string };
  ollama: { reachable: boolean; url: string; model?: string };
  timestamp: string;
}

export async function getHealth(): Promise<HealthResponse> {
  return fetchJson<HealthResponse>('/api/health');
}

export interface DemoResponse {
  message: string;
  env?: string;
  version?: string;
  fixtures: {
    stats: { savedJobs: number; searches: number; applications: number };
    sources: string[];
  };
  timestamp: string;
}

export async function getDemo(): Promise<DemoResponse> {
  return fetchJson<DemoResponse>('/api/demo');
}

// ----- Jobs -----

export interface JobLocation {
  city?: string;
  region?: string;
  country?: string;
  remoteType: 'remote' | 'hybrid' | 'onsite' | 'unspecified';
}

export interface JobSalary {
  min?: number;
  max?: number;
  currency?: string;
  period?: 'hour' | 'month' | 'year';
}

export interface JobSourceLink {
  source: string;
  url: string;
  sourceJobId?: string;
  retrievedAt: string;
}

export interface JobProvenance {
  source: string;
  sourceJobId?: string;
  canonicalUrl?: string;
  originalUrl?: string;
  retrievedAt: string;
  retrievalMethod: 'manual' | 'csv' | 'json' | 'url-fetch' | 'scrape';
}

export interface JobView {
  id: string;
  ownerId: string;
  companyId?: string;
  companyName?: string;
  title: string;
  normalizedTitle?: string;
  description?: string;
  descriptionStatus:
    | 'complete'
    | 'partial'
    | 'missing'
    | 'blocked'
    | 'closed';
  location: JobLocation;
  salary?: JobSalary;
  remoteType: 'remote' | 'hybrid' | 'onsite' | 'unspecified';
  seniority?: 'intern' | 'entry' | 'mid' | 'senior' | 'lead' | 'unspecified';
  employmentType?:
    | 'full-time'
    | 'part-time'
    | 'contract'
    | 'temporary'
    | 'freelance'
    | 'unspecified';
  departments: string[];
  sources: JobSourceLink[];
  provenance: JobProvenance;
  qualityStatus: 'good' | 'limited' | 'unsupported';
  isClosed: boolean;
  savedState: 'saved' | 'ignored' | 'viewed' | 'none';
  aiScore?: number;

  // Phase 6A: JobSpy-specific fields (may be unavailable for some sources)
  jobType?: 'fulltime' | 'parttime' | 'contract' | 'internship' | 'temporary';
  workArrangement?: 'remote' | 'hybrid' | 'onsite';
  postedAt?: string;
  emails?: string[];
  // Extracted/derived fields from description (clearly labelled as derived)
  derivedSkills?: string[];
  derivedExperienceYears?: string;
  derivedEducation?: string;
  derivedBenefits?: string[];
  derivedRequirements?: string[];

  createdAt: string;
  updatedAt: string;
}

export interface JobListResult {
  jobs: JobView[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function getJobs(
  filter: JobFilter,
  token?: string | null,
): Promise<JobListResult> {
  const params = new URLSearchParams();
  if (filter.q) params.set('q', filter.q);
  if (filter.savedState) params.set('savedState', filter.savedState);
  if (filter.remoteType) params.set('remoteType', filter.remoteType);
  if (filter.seniority) params.set('seniority', filter.seniority);
  if (filter.employmentType) params.set('employmentType', filter.employmentType);
  if (filter.descriptionStatus) params.set('descriptionStatus', filter.descriptionStatus);
  if (filter.qualityStatus) params.set('qualityStatus', filter.qualityStatus);
  if (filter.isClosed !== undefined) params.set('isClosed', String(filter.isClosed));
  if (filter.sources?.length) {
    filter.sources.forEach((s) => params.append('sources', s));
  }
  if (filter.minSalary !== undefined) params.set('minSalary', String(filter.minSalary));
  if (filter.maxSalary !== undefined) params.set('maxSalary', String(filter.maxSalary));
  if (filter.page) params.set('page', String(filter.page));
  if (filter.limit) params.set('limit', String(filter.limit));
  if (filter.sort) params.set('sort', filter.sort);
  if (filter.order) params.set('order', filter.order);
  return fetchJson<JobListResult>(`/api/jobs?${params.toString()}`, undefined, token);
}

export async function getJob(id: string, token?: string | null): Promise<JobView> {
  return fetchJson<JobView>(`/api/jobs/${encodeURIComponent(id)}`, undefined, token);
}

export async function deleteJob(id: string, token?: string | null): Promise<void> {
  return fetchJson<void>(`/api/jobs/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }, token);
}

export async function deleteAllJobs(token?: string | null): Promise<{ deleted: number }> {
  return fetchJson<{ deleted: number }>('/api/jobs', {
    method: 'DELETE',
  }, token);
}

export interface NewJobInput {
  title: string;
  company?: string;
  description?: string;
  descriptionStatus?: JobView['descriptionStatus'];
  location?: JobLocation;
  salary?: JobSalary;
  remoteType?: JobView['remoteType'];
  seniority?: JobView['seniority'];
  employmentType?: JobView['employmentType'];
  departments?: string[];
  source?: JobView['provenance']['source'];
  sourceJobId?: string;
  canonicalUrl?: string;
  originalUrl?: string;
}

export async function addJob(
  input: NewJobInput,
  token?: string | null,
): Promise<{ job: { id: string; title: string } }> {
  return fetchJson<{ job: { id: string; title: string } }>('/api/jobs', {
    method: 'POST',
    body: JSON.stringify(input),
  }, token);
}

export interface ImportResult {
  imported: number;
  skipped: number;
  total: number;
  errors: string[];
}

export async function importJobs(
  format: 'csv' | 'json' | 'url',
  data: string,
  token?: string | null,
): Promise<ImportResult> {
  return fetchJson<ImportResult>('/api/jobs/import', {
    method: 'POST',
    body: JSON.stringify({ format, data }),
  }, token);
}

export interface UserJobUpdate {
  savedState?: JobView['savedState'];
  notes?: string;
  stage?:
    | 'saved'
    | 'preparing'
    | 'ready_for_review'
    | 'applied'
    | 'assessment'
    | 'interview'
    | 'offer'
    | 'rejected'
    | 'withdrawn';
}

export async function updateUserJob(
  id: string,
  update: UserJobUpdate,
  token?: string | null,
): Promise<{
  savedState: JobView['savedState'];
  notes?: string;
  stage?: UserJobUpdate['stage'];
}> {
  return fetchJson<{
    savedState: JobView['savedState'];
    notes?: string;
    stage?: UserJobUpdate['stage'];
  }>(`/api/jobs/${encodeURIComponent(id)}/save-state`, {
    method: 'PATCH',
    body: JSON.stringify(update),
  }, token);
}

// ----- Documents -----

export interface DocumentView {
  id: string;
  ownerId: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  checksum: string;
  documentType: 'resume' | 'cover-letter';
  textExtractionStatus: 'missing' | 'pending' | 'complete' | 'partial' | 'failed';
  extractedText?: string;
  createdAt: string;
}

// Backend response shape (from Mongoose)
interface RawDocument {
  _id: string;
  ownerId: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  checksum: string;
  documentType: 'resume' | 'cover-letter';
  textExtractionStatus: 'missing' | 'pending' | 'complete' | 'partial' | 'failed';
  extractedText?: string;
  createdAt: string;
  updatedAt: string;
  gridFsFileId: string;
  version: number;
  previousVersions: unknown[];
  __v: number;
}

export interface UploadDocumentResponse {
  id: string;
  originalFilename: string;
  textExtractionStatus: string;
  extractedText?: string;
}

function transformDoc(raw: RawDocument): DocumentView {
  return {
    id: raw._id,
    ownerId: raw.ownerId,
    originalFilename: raw.originalFilename,
    mimeType: raw.mimeType,
    size: raw.size,
    checksum: raw.checksum,
    documentType: raw.documentType,
    textExtractionStatus: raw.textExtractionStatus,
    extractedText: raw.extractedText,
    createdAt: raw.createdAt,
  };
}

export async function getDocuments(): Promise<DocumentView[]> {
  const raw = await fetchJson<RawDocument[]>('/api/documents', undefined, getAuthToken());
  return raw.map(transformDoc);
}

export async function uploadDocument(
  file: File,
  documentType: 'resume' | 'cover-letter',
): Promise<UploadDocumentResponse> {
  const form = new FormData();
  form.append('file', file);
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/api/documents/upload?type=${documentType}`, {
    method: 'POST',
    headers,
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status} ${res.statusText}${text ? ': ' + text : ''}`);
  }
  return (await res.json()) as UploadDocumentResponse;
}

export async function deleteDocument(id: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/api/documents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }, getAuthToken());
}

export function getDocumentPreviewUrl(id: string): string {
  const token = getAuthToken();
  const base = `${API_BASE}/api/documents/${encodeURIComponent(id)}/preview`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

export function getDocumentDownloadUrl(id: string): string {
  const token = getAuthToken();
  const base = `${API_BASE}/api/documents/${encodeURIComponent(id)}/download`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

// ----- Auth -----

export interface Credentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    role?: string;
    accountStatus?: string;
    preferences?: unknown;
  };
}

export async function login(credentials: Credentials): Promise<AuthResponse> {
  return fetchJson<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

export async function register(credentials: Credentials): Promise<AuthResponse> {
  return fetchJson<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

export async function getMe(): Promise<AuthResponse['user']> {
  return fetchJson<AuthResponse['user']>('/api/auth/me', undefined, getAuthToken());
}

export async function logout(refreshToken?: string): Promise<{ ok: boolean }> {
  try {
    return fetchJson<{ ok: boolean }>('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }, getAuthToken());
  } finally {
    setAuthToken(null);
    setCurrentUser(null);
  }
}

// ----- Scrape (Phase 4) -----

export type ScrapeSessionStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'cancelled'
  | 'completed'
  | 'failed';

export type ScrapeEventType =
  | 'started'
  | 'source_started'
  | 'job_discovered'
  | 'job_saved'
  | 'job_skipped'
  | 'progress'
  | 'error'
  | 'cancelled'
  | 'complete';

export interface ScrapeSourceCount {
  source: string;
  fetched: number;
  valid: number;
  matchedFilters: number;
  duplicates: number;
  saved: number;
  skipped: number;
  failed: number;
  missingDescriptions: number;
}

export interface ScrapeSession {
  id: string;
  status: ScrapeSessionStatus;
  sources: string[];
  locations: string[];
  counts: ScrapeSourceCount[];
  totalFetched: number;
  totalSaved: number;
  totalSkipped: number;
  totalFailed: number;
  // Pagination fields for incremental scraping
  nextOffset: number;
  batchLimit: number;
  startedAt: string;
  completedAt?: string;
  cancelledAt?: string;
  cancelRequested: boolean;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScrapeEvent {
  type: ScrapeEventType;
  source?: string;
  message?: string;
  jobId?: string;
  jobTitle?: string;
  counts?: ScrapeSourceCount[];
  progress?: number;
  elapsedMs?: number;
  eta?: string;
  timestamp: string;
}

export interface AdapterDescriptor {
  sourceId: string;
  supportsQuery: boolean;
  supportsCompany: boolean;
  supportsLocation: boolean;
  sourcePolicies: {
    rateLimitMs: number;
    concurrency: number;
    timeoutMs: number;
    respectsRobots: boolean;
    requiresAuth: boolean;
  };
  configured: boolean;
  capabilities?: Partial<Record<string, SourceCapabilityStatus>>;
}

export interface CreateSessionRequest {
  filter?: JobFilter;
  sources: string[];
  locations?: string[];
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function getAdapters(): Promise<{ adapters: AdapterDescriptor[] }> {
  return fetchJson<{ adapters: AdapterDescriptor[] }>('/api/scrape/adapters', undefined, getAuthToken());
}

export async function createScrapeSession(body: CreateSessionRequest): Promise<{
  id: string;
  status: ScrapeSessionStatus;
  sources: string[];
  createdAt: string;
}> {
  return fetchJson(`/api/scrape/sessions`, {
    method: 'POST',
    body: JSON.stringify(body),
  }, getAuthToken());
}

export async function getScrapeSession(id: string): Promise<ScrapeSession> {
  return fetchJson<ScrapeSession>(`/api/scrape/sessions/${encodeURIComponent(id)}`, undefined, getAuthToken());
}

export async function listScrapeSessions(): Promise<{ sessions: ScrapeSession[] }> {
  return fetchJson<{ sessions: ScrapeSession[] }>('/api/scrape/sessions', undefined, getAuthToken());
}

export async function cancelScrapeSession(id: string): Promise<{
  id: string;
  status: ScrapeSessionStatus;
  cancelRequested: boolean;
}> {
  return fetchJson(`/api/scrape/sessions/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
  }, getAuthToken());
}

export async function runScrapeSession(
  id: string,
  sources?: Record<string, { identifier?: string; baseUrl?: string }>
): Promise<{ id: string; status: ScrapeSessionStatus }> {
  return fetchJson(`/api/scrape/sessions/${encodeURIComponent(id)}/run`, {
    method: 'POST',
    body: JSON.stringify({ sources: sources ?? {} }),
  }, getAuthToken());
}

export interface StreamController {
  close(): void;
}

export function scrapeEventStream(
  sessionId: string,
  onEvent: (event: ScrapeEvent) => void,
  onError?: (err: unknown) => void,
): StreamController {
  const controller = new AbortController();
  let closed = false;

  const promise = fetch(`${API_BASE}/api/scrape/sessions/${encodeURIComponent(sessionId)}/events`, {
    headers: {
      ...authHeaders(),
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
    signal: controller.signal,
  });

  promise.then(async (res) => {
    if (closed) return;
    if (!res.ok || !res.body) {
      if (onError) onError(new Error(`SSE stream failed (${res.status})`));
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (!closed) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          if (chunk.startsWith('data: ')) {
            const payload = chunk.slice(6);
            try {
              onEvent(JSON.parse(payload) as ScrapeEvent);
            } catch {
              /* ignore malformed event */
            }
          }
        }
      }
    } catch (err) {
      if (!closed && onError) onError(err);
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* ignore */
      }
    }
  }).catch((err) => {
    if (!closed && onError) onError(err);
  });

  return {
    close: () => {
      closed = true;
      controller.abort();
    },
  };
}

// ----- AI / Phase 5 -----

export type AIProviderId = 'ollama' | 'fcc-proxy';

export interface AIProviderView {
  id: AIProviderId;
  name: string;
  enabled: boolean;
  reachable: boolean;
  latencyMs?: number;
  models: string[];
  error?: string;
}

export async function getProviders(): Promise<{ providers: AIProviderView[] }> {
  return fetchJson<{ providers: AIProviderView[] }>('/api/ai/providers', undefined, getAuthToken());
}

export async function getProviderHealth(
  providerId: AIProviderId,
): Promise<AIProviderView> {
  return fetchJson<AIProviderView>(
    `/api/ai/health/${encodeURIComponent(providerId)}`,
    undefined,
    getAuthToken(),
  );
}

export interface ScoreJobRequest {
  resumeId: string;
  provider?: AIProviderId;
}

export interface MatchReportView {
  id: string;
  jobId: string;
  resumeId: string;
  status: 'pending' | 'complete' | 'failed';
  matchScore: number;
  matchReport: Record<string, unknown>;
  provider: AIProviderId;
  model: string;
  generatedAt: string;
  errorMessage?: string;
}

export async function scoreJob(
  jobId: string,
  body: ScoreJobRequest,
): Promise<MatchReportView> {
  return fetchJson<MatchReportView>(
    `/api/ai/jobs/${encodeURIComponent(jobId)}/score`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    getAuthToken(),
  );
}

export async function getJobMatches(
  jobId: string,
): Promise<{ matches: MatchReportView[] }> {
  return fetchJson<{ matches: MatchReportView[] }>(
    `/api/ai/jobs/${encodeURIComponent(jobId)}/matches`,
    undefined,
    getAuthToken(),
  );
}

// ----- Resumes / Phase 6 -----

export interface ResumeTemplateView {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  isDefault: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CoverLetterTemplateView {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  isDefault: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CanonicalResume {
  basics: {
    name: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    github?: string;
    website?: string;
    summary?: string;
  };
  skills: Array<{
    name: string;
    category?: string;
    level?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
    evidence?: string;
  }>;
  experience: Array<{
    company: string;
    title: string;
    location?: string;
    startDate: string;
    endDate?: string;
    current: boolean;
    description: string;
    highlights: string[];
    technologies: string[];
  }>;
  education: Array<{
    institution: string;
    degree: string;
    fieldOfStudy?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    gpa?: string;
    highlights: string[];
  }>;
  projects: Array<{
    name: string;
    description: string;
    highlights: string[];
    technologies: string[];
    url?: string;
  }>;
  certifications: Array<{
    name: string;
    issuer: string;
    date?: string;
    url?: string;
  }>;
  languages: Array<{
    language: string;
    proficiency?: 'native' | 'fluent' | 'conversational' | 'basic';
  }>;
}

export interface CanonicalCoverLetter {
  header: {
    senderName: string;
    senderEmail: string;
    senderPhone?: string;
    senderLocation?: string;
    recipientName?: string;
    recipientTitle?: string;
    companyName: string;
    companyAddress?: string;
    date: string;
  };
  salutation: string;
  body: string[];
  closing: string;
  signature: string;
  tone: 'professional' | 'enthusiastic' | 'confident' | 'conversational';
  length: 'short' | 'medium' | 'long';
}

export interface TailoredResumeResponse {
  canonicalResume: CanonicalResume;
  htmlPreview: string;
  changes: Array<{
    section: string;
    field: string;
    original?: string;
    proposed: string;
    reason: string;
    isNew: boolean;
  }>;
  warnings: string[];
  generatedDocumentId: string;
}

export interface GeneratedCoverLetterResponse {
  canonicalCoverLetter: CanonicalCoverLetter;
  htmlPreview: string;
  warnings: string[];
  generatedDocumentId: string;
}

export interface TailorResumeInput {
  originalResumeId: string;
  jobId: string;
  matchReportId?: string;
  templateId?: string;
  instructions?: string;
}

export interface GenerateCoverLetterInput {
  originalResumeId: string;
  jobId: string;
  matchReportId?: string;
  templateId?: string;
  tone?: 'professional' | 'enthusiastic' | 'confident' | 'conversational';
  length?: 'short' | 'medium' | 'long';
  recipientName?: string;
  recipientTitle?: string;
  companyAddress?: string;
  instructions?: string;
}

export type GeneratedDocumentType = 'resume' | 'cover-letter';
export type GeneratedDocumentStatus = 'draft' | 'approved' | 'exported';

export interface GeneratedDocumentView {
  id: string;
  ownerId: string;
  jobId: string;
  originalResumeId: string;
  matchReportId?: string;
  type: GeneratedDocumentType;
  status: GeneratedDocumentStatus;
  canonicalContent: CanonicalResume | CanonicalCoverLetter;
  templateId?: string;
  templateName?: string;
  gridFsFileId?: string;
  fileName?: string;
  createdAt: string;
  updatedAt: string;
  exportedAt?: string;
}

export interface ExportOptions {
  format: 'pdf' | 'docx' | 'html';
  margins?: { top: number; right: number; bottom: number; left: number };
  pageSize?: 'A4' | 'Letter';
}

export async function listResumeTemplates(): Promise<ResumeTemplateView[]> {
  return fetchJson<ResumeTemplateView[]>('/api/resumes/templates/resume', undefined, getAuthToken());
}

export async function listCoverLetterTemplates(): Promise<CoverLetterTemplateView[]> {
  return fetchJson<CoverLetterTemplateView[]>('/api/resumes/templates/cover-letter', undefined, getAuthToken());
}

export async function createResumeTemplate(input: {
  name: string;
  description?: string;
  htmlTemplate: string;
  cssTemplate: string;
  isDefault?: boolean;
}): Promise<ResumeTemplateView> {
  return fetchJson<ResumeTemplateView>('/api/resumes/templates/resume', {
    method: 'POST',
    body: JSON.stringify(input),
  }, getAuthToken());
}

export async function createCoverLetterTemplate(input: {
  name: string;
  description?: string;
  htmlTemplate: string;
  cssTemplate: string;
  isDefault?: boolean;
}): Promise<CoverLetterTemplateView> {
  return fetchJson<CoverLetterTemplateView>('/api/resumes/templates/cover-letter', {
    method: 'POST',
    body: JSON.stringify(input),
  }, getAuthToken());
}

export async function updateResumeTemplate(
  id: string,
  input: Partial<{ name: string; description: string; htmlTemplate: string; cssTemplate: string; isDefault: boolean }>,
): Promise<ResumeTemplateView | null> {
  return fetchJson<ResumeTemplateView>(`/api/resumes/templates/resume/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }, getAuthToken());
}

export async function updateCoverLetterTemplate(
  id: string,
  input: Partial<{ name: string; description: string; htmlTemplate: string; cssTemplate: string; isDefault: boolean }>,
): Promise<CoverLetterTemplateView | null> {
  return fetchJson<CoverLetterTemplateView>(`/api/resumes/templates/cover-letter/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }, getAuthToken());
}

export async function deleteResumeTemplate(id: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/api/resumes/templates/resume/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }, getAuthToken());
}

export async function deleteCoverLetterTemplate(id: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/api/resumes/templates/cover-letter/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }, getAuthToken());
}

export async function tailorResume(input: TailorResumeInput): Promise<TailoredResumeResponse> {
  console.log('[API] tailorResume called', { input, token: getAuthToken() ? 'present' : 'MISSING' });
  return fetchJson<TailoredResumeResponse>('/api/resumes/tailor', {
    method: 'POST',
    body: JSON.stringify(input),
  }, getAuthToken());
}

export async function generateCoverLetter(input: GenerateCoverLetterInput): Promise<GeneratedCoverLetterResponse> {
  console.log('[API] generateCoverLetter called', { input, token: getAuthToken() ? 'present' : 'MISSING' });
  return fetchJson<GeneratedCoverLetterResponse>('/api/resumes/cover-letter', {
    method: 'POST',
    body: JSON.stringify(input),
  }, getAuthToken());
}

export async function approveGeneratedDocument(id: string): Promise<GeneratedDocumentView> {
  return fetchJson<GeneratedDocumentView>(`/api/resumes/generated/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
  }, getAuthToken());
}

export async function exportGeneratedDocument(
  id: string,
  options: ExportOptions,
): Promise<{ blob: Blob; fileName: string; contentType: string }> {
  const token = getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/api/resumes/generated/${encodeURIComponent(id)}/export`, {
    method: 'POST',
    headers,
    body: JSON.stringify(options),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status} ${res.statusText}${text ? ': ' + text : ''}`);
  }
  const blob = await res.blob();
  const contentType = res.headers.get('Content-Type') ?? 'application/octet-stream';
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const fileNameMatch = disposition.match(/filename="?([^"]+)"?/);
  const fileName = fileNameMatch ? fileNameMatch[1] : `export.${options.format}`;
  return { blob, fileName, contentType };
}

export async function listGeneratedDocuments(jobId?: string): Promise<GeneratedDocumentView[]> {
  const params = jobId ? `?jobId=${encodeURIComponent(jobId)}` : '';
  return fetchJson<GeneratedDocumentView[]>(`/api/resumes/generated${params}`, undefined, getAuthToken());
}

export async function getGeneratedDocument(id: string): Promise<GeneratedDocumentView> {
  return fetchJson<GeneratedDocumentView>(`/api/resumes/generated/${encodeURIComponent(id)}`, undefined, getAuthToken());
}

export async function deleteGeneratedDocument(id: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/api/resumes/generated/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }, getAuthToken());
}

export { API_BASE };
