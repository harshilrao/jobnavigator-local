import { z } from 'zod';

/**
 * Shared validation schemas and types used by API and web.
 * Kept dependency-free (only Zod) so both workspaces can import safely.
 */

export const HealthResponseSchema = z.object({
  status: z.string(),
  version: z.string(),
  uptime: z.number(),
  database: z.object({
    connected: z.boolean(),
    status: z.string(),
    name: z.string().optional(),
  }),
  ollama: z.object({
    reachable: z.boolean(),
    url: z.string(),
    model: z.string().optional(),
  }),
  timestamp: z.string(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const DemoResponseSchema = z.object({
  message: z.string(),
  env: z.string().optional(),
  fixtures: z.object({
    stats: z.object({
      savedJobs: z.number(),
      searches: z.number(),
      applications: z.number(),
    }),
    sources: z.array(z.string()),
  }),
  timestamp: z.string(),
});

export type DemoResponse = z.infer<typeof DemoResponseSchema>;

// Version shared by API and web so the UI can render the build version.
export const APP_VERSION = '0.1.0';

export const healthCheck = (input: unknown): HealthResponse => {
  return HealthResponseSchema.parse(input);
};

export const demoCheck = (input: unknown): DemoResponse => {
  return DemoResponseSchema.parse(input);
};

// --- Shared job filter (single source of truth for API + web) ---
export { JobFilterSchema, type JobFilter, type ParsedJobFilter } from './filter';
