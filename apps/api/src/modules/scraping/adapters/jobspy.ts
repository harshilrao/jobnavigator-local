import {
  type ScrapeSourceAdapter,
  type ScrapeSourceDescriptor,
  type SourcePolicies,
  type SourceCapabilityStatus,
  type SourceCapability,
  type FetchJobsParams,
  type FetchJobsResult,
  type RawJob,
  type JobDetail,
  type ScrapeSource,
} from '@jobnavigator/shared';
import { fetchJobsViaJobSpy, type JobSpyWorkerInput, type JobSpyWorkerOutput } from '../jobspy-bridge';

/** JobSpy sources are always "supported" but have platform limitations */
const JOBSPY_SOURCE_POLICIES: SourcePolicies = {
  rateLimitMs: 5000,   // Be polite to job boards
  concurrency: 1,      // JobSpy worker handles one source at a time
  timeoutMs: 120000,   // JobSpy can take a while (especially with descriptions)
  respectsRobots: true,
  requiresAuth: false, // No API key needed, but may hit rate limits
};

// Use const assertions to preserve literal types
const baseJobSpyCapabilities = {
  query: 'supported' as const,
  company: 'unavailable' as const,
  location: 'supported' as const,
  experienceLevel: 'limited' as const,
  workArrangement: 'supported' as const,
  postedWithinHours: 'supported' as const,
  country: 'supported' as const,
  provinceState: 'limited' as const,
  jobType: 'supported' as const,
  easyApply: 'supported' as const,
  radiusKm: 'unavailable' as const,
  seniority: 'limited' as const,
  employmentType: 'limited' as const,
  excludeKeywords: 'manual' as const,
  excludeCompanies: 'manual' as const,
} satisfies SourceCapability;

/** Create descriptor for a JobSpy source with per-filter capabilities */
function createJobSpyDescriptor(sourceId: ScrapeSource): ScrapeSourceDescriptor {
  // Per-source capability tweaks - create a new object with specific overrides
  const capabilities: SourceCapability = { ...baseJobSpyCapabilities };

  // LinkedIn differences
  if (sourceId === 'linkedin') {
    capabilities.easyApply = 'supported';
    capabilities.radiusKm = 'unavailable';
  }
  // Indeed/Glassdoor support country_indeed
  if (sourceId === 'indeed' || sourceId === 'glassdoor') {
    capabilities.country = 'supported';
    capabilities.provinceState = 'supported';
  }
  // ZipRecruiter
  if (sourceId === 'zip_recruiter') {
    capabilities.country = 'supported';
    capabilities.provinceState = 'limited';
  }

  return {
    sourceId,
    supportsQuery: true,
    supportsCompany: false,
    supportsLocation: true,
    sourcePolicies: JOBSPY_SOURCE_POLICIES,
    configured: true, // No configuration needed (uses public scraping)
    capabilities,
  };
}

/** JobSpy source IDs type - only the 4 JobSpy sources */
export type JobSpySource = 'linkedin' | 'indeed' | 'glassdoor' | 'zip_recruiter';

/** Bridge job type from worker output */
type BridgeJob = JobSpyWorkerOutput['jobs'][number];

/** Convert bridge job to RawJob (handle salary type differences) */
function toRawJob(job: BridgeJob): RawJob {
  // job.jobType is string | null | undefined - filter to valid enum
  const validJobTypes = ['fulltime', 'parttime', 'contract', 'internship', 'temporary'] as const;
  type ValidJobType = typeof validJobTypes[number];

  let jobType: ValidJobType | undefined;
  if (job.jobType && validJobTypes.includes(job.jobType as ValidJobType)) {
    jobType = job.jobType as ValidJobType;
  }

  // Compute workArrangement from isRemote if not directly provided
  const workArrangement: 'remote' | 'hybrid' | 'onsite' | undefined =
    job.isRemote === true ? 'remote' : job.isRemote === false ? 'onsite' : undefined;

  // emails is string[] | null | undefined - filter null
  const emails = job.emails && job.emails.length > 0 ? job.emails : undefined;

  return {
    sourceJobId: job.sourceJobId,
    title: job.title,
    company: job.company,
    location: job.location,
    url: job.url,
    description: job.description,
    descriptionStatus: job.descriptionStatus,
    salary: job.salary ? {
      min: job.salary.min,
      max: job.salary.max,
      currency: job.salary.currency,
      period: job.salary.period,
    } : undefined,
    postedAt: job.postedAt ? new Date(job.postedAt) : undefined,
    // Phase 6A: JobSpy-specific fields
    jobType,
    workArrangement,
    isRemote: job.isRemote ?? undefined,
    emails,
  };
}

