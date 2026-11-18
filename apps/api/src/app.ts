import express, { type Application } from 'express';
import cors from 'cors';
import { requestIdMiddleware } from './middleware/request-id';
import { errorMiddleware } from './middleware/error';
import { healthRouter } from './modules/health/health.route';
import { demoRouter } from './routes/demo.route';
import authRouter from './modules/auth/auth.route';
import personaRouter from './modules/persona/persona.route';
import documentsRouter from './modules/documents/document.route';
import jobsRouter from './modules/jobs/job.route';
import scrapeRouter from './modules/scraping/scrape.route';
import aiRouter from './modules/ai/ai.route';
import { getEnv } from './config/env';

export function createApp(): Application {
  const env = getEnv();
  const app = express();

  app.set('trust proxy', 1);

  // CORS restricted to the local web origin (credentials enabled for auth).
  app.use(
    cors({
      origin: env.WEB_ORIGIN ?? 'http://localhost:5173',
      credentials: true,
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Every request gets a correlation id echoed back as x-request-id.
  app.use(requestIdMiddleware);

  app.get('/api/_ping', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.use('/api/health', healthRouter);

  // Public auth routes (register/login/logout/refresh/me).
  app.use('/api/auth', authRouter);

  // Protected user routes (require valid access token).
  app.use('/api/persona', personaRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/jobs', jobsRouter);

// Protected scraping routes (require valid access token).
app.use('/api/scrape', scrapeRouter);

// Protected AI routes (require valid access token).
app.use('/api/ai', aiRouter);

  // Development-only demo endpoint (harmless deterministic fixtures).
  if (env.NODE_ENV === 'development') {
    app.use('/api/demo', demoRouter);
  }

  // 404 for anything else under /api.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found', message: 'API route not found' });
  });

  app.use(errorMiddleware);

  return app;
}
