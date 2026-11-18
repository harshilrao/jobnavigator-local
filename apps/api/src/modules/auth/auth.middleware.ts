import { type RequestHandler, type Request } from 'express';
import { verifyAccessToken } from './auth.service';

export interface AuthenticatedRequest {
  user?: { id: string; email: string; role: string };
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers?.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  // Fallback: token in query param (for window.open preview/download)
  if (req.query?.token) return req.query.token as string;
  return null;
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      const err: Error & { statusCode?: number } = new Error('Authentication required');
      err.statusCode = 401;
      return next(err);
    }
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
    const token = extractToken(req);
    if (token) {
      const payload = verifyAccessToken(token);
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
