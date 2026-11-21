import {
  type ScrapeSource,
  type ScrapeSourceAdapter,
  type SourcePolicies,
  type SourceCapabilityStatus,
  type ScrapeSourceDescriptor,
} from '@jobnavigator/shared';
import { createGreenhouseAdapter } from './greenhouse';
import { createLeverAdapter } from './lever';
import { createAshbyAdapter } from './ashby';
import { createSmartRecruitersAdapter } from './smartrecruiters';
import { createJobSpyAdapter, getJobSpyDescriptor, isJobSpySource, getJobSpySources, type JobSpySource } from './jobspy';

/**
 * Lightweight adapter descriptors for the UI (supportsQuery, etc.).
 * No fetchJobs/fetchDetail — those exist only on full instances.
 * Now includes per-filter capability status for Phase 6A.2 UI.
 */

const S: SourceCapabilityStatus = 'supported';
const L: SourceCapabilityStatus = 'limited';
const U: SourceCapabilityStatus = 'unavailable';
const M: SourceCapabilityStatus = 'manual';

const desc = (
  sourceId: ScrapeSource,
  overrides: Partial<ScrapeSourceDescriptor> = {}
): ScrapeSourceDescriptor => ({
  sourceId,
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
  capabilities: {
    query: U, company: U, location: U,
    experienceLevel: U, workArrangement: U, postedWithinHours: U,
    country: U, provinceState: U, jobType: U,
    easyApply: U, radiusKm: U, seniority: U,
    employmentType: U, excludeKeywords: U, excludeCompanies: U,
  },
  ...overrides,
});

const DESCRIPTORS: Record<ScrapeSource, ScrapeSourceDescriptor> = {
  greenhouse: desc('greenhouse', {
    supportsQuery: true,
    capabilities: {
      query: S, company: L, location: S,
      experienceLevel: L, workArrangement: L, postedWithinHours: L,
      country: U, provinceState: L, jobType: L,
      easyApply: U, radiusKm: U, seniority: S,
      employmentType: S, excludeKeywords: M, excludeCompanies: M,
    },
  }),
  lever: desc('lever', {
    supportsCompany: true,
    capabilities: {
      query: U, company: S, location: L,
      experienceLevel: L, workArrangement: L, postedWithinHours: L,
      country: U, provinceState: L, jobType: L,
      easyApply: U, radiusKm: U, seniority: S,
      employmentType: S, excludeKeywords: M, excludeCompanies: M,
    },
  }),
  ashby: desc('ashby', {
    capabilities: {
      query: U, company: U, location: L,
      experienceLevel: L, workArrangement: L, postedWithinHours: L,
      country: U, provinceState: L, jobType: L,
      easyApply: U, radiusKm: U, seniority: S,
      employmentType: S, excludeKeywords: M, excludeCompanies: M,
    },
  }),
  smartrecruiters: desc('smartrecruiters', {
    supportsCompany: true,
    capabilities: {
      query: U, company: S, location: L,
      experienceLevel: L, workArrangement: L, postedWithinHours: L,
      country: U, provinceState: L, jobType: L,
      easyApply: U, radiusKm: U, seniority: S,
      employmentType: S, excludeKeywords: M, excludeCompanies: M,
    },
  }),
  other: desc('other', {
    sourcePolicies: {
      rateLimitMs: 5000,
      concurrency: 1,
      timeoutMs: 30000,
      respectsRobots: true,
      requiresAuth: false,
    },
    capabilities: {
      query: U, company: U, location: U,
      experienceLevel: U, workArrangement: U, postedWithinHours: U,
      country: U, provinceState: U, jobType: U,
      easyApply: U, radiusKm: U, seniority: U,
      employmentType: U, excludeKeywords: M, excludeCompanies: M,
    },
  }),
  // Phase 6A: JobSpy aggregator sources
  linkedin: getJobSpyDescriptor('linkedin')!,
  indeed: getJobSpyDescriptor('indeed')!,
  glassdoor: getJobSpyDescriptor('glassdoor')!,
  zip_recruiter: getJobSpyDescriptor('zip_recruiter')!,
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
  // JobSpy sources don't need identifier/baseUrl
  if (isJobSpySource(sourceId)) {
    return createJobSpyAdapter([sourceId as JobSpySource]);
  }
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

export type { ScrapeSourceAdapter, ScrapeSource, ScrapeSourceDescriptor };
export { createJobSpyAdapter, isJobSpySource, getJobSpySources, getJobSpyDescriptor } from './jobspy';
