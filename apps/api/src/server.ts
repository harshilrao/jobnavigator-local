import { config as dotenvConfig } from 'dotenv';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

/**
 * Locate the repo-root .env by walking up from this source file.
 * Works both under `tsx` (dev, ESM) and compiled `node dist/` (build).
 */
function findEnvFile(): string {
  let dir = fileURLToPath(import.meta.url);
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return join(process.cwd(), '.env'); // fallback
}

dotenvConfig({ path: findEnvFile(), override: true });

// Debug: confirm MONGODB_URI made it into process.env from .env
// eslint-disable-next-line no-console
console.log('[api] dotenv MONGODB_URI present:', !!process.env.MONGODB_URI);

import { createApp } from './app';
import { connectDB, closeDB } from './config/mongodb';
import { getEnv } from './config/env';

const env = getEnv();

async function start(): Promise<void> {
  await connectDB();
  const app = createApp();

  const server = app.listen(env.PORT, '127.0.0.1', () => {
    // eslint-disable-next-line no-console
    console.log(`[api] listening on http://localhost:${env.PORT}`);
    // eslint-disable-next-line no-console
    console.log(`[api] NODE_ENV=${env.NODE_ENV}`);
    // eslint-disable-next-line no-console
    console.log(`[api] MongoDB: ${process.env.MONGODB_URI ? 'configured' : 'not_configured (set MONGODB_URI in .env)'}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    // eslint-disable-next-line no-console
    console.log(`[api] ${signal} received, shutting down...`);
    return new Promise<void>((resolve) => {
      server.close(() => {
        // eslint-disable-next-line no-console
        console.log('[api] HTTP server closed');
        resolve();
      });
    })
      .then(() => closeDB())
      .then(() => {
        // eslint-disable-next-line no-console
        console.log('[api] shutdown complete');
        process.exit(0);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[api] shutdown error:', err);
        process.exit(1);
      });
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

start().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[api] failed to start:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[api] UNHANDLED REJECTION:', reason);
});
process.on('uncaughtException', (err: Error) => {
  // eslint-disable-next-line no-console
  console.error('[api] UNCAUGHT EXCEPTION:', err);
});
