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

const SMARTRECRUITERS_SOURCE: ScrapeSource = 'smartrecruiters';

/**
 * SmartRecruiters adapter.
 *
 * SmartRecruiters exposes a public jobs API:
 *   GET https://api.smartrecruiters.com/v1/companies/{companyId}/jobs?limit=100&offset=0
 *   GET https://api.smartrecruiters.com/v1/jobs/{jobId}
 *
 * Requires a companyId (the SmartRecruiters company identifier).
 * Does not bypass CAPTCHA, login, or anti-bot defenses. Respects rate limits
 * and timeouts.
 */
export class SmartRecruitersAdapter implements ScrapeSourceAdapter {
  readonly sourceId = SMARTRECRUITERS_SOURCE as ScrapeSource;
  readonly supportsQuery = false; // client-side filtering
  readonly supportsCompany = true;
  readonly supportsLocation = false; // client-side filtering
  readonly sourcePolicies: SourcePolicies = {
    rateLimitMs: 2000,
    concurrency: 2,
    timeoutMs: 15000,
    respectsRobots: true,
    requiresAuth: false,
  };
  readonly configured = true; // Always configured when instantiated with companyId

  private readonly companyId: string;
  private readonly baseUrl: string;
  private readonly limiter: RateLimiter;

  constructor(companyId: string, baseUrl?: string) {
    this.companyId = companyId;
    this.baseUrl = baseUrl ?? 'https://api.smartrecruiters.com/v1';
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
      const url = new URL(
        `${this.baseUrl}/companies/${encodeURIComponent(this.companyId)}/jobs`,
      );
      url.searchParams.set('limit', String(params.limit ?? 100));
      url.searchParams.set('offset', String(params.offset ?? 0));

      const response = await fetch(url.toString(), {
        signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`SmartRecruiters API returned ${response.status}`);
      }

      const data = await response.json();
      const content = data.content ?? [];

      const jobs: RawJob[] = content.map((j: unknown) => {
        const job = j as {
          id: string;
          name: string;
          company?: { name?: string };
          location?: {
            city?: string;
            region?: string;
            countryCode?: string;
          };
          ref?: string;
          jobAd?: {
            sections?: {
              jobDescription?: { text?: string };
            };
          };
          updatedAt?: string;
          [key: string]: unknown;
        };
        return {
          sourceJobId: job.id,
          title: job.name ?? '',
          company: job.company?.name ?? this.companyId,
          location:
            job.location
              ? [job.location.city, job.location.region, job.location.countryCode]
                  .filter(Boolean)
                  .join(', ')
              : undefined,
          url: job.ref,
          description: job.jobAd?.sections?.jobDescription?.text ?? undefined,
          descriptionStatus: job.jobAd?.sections?.jobDescription?.text
            ? 'complete'
            : 'missing',
          postedAt: job.updatedAt ? new Date(job.updatedAt) : undefined,
        };
      });

      const filtered = params.query
        ? jobs.filter(
            (j) =>
              j.title.toLowerCase().includes(params.query!.toLowerCase()) ||
              (j.company ?? '').toLowerCase().includes(params.query!.toLowerCase()) ||
              (j.location ?? '').toLowerCase().includes(params.query!.toLowerCase()),
          )
        : jobs;

      return { jobs: filtered, hasMore: content.length >= (params.limit ?? 100) };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }
      throw new Error(
        `SmartRecruiters fetchJobs failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async fetchDetail(sourceJobId: string): Promise<JobDetail | null> {
    await this.limiter.wait();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.sourcePolicies.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/jobs/${encodeURIComponent(sourceJobId)}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`SmartRecruiters detail API returned ${response.status}`);
      }

      const data = await response.json();
      const job = data as {
        id: string;
        name: string;
        company?: { name?: string };
        location?: { city?: string; region?: string; countryCode?: string };
        jobAd?: {
          sections?: {
            jobDescription?: { text?: string };
          };
        };
        ref?: string;
      };

      return {
        sourceJobId: job.id,
        title: job.name ?? '',
        company: job.company?.name ?? this.companyId,
        description: job.jobAd?.sections?.jobDescription?.text ?? '',
        descriptionStatus: job.jobAd?.sections?.jobDescription?.text ? 'complete' : 'missing',
        location:
          job.location
            ? [job.location.city, job.location.region, job.location.countryCode]
                .filter(Boolean)
                .join(', ')
            : undefined,
        applyUrl: job.ref,
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createSmartRecruitersAdapter(companyId: string, baseUrl?: string): SmartRecruitersAdapter {
  return new SmartRecruitersAdapter(companyId, baseUrl);
}
