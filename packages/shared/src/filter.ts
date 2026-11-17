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
  minSalary: z.coerce.number().optional(),
  maxSalary: z.coerce.number().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sort: z.enum(['createdAt', 'title']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type JobFilter = z.infer<typeof JobFilterSchema>;

export type ParsedJobFilter = z.infer<typeof JobFilterSchema>;
