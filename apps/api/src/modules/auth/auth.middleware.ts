import { type RequestHandler } from 'express';
import { verifyAccessToken } from './auth.service';

export interface AuthenticatedRequest {
  user?: { id: string; email: string; role: string };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  try {
    const authHeader = (req as { headers?: Record<string, string> }).headers?.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      const err: Error & { statusCode?: number } = new Error('Authentication required');
      err.statusCode = 401;
      return next(err);
    }
    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);
    (req as AuthenticatedRequest).user = { id: payload.sub, email: payload.email, role: payload.role ?? 'owner' };
    next();
  } catch {
    const err: Error & { statusCode?: number } = new Error('Invalid or expired access token');
    err.statusCode = 401;
    next(err);
  }
}

export const optionalAuth: RequestHandler = (req, _res, next) => {
  try {
    const authHeader = req.headers?.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const payload = verifyAccessToken(authHeader.slice(7));
      (req as AuthenticatedRequest).user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role ?? 'owner',
      };
    }
  } catch {
    // No user on unauthenticated requests — that's fine.
  }
  next();
};
