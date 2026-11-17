import { type RequestHandler } from 'express';

/**
 * Simple in-memory fixed-window rate limiter for public auth routes.
 * Keyed by identifier (IP or email). Not shared across server processes,
 * which is acceptable for the single-process local dev MVP.
 */
interface Window {
  count: number;
  resetAt: number;
}

const stores = new Map<string, Window>();

export function rateLimiter(options: {
  windowMs: number;
  max: number;
}): RequestHandler {
  const { windowMs, max } = options;
  return (req, _res, next) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const window = stores.get(key);
    if (!window || now > window.resetAt) {
      stores.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    window.count += 1;
    if (window.count > max) {
      const err: Error & { statusCode?: number } = new Error('Too many requests');
      err.statusCode = 429;
      return next(err);
    }
    next();
  };
}
