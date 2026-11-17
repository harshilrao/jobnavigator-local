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
  // Read MONGODB_URI directly from process.env as a fallback, since dotenv
  // with override:true should have populated it from .env before this runs.
  const uri = env.MONGODB_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error(
      '[api] MONGODB_URI is not set. Check .env at repo root. NODE_ENV:',
      env.NODE_ENV,
    );
    return;
  }
  if (mongoosePromise) {
    return mongoosePromise;
  }
  mongoosePromise = mongoose
    .connect(uri, { dbName: env.MONGODB_DB_NAME })
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
