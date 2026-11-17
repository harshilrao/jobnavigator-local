import type {
  ScrapeSource,
  ScrapeSourceAdapter,
  SourcePolicies,
} from '@jobnavigator/shared';

/**
 * Base policies for a polite, respectful scraper.
 * Concurrency cap of 2 per source, 2 second rate limit, 10 second timeout.
 */
export const DEFAULT_POLICIES: SourcePolicies = {
  rateLimitMs: 2000,
  concurrency: 2,
  timeoutMs: 10000,
  respectsRobots: true,
  requiresAuth: false,
};

/**
 * Sleep helper for polite backoff between requests.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Rate limiter: ensures at least `rateLimitMs` between calls.
 * Call before each HTTP request to the same source.
 */
export class RateLimiter {
  private lastCall = 0;
  constructor(private readonly minIntervalMs: number) {}
  async wait(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastCall;
    if (elapsed < this.minIntervalMs) {
      await sleep(this.minIntervalMs - elapsed);
    }
    this.lastCall = Date.now();
  }
}

/**
 * Adapter registry: maps sourceId -> adapter instance.
 * Only adapters that are actually implemented and tested should be registered.
 */
const adapters = new Map<ScrapeSource, ScrapeSourceAdapter>();

export function registerAdapter(adapter: ScrapeSourceAdapter): void {
  adapters.set(adapter.sourceId, adapter);
}

export function getAdapter(sourceId: ScrapeSource): ScrapeSourceAdapter | undefined {
  return adapters.get(sourceId);
}

export function listAdapters(): ScrapeSourceAdapter[] {
  return Array.from(adapters.values());
}

export function isSourceSupported(sourceId: string): sourceId is ScrapeSource {
  return adapters.has(sourceId as ScrapeSource);
}