/** Allowed JobSpy job type values */
type JobSpyJobType = 'fulltime' | 'parttime' | 'contract' | 'internship' | 'temporary';

/** JobSpy adapter - delegates to Python worker via bridge */
export function createJobSpyAdapter(enabledSources: JobSpySource[] = ['linkedin', 'indeed', 'glassdoor', 'zip_recruiter']): ScrapeSourceAdapter {
  const descriptor = createJobSpyDescriptor('linkedin'); // Use first as base

  return {
    ...descriptor,
    async fetchJobs(params: FetchJobsParams): Promise<FetchJobsResult> {
      console.log('[JobSpy Adapter] fetchJobs called with params:', {
        query: params.query,
        location: params.location,
        limit: params.limit,
        offset: params.offset,
        signalAborted: params.signal?.aborted,
      });

      // Map additional filter params from the shared filter schema
      // These come from the createScrapeSession filter object
      const filter = (params as FetchJobsParams & { filter?: Record<string, unknown> }).filter || {};

      console.log('[JobSpy Adapter] Filter snapshot from session:', filter);

      // Map our params to JobSpy worker input
      // Default fetchDescription to true so users get descriptions by default;
      // descriptions add ~10-30s per job on LinkedIn but provide valuable data
      // Use filter.fetchDescription from session snapshot if explicitly set
      const fetchDescription = filter.fetchDescription !== false;
      const workerInput: JobSpyWorkerInput = {
        sources: enabledSources,
        query: params.query,
        location: params.location,
        country: (filter.country as string) || undefined,
        resultsWanted: params.limit ?? 10,
        offset: params.offset ?? 0,
        fetchDescription,
        hoursOld: (filter.postedWithinHours as number) || undefined,
        jobType: (filter.jobType as JobSpyJobType) || undefined,
        remote: filter.workArrangement === 'remote' ? true : filter.workArrangement === 'onsite' ? false : undefined,
        easyApply: (filter.easyApply === true ? true : filter.easyApply === false ? false : undefined) as boolean | undefined,
        isRemote: filter.workArrangement === 'remote' ? true : undefined,
      };

      console.log('[JobSpy Adapter] Worker input being sent to bridge:', workerInput);

      // Call the Python worker via bridge
      const result = await fetchJobsViaJobSpy(workerInput, params.signal);

      console.log('[JobSpy Adapter] Worker output received:', {
        jobCount: result.jobs.length,
        hasMore: result.hasMore,
        firstJob: result.jobs[0] ? {
          sourceJobId: result.jobs[0].sourceJobId,
          title: result.jobs[0].title,
          company: result.jobs[0].company,
          location: result.jobs[0].location,
          url: result.jobs[0].url,
        } : null,
      });

      // Convert bridge jobs to RawJob type
      const rawJobs: RawJob[] = result.jobs.map(toRawJob);

      console.log('[JobSpy Adapter] Converted to RawJob:', {
        rawJobCount: rawJobs.length,
        firstRawJob: rawJobs[0] ? {
          sourceJobId: rawJobs[0].sourceJobId,
          title: rawJobs[0].title,
          company: rawJobs[0].company,
        } : null,
      });

      return {
        jobs: rawJobs,
        hasMore: result.hasMore,
      };
    },
    async fetchDetail(sourceJobId: string): Promise<JobDetail | null> {
      // JobSpy doesn't have a dedicated detail fetch; we'd need to re-fetch
      // For now, return null to indicate not supported
      console.log('[JobSpy Adapter] fetchDetail not implemented, returning null');
      return null;
    },
  };
}

/** Check if a source ID is a JobSpy source */
export function isJobSpySource(sourceId: string): sourceId is ScrapeSource {
  return ['linkedin', 'indeed', 'glassdoor', 'zip_recruiter'].includes(sourceId);
}

/** Get all JobSpy source IDs */
export function getJobSpySources(): ScrapeSource[] {
  return ['linkedin', 'indeed', 'glassdoor', 'zip_recruiter'];
}

/** Get descriptor for a JobSpy source */
export function getJobSpyDescriptor(sourceId: ScrapeSource): ScrapeSourceDescriptor | undefined {
  if (!isJobSpySource(sourceId)) return undefined;
  return createJobSpyDescriptor(sourceId);
}