import { type RequestHandler, type Request } from 'express';
import { verifyAccessToken } from './auth.service';

export interface AuthenticatedRequest extends Request {
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
    console.log('[Auth] requireAuth', { path: req.path, hasToken: !!token, tokenPrefix: token?.slice(0, 20) });
    if (!token) {
      const err: Error & { statusCode?: number } = new Error('Authentication required');
      err.statusCode = 401;
      return next(err);
    }
    const payload = verifyAccessToken(token);
    console.log('[Auth] Token verified', { sub: payload.sub, email: payload.email });
    (req as AuthenticatedRequest).user = { id: payload.sub, email: payload.email, role: payload.role ?? 'owner' };
    next();
  } catch (e) {
    console.error('[Auth] Token verification failed:', e);
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
