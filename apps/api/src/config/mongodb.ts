import mongoose from 'mongoose';
import { getEnv } from './env';

let mongoosePromise: Promise<void> | null = null;

/**
 * Connect to MongoDB. MONGODB_URI is optional in local dev so the API can
 * start and report an honest "not_configured" database status before an
 * Atlas URI is supplied in .env.
 */
export async function connectDB(): Promise<void> {
  const env = getEnv();
  if (!env.MONGODB_URI) {
    return;
  }
  if (mongoosePromise) {
    return mongoosePromise;
  }
  mongoosePromise = mongoose
    .connect(env.MONGODB_URI, { dbName: env.MONGODB_DB_NAME })
    .then(() => {
      // eslint-disable-next-line no-console
      console.log(`[api] MongoDB connected: ${env.MONGODB_DB_NAME}`);
    })
    .catch((err: unknown) => {
      mongoosePromise = null;
      // eslint-disable-next-line no-console
      console.error('[api] MongoDB connection failed:', err);
      throw err;
    });
  return mongoosePromise;
}

export function isDBConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export function getDatabaseName(): string {
  return getEnv().MONGODB_DB_NAME;
}

export async function closeDB(): Promise<void> {
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect errors during shutdown
  }
  mongoosePromise = null;
}
