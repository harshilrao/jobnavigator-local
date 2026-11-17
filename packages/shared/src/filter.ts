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
  seniority: z
    .enum(['intern', 'entry', 'mid', 'senior', 'lead', 'unspecified'])
    .optional(),
  employmentType: z
    .enum([
      'full-time',
      'part-time',
      'contract',
      'temporary',
      'freelance',
      'unspecified',
    ])
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
});

export type JobFilter = z.infer<typeof JobFilterSchema>;

export type ParsedJobFilter = z.infer<typeof JobFilterSchema>;

/** Provider adapter contract used by Phase 4 scraping. */
export const ScrapeSourceSchema = z.enum([
  'greenhouse',
  'lever',
  'ashby',
  'smartrecruiters',
  'other',
]);

export type ScrapeSource = z.infer<typeof ScrapeSourceSchema>;

export interface SourcePolicies {
  rateLimitMs: number;
  concurrency: number;
  timeoutMs: number;
  respectsRobots: boolean;
  requiresAuth: boolean;
}

/** Lightweight descriptor for UI listing (no fetch methods). */
export interface ScrapeSourceDescriptor {
  sourceId: ScrapeSource;
  supportsQuery: boolean;
  supportsCompany: boolean;
  supportsLocation: boolean;
  sourcePolicies: SourcePolicies;
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
