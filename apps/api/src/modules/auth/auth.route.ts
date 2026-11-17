import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { register, login, refresh, logout, getMe } from './auth.service';
import { requireAuth } from './auth.middleware';
import { rateLimiter } from '../../config/rate-limit';

const authRouter = Router();

const credentialsSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

function validateBody(schema: z.ZodSchema): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const err: Error & { statusCode?: number } = new Error('Validation error');
      err.statusCode = 400;
      // eslint-disable-next-line no-console
      console.error(result.error.flatten().fieldErrors);
      return next(err);
    }
    req.body = result.data;
    next();
  };
}

const publicLimiter = rateLimiter({ windowMs: 60 * 1000, max: 20 });

authRouter.post(
  '/register',
  publicLimiter,
  validateBody(credentialsSchema),
  async (req, res, next) => {
    try {
      const { email, password } = req.body as { email: string; password: string };
      const { accessToken, refreshToken, user } = await register(email, password);
      res.status(201).json({ accessToken, refreshToken, user });
    } catch (err) {
      next(err);
    }
  }
);

authRouter.post(
  '/login',
  publicLimiter,
  validateBody(credentialsSchema),
  async (req, res, next) => {
    try {
      const { email, password } = req.body as { email: string; password: string };
      const { accessToken, refreshToken, user } = await login(email, password);
      res.status(200).json({ accessToken, refreshToken, user });
    } catch (err) {
      next(err);
    }
  }
);

authRouter.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    await logout(refreshToken);
    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (!refreshToken) {
      const err: Error & { statusCode?: number } = new Error('Refresh token required');
      err.statusCode = 400;
      throw err;
    }
    const { accessToken, refreshToken: newRefreshToken, user } = await refresh(refreshToken);
    res.status(200).json({ accessToken, refreshToken: newRefreshToken, user });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await getMe((req as { user?: { id: string } }).user!.id);
    res.status(200).json({
      id: user.id,
      email: user.email,
      role: user.role,
      accountStatus: user.accountStatus,
      preferences: user.preferences,
    });
  } catch (err) {
    next(err);
  }
});

export default authRouter;
