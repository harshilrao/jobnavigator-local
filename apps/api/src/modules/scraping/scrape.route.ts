import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/auth.middleware';
import {
  createScrapeSession,
  getScrapeSession,
  cancelScrapeSession,
  listScrapeSessions,
  getAvailableAdapters,
  subscribeToScrapeSession,
  runScrapeSession,
} from './scrape.service';
import { JobFilterSchema, type JobFilter } from '@jobnavigator/shared';
import type { JobSource } from '../jobs/job.model';

const scrapeRouter = Router();

function validateBody(schema: z.ZodSchema): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const err: Error & { statusCode?: number } = new Error('Validation error');
      err.statusCode = 400;
      console.error(result.error.flatten().fieldErrors);
      return next(err);
    }
    req.body = result.data;
    next();
  };
}

const createSessionSchema = z.object({
  filter: JobFilterSchema.optional(),
  sources: z.array(z.string()).min(1, 'At least one source is required'),
  locations: z.array(z.string()).optional(),
});

// GET /api/scrape/adapters — list available source adapters
scrapeRouter.get('/adapters', requireAuth, (_req, res) => {
  const adapters = getAvailableAdapters();
  res.status(200).json({ adapters });
});

// POST /api/scrape/sessions — create a new scrape session
scrapeRouter.post(
  '/sessions',
  requireAuth,
  validateBody(createSessionSchema),
  async (req, res, next) => {
    try {
      const ownerId = (req as { user?: { id: string } }).user!.id;
      const { filter, sources, locations } = req.body as {
        filter?: JobFilter;
        sources: string[];
        locations?: string[];
      };

      const session = await createScrapeSession(
        ownerId,
        filter ?? { page: 1, limit: 20, sort: 'createdAt', order: 'desc' },
        sources as JobSource[],
        locations ?? [],
      );

      res.status(201).json({
        id: session.id,
        status: session.status,
        sources: session.sources,
        createdAt: session.createdAt,
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/scrape/sessions/:id/run — start a queued scrape session.
// Runs in the background; progress is delivered through SSE events and the
// session status/counts fields, which the client polls or streams.
scrapeRouter.post(
  '/sessions/:id/run',
  requireAuth,
  async (req, res, next) => {
    try {
      const ownerId = (req as { user?: { id: string } }).user!.id;
      const session = await getScrapeSession(ownerId, req.params.id);
      if (!session) {
        res.status(404).json({ error: 'not_found', message: 'Session not found' });
        return;
      }
      if (session.status !== 'queued') {
        res.status(400).json({
          error: 'invalid_status',
          message: `Session is ${session.status}, cannot run`,
        });
        return;
      }

      const body = req.body as {
        sources?: Record<string, { identifier?: string; baseUrl?: string }>;
      };
      const userConfiguredSources = body.sources ?? {};

      // Fire and forget: the long-running loop updates the session document and
      // emits SSE events, which the client observes via GET /sessions/:id and
      // GET /sessions/:id/events.
      void runScrapeSession(
        req.params.id,
        ownerId,
        userConfiguredSources as Record<JobSource, { identifier: string; baseUrl?: string }>,
      ).catch((err) => {
        console.error(`Scrape session ${req.params.id} failed:`, err);
      });

      res.status(202).json({ id: session.id, status: 'running' });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/scrape/sessions/:id — get session status
scrapeRouter.get(
  '/sessions/:id',
  requireAuth,
  async (req, res, next) => {
    try {
      const ownerId = (req as { user?: { id: string } }).user!.id;
      const session = await getScrapeSession(ownerId, req.params.id);
      if (!session) {
        res.status(404).json({ error: 'not_found', message: 'Session not found' });
        return;
      }
      res.status(200).json({
        id: session.id,
        status: session.status,
        sources: session.sources,
        locations: session.locations,
        counts: session.counts,
        totalFetched: session.totalFetched,
        totalSaved: session.totalSaved,
        totalSkipped: session.totalSkipped,
        totalFailed: session.totalFailed,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        cancelledAt: session.cancelledAt,
        cancelRequested: session.cancelRequested,
        errorMessage: session.errorMessage,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/scrape/sessions/:id/events — SSE event stream
scrapeRouter.get(
  '/sessions/:id/events',
  requireAuth,
  async (req, res, next) => {
    try {
      const ownerId = (req as { user?: { id: string } }).user!.id;
      const session = await getScrapeSession(ownerId, req.params.id);
      if (!session) {
        res.status(404).json({ error: 'not_found', message: 'Session not found' });
        return;
      }

      // Verify ownership via session query above already filters by ownerId.

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      // Send heartbeat comment to keep connection alive.
      const heartbeat = setInterval(() => {
        res.write(':heartbeat\n\n');
      }, 15000);

      let unsubscribe: (() => void) | null = null;

      const onClose = () => {
        clearInterval(heartbeat);
        unsubscribe?.();
      };
      res.on('close', onClose);
      res.on('error', onClose);

      unsubscribe = subscribeToScrapeSession(
        req.params.id,
        ownerId,
        (data: unknown) => {
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        },
      );

      // Send initial session state.
      res.write(
        `data: ${JSON.stringify({
          type: 'session_state',
          status: session.status,
          totalFetched: session.totalFetched,
          totalSaved: session.totalSaved,
          totalSkipped: session.totalSkipped,
          totalFailed: session.totalFailed,
        })}\n\n`,
      );
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/scrape/sessions/:id/cancel — cancel a session
scrapeRouter.post(
  '/sessions/:id/cancel',
  requireAuth,
  async (req, res, next) => {
    try {
      const ownerId = (req as { user?: { id: string } }).user!.id;
      const session = await cancelScrapeSession(ownerId, req.params.id);
      if (!session) {
        res.status(404).json({ error: 'not_found', message: 'Session not found' });
        return;
      }
      res.status(200).json({
        id: session.id,
        status: session.status,
        cancelRequested: session.cancelRequested,
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/scrape/sessions — list sessions for owner
scrapeRouter.get(
  '/sessions',
  requireAuth,
  async (req, res, next) => {
    try {
      const ownerId = (req as { user?: { id: string } }).user!.id;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
      const sessions = await listScrapeSessions(ownerId, limit);
      res.status(200).json({
        sessions: sessions.map((s) => ({
          id: s.id,
          status: s.status,
          sources: s.sources,
          locations: s.locations,
          totalFetched: s.totalFetched,
          totalSaved: s.totalSaved,
          totalSkipped: s.totalSkipped,
          totalFailed: s.totalFailed,
          startedAt: s.startedAt,
          completedAt: s.completedAt,
          cancelRequested: s.cancelRequested,
          errorMessage: s.errorMessage,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

export default scrapeRouter;
