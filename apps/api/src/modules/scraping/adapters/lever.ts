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

const LEVER_SOURCE: ScrapeSource = 'lever';

/**
 * Lever adapter.
 *
 * Lever exposes a public postings API:
 *   GET https://api.lever.co/v0/postings/{company}?mode=json
 *   GET https://api.lever.co/v0/postings/{company}/{job_id}?mode=json
 *
 * Requires a company identifier (the Lever subdomain for the employer).
 * Does not bypass CAPTCHA, login, or anti-bot defenses. Respects rate limits
 * and timeouts.
 */
export class LeverAdapter implements ScrapeSourceAdapter {
  readonly sourceId = LEVER_SOURCE as ScrapeSource;
  readonly supportsQuery = false; // Lever listing returns all postings; filter client-side
  readonly supportsCompany = true;
  readonly supportsLocation = false; // client-side filtering
  readonly sourcePolicies: SourcePolicies = {
    rateLimitMs: 2000,
    concurrency: 2,
    timeoutMs: 15000,
    respectsRobots: true,
    requiresAuth: false,
  };

  private readonly company: string;
  private readonly baseUrl: string;
  private readonly limiter: RateLimiter;

  constructor(company: string, baseUrl?: string) {
    this.company = company;
    this.baseUrl = baseUrl ?? 'https://api.lever.co/v0';
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
      const url = new URL(`${this.baseUrl}/postings/${encodeURIComponent(this.company)}`);
      url.searchParams.set('mode', 'json');

      const response = await fetch(url.toString(), {
        signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Lever API returned ${response.status}`);
      }

      const data = await response.json();

      const jobs: RawJob[] = (Array.isArray(data) ? data : []).map((j: unknown) => {
        const job = j as {
          id: string;
          text: string;
          hostUrl: string;
          createdAt: number;
          categories?: {
            location?: string;
            department?: string;
            team?: string;
          };
          plainTextContent?: string;
          [key: string]: unknown;
        };
        return {
          sourceJobId: job.id,
          title: job.text ?? '',
          company: this.company,
          location: job.categories?.location ?? undefined,
          url: job.hostUrl,
          description: job.plainTextContent ?? undefined,
          descriptionStatus: job.plainTextContent ? 'complete' : 'missing',
          postedAt: job.createdAt ? new Date(job.createdAt) : undefined,
        };
      });

      // Client-side query filter (Lever doesn't support query in listing API).
      const filtered = params.query
        ? jobs.filter(
            (j) =>
              j.title.toLowerCase().includes(params.query!.toLowerCase()) ||
              (j.company ?? '').toLowerCase().includes(params.query!.toLowerCase()),
          )
        : jobs;

      return { jobs: filtered, hasMore: false };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }
      throw new Error(`Lever fetchJobs failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  async fetchDetail(sourceJobId: string): Promise<JobDetail | null> {
    await this.limiter.wait();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.sourcePolicies.timeoutMs);

    try {
      const response = await fetch(
        `${this.baseUrl}/postings/${encodeURIComponent(this.company)}/${encodeURIComponent(sourceJobId)}?mode=json`,
        { signal: controller.signal, headers: { Accept: 'application/json' } },
      );

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`Lever detail API returned ${response.status}`);
      }

      const data = await response.json();
      const job = data as {
        id: string;
        text: string;
        hostUrl: string;
        plainTextContent?: string;
        categories?: { location?: string };
      };

      return {
        sourceJobId: job.id,
        title: job.text ?? '',
        company: this.company,
        description: job.plainTextContent ?? '',
        descriptionStatus: job.plainTextContent ? 'complete' : 'missing',
        location: job.categories?.location ?? undefined,
        applyUrl: job.hostUrl,
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

export function createLeverAdapter(company: string, baseUrl?: string): LeverAdapter {
  return new LeverAdapter(company, baseUrl);
}
