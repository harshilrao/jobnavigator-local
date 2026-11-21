import {
  type FetchJobsParams,
  type FetchJobsResult,
  type JobDetail,
  type RawJob,
  type ScrapeSource,
  type ScrapeSourceAdapter,
  type SourcePolicies,
} from '@jobnavigator/shared';
import { RateLimiter } from '../adapter';

const ASHBY_SOURCE: ScrapeSource = 'ashby';

/**
 * Ashby adapter.
 *
 * Ashby exposes a public job board API:
 *   POST https://api.ashbyhq.com/postings/job-board
 *   Body: { jobBoardId: string, includeJobs: boolean, includeContent: boolean }
 *
 * Requires a jobBoardId (the employer's Ashby job board identifier).
 * Does not bypass CAPTCHA, login, or anti-bot defenses. Respects rate limits
 * and timeouts.
 */
export class AshbyAdapter implements ScrapeSourceAdapter {
  readonly sourceId = ASHBY_SOURCE as ScrapeSource;
  readonly supportsQuery = false; // client-side filtering
  readonly supportsCompany = false; // board is per-employer
  readonly supportsLocation = false; // client-side filtering
  readonly sourcePolicies: SourcePolicies = {
    rateLimitMs: 2000,
    concurrency: 2,
    timeoutMs: 15000,
    respectsRobots: true,
    requiresAuth: false,
  };
  readonly configured = true; // Always configured when instantiated with jobBoardId

  private readonly jobBoardId: string;
  private readonly baseUrl: string;
  private readonly limiter: RateLimiter;

  constructor(jobBoardId: string, baseUrl?: string) {
    this.jobBoardId = jobBoardId;
    this.baseUrl = baseUrl ?? 'https://api.ashbyhq.com';
    this.limiter = new RateLimiter(this.sourcePolicies.rateLimitMs);
  }

  async fetchJobs(params: FetchJobsParams): Promise<FetchJobsResult> {
    await this.limiter.wait();

    const controller = new AbortController();
    const signal = params.signal ?? controller.signal;
    const timeout = setTimeout(() => {
      if (!signal.aborted) controller.abort();
    }, this.sourcePolicies.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/postings/job-board`, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          jobBoardId: this.jobBoardId,
          includeJobs: true,
          includeContent: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ashby API returned ${response.status}`);
      }

      const data = await response.json();
      const postings = data.jobPostings ?? [];

      const jobs: RawJob[] = postings.map((j: unknown) => {
        const job = j as {
          id: string;
          title: string;
          applicationUrl: string;
          jobLocation?: string | null;
          jobAddressCity?: string | null;
          jobAddressRegion?: string | null;
          jobAddressCountry?: string | null;
          content?: string | null;
          updatedAt?: string;
          [key: string]: unknown;
        };
        return {
          sourceJobId: job.id,
          title: job.title ?? '',
          company: undefined, // known from board config
          location:
            job.jobLocation ??
            [job.jobAddressCity, job.jobAddressRegion, job.jobAddressCountry]
              .filter(Boolean)
              .join(', ') ??
            undefined,
          url: job.applicationUrl,
          description: job.content ?? undefined,
          descriptionStatus: job.content ? 'complete' : 'missing',
          postedAt: job.updatedAt ? new Date(job.updatedAt) : undefined,
        };
      });

      const filtered = params.query
        ? jobs.filter(
            (j) =>
              j.title.toLowerCase().includes(params.query!.toLowerCase()) ||
              (j.location ?? '').toLowerCase().includes(params.query!.toLowerCase()),
          )
        : jobs;

      return { jobs: filtered, hasMore: false };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }
      throw new Error(`Ashby fetchJobs failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  async fetchDetail(sourceJobId: string): Promise<JobDetail | null> {
    // Ashby detail is available via the same job-board endpoint with content.
    // Reuse the listing to find the specific job to avoid an extra API call.
    try {
      const result = await this.fetchJobs({
        signal: new AbortController().signal,
        limit: 1000,
      });
      const job = result.jobs.find((j) => j.sourceJobId === sourceJobId);
      if (!job) return null;

      return {
        sourceJobId: job.sourceJobId,
        title: job.title,
        company: job.company,
        description: job.description ?? '',
        descriptionStatus: job.descriptionStatus ?? 'missing',
        location: job.location,
        applyUrl: job.url,
      };
    } catch {
      return null;
    }
  }
}

export function createAshbyAdapter(jobBoardId: string, baseUrl?: string): AshbyAdapter {
  return new AshbyAdapter(jobBoardId, baseUrl);
}
