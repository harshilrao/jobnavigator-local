import {
  type ScrapeSource,
  type ScrapeSourceAdapter,
  type SourcePolicies,
} from '@jobnavigator/shared';
import { createGreenhouseAdapter } from './greenhouse';
import { createLeverAdapter } from './lever';
import { createAshbyAdapter } from './ashby';
import { createSmartRecruitersAdapter } from './smartrecruiters';

/**
 * Lightweight adapter descriptors for the UI (supportsQuery, etc.).
 * No fetchJobs/fetchDetail — those exist only on full instances.
 */
export interface ScrapeSourceDescriptor {
  sourceId: ScrapeSource;
  supportsQuery: boolean;
  supportsCompany: boolean;
  supportsLocation: boolean;
  sourcePolicies: SourcePolicies;
  configured: boolean; // true if user has supplied a real board/company ID
}

const DESCRIPTORS: Record<ScrapeSource, ScrapeSourceDescriptor> = {
  greenhouse: {
    sourceId: 'greenhouse',
    supportsQuery: true,
    supportsCompany: false,
    supportsLocation: false,
    sourcePolicies: {
      rateLimitMs: 2000,
      concurrency: 2,
      timeoutMs: 15000,
      respectsRobots: true,
      requiresAuth: false,
    },
    configured: false,
  },
  lever: {
    sourceId: 'lever',
    supportsQuery: false,
    supportsCompany: true,
    supportsLocation: false,
    sourcePolicies: {
      rateLimitMs: 2000,
      concurrency: 2,
      timeoutMs: 15000,
      respectsRobots: true,
      requiresAuth: false,
    },
    configured: false,
  },
  ashby: {
    sourceId: 'ashby',
    supportsQuery: false,
    supportsCompany: false,
    supportsLocation: false,
    sourcePolicies: {
      rateLimitMs: 2000,
      concurrency: 2,
      timeoutMs: 15000,
      respectsRobots: true,
      requiresAuth: false,
    },
    configured: false,
  },
  smartrecruiters: {
    sourceId: 'smartrecruiters',
    supportsQuery: false,
    supportsCompany: true,
    supportsLocation: false,
    sourcePolicies: {
      rateLimitMs: 2000,
      concurrency: 2,
      timeoutMs: 15000,
      respectsRobots: true,
      requiresAuth: false,
    },
    configured: false,
  },
  other: {
    sourceId: 'other',
    supportsQuery: false,
    supportsCompany: false,
    supportsLocation: false,
    sourcePolicies: {
      rateLimitMs: 5000,
      concurrency: 1,
      timeoutMs: 30000,
      respectsRobots: true,
      requiresAuth: false,
    },
    configured: false,
  },
};

/**
 * Factory functions that create full adapter instances (with fetchJobs,
 * fetchDetail). The identifier parameter is the employer-specific boardId /
 * companyId / jobBoardId. baseUrl defaults to the provider's public API;
 * pass a local fixture URL for testing.
 */
export function createGreenhouse(boardId: string, baseUrl?: string): ScrapeSourceAdapter {
  return createGreenhouseAdapter(boardId, baseUrl);
}

export function createLever(company: string, baseUrl?: string): ScrapeSourceAdapter {
  return createLeverAdapter(company, baseUrl);
}

export function createAshby(jobBoardId: string, baseUrl?: string): ScrapeSourceAdapter {
  return createAshbyAdapter(jobBoardId, baseUrl);
}

export function createSmartRecruiters(companyId: string, baseUrl?: string): ScrapeSourceAdapter {
  return createSmartRecruitersAdapter(companyId, baseUrl);
}

export function listAdapters(): ScrapeSourceDescriptor[] {
  return Object.values(DESCRIPTORS);
}

export function getAdapterDescriptor(sourceId: ScrapeSource): ScrapeSourceDescriptor | undefined {
  return DESCRIPTORS[sourceId];
}

export function isSourceSupported(sourceId: string): sourceId is ScrapeSource {
  return sourceId in DESCRIPTORS;
}

export function createAdapter(
  sourceId: ScrapeSource,
  identifier: string,
  baseUrl?: string,
): ScrapeSourceAdapter | undefined {
  switch (sourceId) {
    case 'greenhouse':
      return createGreenhouse(identifier, baseUrl);
    case 'lever':
      return createLever(identifier, baseUrl);
    case 'ashby':
      return createAshby(identifier, baseUrl);
    case 'smartrecruiters':
      return createSmartRecruiters(identifier, baseUrl);
    case 'other':
    default:
      return undefined;
  }
}

export type { ScrapeSourceAdapter, ScrapeSource };
