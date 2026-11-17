import { config as dotenvConfig } from 'dotenv';
import { join } from 'node:path';
dotenvConfig({ path: join(__dirname, '..', '..', '..', '.env') });

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
    console.log(`[api] MongoDB: ${env.MONGODB_URI ? 'configured' : 'not_configured (set MONGODB_URI in .env)'}`);
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
