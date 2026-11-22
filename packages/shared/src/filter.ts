import { z } from 'zod';

/**
 * Single, shared job-filter schema used by both the API (to build MongoDB
 * queries) and the web UI (to drive the Jobs table filters). Keeping one
 * source of truth means the filter users see is exactly the filter applied.
 */
export const JobFilterSchema = z.object({
  q: z.string().trim().optional(),
  savedState: z
    .enum(['saved', 'ignored', 'viewed', 'none'])
    .optional(),
  remoteType: z
    .enum(['remote', 'hybrid', 'onsite', 'unspecified'])
    .optional(),
  descriptionStatus: z
    .enum(['complete', 'partial', 'missing', 'blocked', 'closed'])
    .optional(),
  qualityStatus: z
    .enum(['good', 'limited', 'unsupported'])
    .optional(),
  isClosed: z.boolean().optional(),
  sources: z.array(z.string()).optional(),
  locations: z.array(z.string()).optional(),
  minSalary: z.coerce.number().optional(),
  maxSalary: z.coerce.number().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sort: z.enum(['createdAt', 'title']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  // Phase 6A: JobSpy-specific filter extensions
  experienceLevel: z.enum(['0-1', '1-2', '2-3', '3-5', '5+']).optional(),
  workArrangement: z.enum(['remote', 'hybrid', 'onsite']).optional(),
  postedWithinHours: z.number().int().positive().optional(),
  country: z.enum(['USA', 'CAN', 'IND']).optional(),
  provinceState: z.string().optional(), // Province/state for CA/US/IN
  city: z.string().optional(), // City for USA/CAN/IND
  jobType: z.enum(['fulltime', 'parttime', 'contract', 'internship', 'temporary']).optional(),
  easyApply: z.boolean().optional(),
  radiusKm: z.number().int().positive().optional(),
  // Exclusion terms (local post-filter, not source-native)
  excludeKeywords: z.string().optional(),
  excludeCompanies: z.string().optional(),
  // Seniority (for ATS sources, separate from JobSpy experienceLevel)
  seniority: z.enum(['intern', 'entry', 'mid', 'senior', 'lead', 'unspecified']).optional(),
  // Employment type (for ATS sources, separate from JobSpy jobType)
  employmentType: z.enum(['full-time', 'part-time', 'contract', 'temporary', 'freelance', 'unspecified']).optional(),
  // Fetch full job descriptions (slower, default false)
  fetchDescription: z.boolean().optional(),
});

export type JobFilter = z.infer<typeof JobFilterSchema>;

export type ParsedJobFilter = z.infer<typeof JobFilterSchema>;

/** Provider adapter contract used by Phase 4 scraping + Phase 6A JobSpy sources. */
export const ScrapeSourceSchema = z.enum([
  // Phase 4 ATS adapters
  'greenhouse',
  'lever',
  'ashby',
  'smartrecruiters',
  'other',
  // Phase 6A JobSpy aggregator sources
  'linkedin',
  'indeed',
  'glassdoor',
  'zip_recruiter',
]);

export type ScrapeSource = z.infer<typeof ScrapeSourceSchema>;

/** JobSpy-specific filter extensions */
export const JobSpyFilterSchema = z.object({
  // Experience level bands
  experienceLevel: z.enum(['0-1', '1-2', '2-3', '3-5', '5+']).optional(),
  // Work arrangement (JobSpy specific)
  workArrangement: z.enum(['remote', 'hybrid', 'onsite']).optional(),
  // Date posted range (JobSpy uses hours_old)
  postedWithinHours: z.number().int().positive().optional(),
  // Country for Indeed/Glassdoor (limited to USA, CAN, IND)
  country: z.enum(['USA', 'CAN', 'IND']).optional(),
  // Province/State
  provinceState: z.string().optional(),
  // City
  city: z.string().optional(),
  // Job type
  jobType: z.enum(['fulltime', 'parttime', 'contract', 'internship', 'temporary']).optional(),
  // Easy apply filter
  easyApply: z.boolean().optional(),
  // Radius (km) - only if reliable
  radiusKm: z.number().int().positive().optional(),
  // Fetch full job descriptions (slower, default false)
  fetchDescription: z.boolean().optional(),
});
export type JobSpyFilter = z.infer<typeof JobSpyFilterSchema>;

export interface SourcePolicies {
  rateLimitMs: number;
  concurrency: number;
  timeoutMs: number;
  respectsRobots: boolean;
  requiresAuth: boolean;
}

/** Per-source capability status for UI display */
export type SourceCapabilityStatus = 'supported' | 'limited' | 'unavailable' | 'manual';

export interface SourceCapability {
  query: SourceCapabilityStatus;
  company: SourceCapabilityStatus;
  location: SourceCapabilityStatus;
  experienceLevel: SourceCapabilityStatus;
  workArrangement: SourceCapabilityStatus;
  postedWithinHours: SourceCapabilityStatus;
  country: SourceCapabilityStatus;
  provinceState: SourceCapabilityStatus;
  jobType: SourceCapabilityStatus;
  easyApply: SourceCapabilityStatus;
  radiusKm: SourceCapabilityStatus;
  seniority: SourceCapabilityStatus;
  employmentType: SourceCapabilityStatus;
  excludeKeywords: SourceCapabilityStatus;
  excludeCompanies: SourceCapabilityStatus;
}

/** Lightweight descriptor for UI listing (no fetch methods). */
export interface ScrapeSourceDescriptor {
  sourceId: ScrapeSource;
  supportsQuery: boolean;
  supportsCompany: boolean;
  supportsLocation: boolean;
  sourcePolicies: SourcePolicies;
  configured: boolean; // true if user has supplied a real board/company ID
  capabilities?: Partial<SourceCapability>; // Per-filter capability for UI
}

/** Full provider adapter contract (includes fetchJobs/fetchDetail). */
export interface ScrapeSourceAdapter extends ScrapeSourceDescriptor {
  fetchJobs(params: FetchJobsParams): Promise<FetchJobsResult>;
  fetchDetail(sourceJobId: string): Promise<JobDetail | null>;
}

export interface FetchJobsParams {
  query?: string;
  company?: string;
  location?: string;
  limit?: number;
  offset?: number;
  signal: AbortSignal;
  /** Full filter snapshot from the scrape session (for advanced source-specific filters) */
  filter?: Record<string, unknown>;
}

export interface RawJob {
  sourceJobId: string;
  title: string;
  company?: string;
  location?: string;
  url: string;
  description?: string;
  descriptionStatus?: 'complete' | 'partial' | 'missing' | 'blocked' | 'closed';
  salary?: { min?: number; max?: number; currency?: string; period?: 'hour' | 'month' | 'year' };
  postedAt?: Date;

  // Phase 6A: JobSpy-specific fields (may be unavailable for some sources)
  jobType?: 'fulltime' | 'parttime' | 'contract' | 'internship' | 'temporary';
  workArrangement?: 'remote' | 'hybrid' | 'onsite';
  isRemote?: boolean;
  emails?: string[];
}

export interface JobDetail {
  sourceJobId: string;
  title: string;
  company?: string;
  description: string;
  descriptionStatus: 'complete' | 'partial' | 'missing' | 'blocked' | 'closed';
  location?: string;
  salary?: { min?: number; max?: number; currency?: string; period?: 'hour' | 'month' | 'year' };
  applyUrl?: string;
}

export interface FetchJobsResult {
  jobs: RawJob[];
  hasMore: boolean;
}
