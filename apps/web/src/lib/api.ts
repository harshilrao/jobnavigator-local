const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:3000';

/** Bearer token held in memory; set from localStorage by the page that needs auth. */
let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
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

export interface JobFilter {
  q?: string;
  savedState?: 'saved' | 'ignored' | 'viewed' | 'none';
  remoteType?: 'remote' | 'hybrid' | 'onsite' | 'unspecified';
  seniority?: 'intern' | 'entry' | 'mid' | 'senior' | 'lead' | 'unspecified';
  employmentType?:
    | 'full-time'
    | 'part-time'
    | 'contract'
    | 'temporary'
    | 'freelance'
    | 'unspecified';
  descriptionStatus?: 'complete' | 'partial' | 'missing' | 'blocked' | 'closed';
  qualityStatus?: 'good' | 'limited' | 'unsupported';
  isClosed?: boolean;
  sources?: string[];
  minSalary?: number;
  maxSalary?: number;
  page?: number;
  limit?: number;
  sort?: 'createdAt' | 'title';
  order?: 'asc' | 'desc';
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

export { API_BASE };
