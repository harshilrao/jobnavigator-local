import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  WEB_ORIGIN: z.string().url().optional(),
  MONGODB_URI: z.string().url().optional(),
  MONGODB_DB_NAME: z.string().default('jobnavigator_local'),
  OLLAMA_BASE_URL: z.string().url().default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: z.string().default('qwen2.5:3b'),
  AI_PROVIDER: z.enum(['ollama', 'fcc-proxy']).default('ollama'),
  FCC_PROXY_ENABLED: z.string().default('false').transform((val) => val === 'true'),
  FCC_BASE_URL: z.string().url().optional(),
  UPLOAD_MAX_BYTES: z.coerce.number().default(10485760),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function loadEnv(): Env {
  // Re-parse when NODE_ENV changes at runtime (e.g. a test flips it to
  // 'development' after modules already bound the vitest default 'test').
  // NODE_ENV is stable in real deployments, so this stays a one-time parse.
  if (_env && _env.NODE_ENV === process.env.NODE_ENV) return _env;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment:', JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
    process.exit(1);
  }
  _env = parsed.data;
  return _env;
}

export function getEnv(): Env {
  return loadEnv();
}
