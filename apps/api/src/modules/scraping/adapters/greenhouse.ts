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

const GREENHOUSE_SOURCE: ScrapeSource = 'greenhouse';

/**
 * Greenhouse adapter.
 *
 * Greenhouse exposes a public, unauthenticated Harvest API:
 *   GET https://harvest.greenhouse.io/v1/boards/{board_id}/jobs?content=true
 *   GET https://harvest.greenhouse.io/v1/boards/{board_id}/jobs/{job_id}
 *
 * This adapter is configured with a boardId and an optional baseUrl (for
 * fixture/test servers). It does not bypass CAPTCHA, login, or anti-bot
 * defenses. It respects rate limits and timeouts.
 */
export class GreenhouseAdapter implements ScrapeSourceAdapter {
  readonly sourceId = GREENHOUSE_SOURCE as ScrapeSource;
  readonly supportsQuery = true;
  readonly supportsCompany = false; // Greenhouse board is per-employer
  readonly supportsLocation = false; // location filtering done client-side
  readonly sourcePolicies: SourcePolicies = {
    rateLimitMs: 2000,
    concurrency: 2,
    timeoutMs: 15000,
    respectsRobots: true,
    requiresAuth: false,
  };
  readonly configured = true; // Always configured when instantiated with boardId

  private readonly boardId: string;
  private readonly baseUrl: string;
  private readonly limiter: RateLimiter;

  constructor(boardId: string, baseUrl?: string) {
    this.boardId = boardId;
    this.baseUrl = baseUrl ?? 'https://harvest.greenhouse.io/v1';
    this.limiter = new RateLimiter(this.sourcePolicies.rateLimitMs);
  }

  private boardUrl(): string {
    return `${this.baseUrl}/boards/${encodeURIComponent(this.boardId)}/jobs`;
  }

  private jobUrl(jobId: number | string): string {
    return `${this.baseUrl}/boards/${encodeURIComponent(this.boardId)}/jobs/${encodeURIComponent(String(jobId))}`;
  }

  async fetchJobs(params: FetchJobsParams): Promise<FetchJobsResult> {
    await this.limiter.wait();

    // Always create our own AbortController so we can enforce timeouts.
    // Also listen to the caller's signal for cooperative cancellation.
    const controller = new AbortController();
    const signal = controller.signal;

    const externalAbort = () => controller.abort();
    params.signal.addEventListener('abort', externalAbort, { once: true });

    const timeout = setTimeout(() => controller.abort(), this.sourcePolicies.timeoutMs);

    try {
      const url = new URL(this.boardUrl());
      if (params.query) url.searchParams.set('search', params.query);
      if (params.limit) url.searchParams.set('per_page', String(params.limit));
      if (params.offset) url.searchParams.set('page', String(Math.floor(params.offset / (params.limit ?? 50)) + 1));

      const response = await fetch(url.toString(), {
        signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Greenhouse API returned ${response.status}`);
      }

      const data = await response.json();

      const jobs: RawJob[] = (data.jobs ?? []).map((j: unknown) => {
        const job = j as {
          id: number;
          title: string;
          absolute_url: string;
          updated_at: string;
          location?: { name: string } | null;
          departments?: Array<{ name: string }>;
          metadata?: { [key: string]: string };
          content?: string;
        };
        return {
          sourceJobId: String(job.id),
          title: job.title ?? '',
          company: undefined, // board is per-employer; company known from board config
          location: job.location?.name ?? undefined,
          url: job.absolute_url,
          description: job.content ?? undefined,
          descriptionStatus: job.content ? 'complete' : 'missing',
          postedAt: job.updated_at ? new Date(job.updated_at) : undefined,
        };
      });

      return { jobs, hasMore: false };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }
      throw new Error(`Greenhouse fetchJobs failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearTimeout(timeout);
      params.signal.removeEventListener('abort', externalAbort);
    }
  }

  async fetchDetail(sourceJobId: string): Promise<JobDetail | null> {
    await this.limiter.wait();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.sourcePolicies.timeoutMs);

    try {
      const response = await fetch(this.jobUrl(sourceJobId), {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`Greenhouse detail API returned ${response.status}`);
      }

      const data = await response.json();
      const job = data as {
        id: number;
        title: string;
        absolute_url: string;
        content?: string;
        location?: { name: string } | null;
        updated_at?: string;
      };

      return {
        sourceJobId: String(job.id),
        title: job.title ?? '',
        company: undefined,
        description: job.content ?? '',
        descriptionStatus: job.content ? 'complete' : 'missing',
        location: job.location?.name ?? undefined,
        applyUrl: job.absolute_url,
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

export function createGreenhouseAdapter(boardId: string, baseUrl?: string): GreenhouseAdapter {
  return new GreenhouseAdapter(boardId, baseUrl);
}
