import type { JobFilter } from '@jobnavigator/shared';

export type { JobFilter } from '@jobnavigator/shared';

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
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `API ${res.status} ${res.statusText}${text ? ': ' + text : ''}`,
    );
  }
  return (await res.json()) as T;
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

export { API_BASE };
