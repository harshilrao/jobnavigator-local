import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/auth.middleware';
import {
  listJobs,
  getJob,
  addJob,
  importJobs,
  setUserJob,
  deleteJob,
  type NewJobInput,
  type ImportResult,
  type UserJobUpdate,
} from './job.service';

const jobsRouter = Router();

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

const newJobSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  company: z.string().optional(),
  description: z.string().optional(),
  descriptionStatus: z
    .enum(['complete', 'partial', 'missing', 'blocked', 'closed'])
    .optional(),
  location: z.object({
    city: z.string().optional(),
    region: z.string().optional(),
    country: z.string().optional(),
    remoteType: z
      .enum(['remote', 'hybrid', 'onsite', 'unspecified'])
      .optional(),
  }).optional(),
  salary: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
      currency: z.string().optional(),
      period: z.enum(['hour', 'month', 'year']).optional(),
    })
    .optional(),
  remoteType: z
    .enum(['remote', 'hybrid', 'onsite', 'unspecified'])
    .optional(),
  seniority: z
    .enum(['intern', 'entry', 'mid', 'senior', 'lead', 'unspecified'])
    .optional(),
  employmentType: z
    .enum([
      'full-time',
      'part-time',
      'contract',
      'temporary',
      'freelance',
      'unspecified',
    ])
    .optional(),
  departments: z.array(z.string()).optional(),
  source: z
    .enum([
      'manual',
      'csv',
      'json',
      'url',
      'greenhouse',
      'lever',
      'ashby',
      'smartrecruiters',
      'other',
    ])
    .optional(),
  sourceJobId: z.string().optional(),
  canonicalUrl: z.string().url().optional().nullable(),
  originalUrl: z.string().url().optional().nullable(),
});

const importSchema = z.object({
  format: z.enum(['csv', 'json', 'url']),
  data: z.string().min(1, 'Data is required'),
});

const userJobUpdateSchema = z.object({
  savedState: z
    .enum(['saved', 'ignored', 'viewed', 'none'])
    .optional(),
  notes: z.string().optional(),
  stage: z
    .enum([
      'saved',
      'preparing',
      'ready_for_review',
      'applied',
      'assessment',
      'interview',
      'offer',
      'rejected',
      'withdrawn',
    ])
    .optional(),
});

// GET /api/jobs — list with the shared filter
jobsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const ownerId = (req as { user?: { id: string } }).user!.id;
    const result = await listJobs(ownerId, req.query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:id — detail
jobsRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const ownerId = (req as { user?: { id: string } }).user!.id;
    const job = await getJob(ownerId, req.params.id);
    if (!job) {
      res.status(404).json({ error: 'not_found', message: 'Job not found' });
      return;
    }
    res.status(200).json(job);
  } catch (err) {
    next(err);
  }
});

// POST /api/jobs — manual add
jobsRouter.post(
  '/',
  requireAuth,
  validateBody(newJobSchema),
  async (req, res, next) => {
    try {
      const ownerId = (req as { user?: { id: string } }).user!.id;
      const input = req.body as NewJobInput;
      const doc = await addJob(ownerId, input);
      res.status(201).json({ job: { id: doc.id, title: doc.title } });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/jobs/import — import CSV / JSON / URL
jobsRouter.post(
  '/import',
  requireAuth,
  validateBody(importSchema),
  async (req, res, next) => {
    try {
      const ownerId = (req as { user?: { id: string } }).user!.id;
      const { format, data } = req.body as { format: string; data: string };
      const result: ImportResult = await importJobs(
        ownerId,
        format as 'csv' | 'json' | 'url',
        data,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/jobs/:id/save-state — save / ignore / viewed
jobsRouter.patch(
  '/:id/save-state',
  requireAuth,
  validateBody(userJobUpdateSchema),
  async (req, res, next) => {
    try {
      const ownerId = (req as { user?: { id: string } }).user!.id;
      const updated = await setUserJob(ownerId, req.params.id, req.body as UserJobUpdate);
      if (!updated) {
        res.status(404).json({ error: 'not_found', message: 'Job not found' });
        return;
      }
      res.status(200).json({ savedState: updated.savedState, notes: updated.notes, stage: updated.stage });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/jobs/:id/note — add/edit note
jobsRouter.patch(
  '/:id/note',
  requireAuth,
  validateBody(userJobUpdateSchema),
  async (req, res, next) => {
    try {
      const ownerId = (req as { user?: { id: string } }).user!.id;
      const updated = await setUserJob(ownerId, req.params.id, req.body as UserJobUpdate);
      if (!updated) {
        res.status(404).json({ error: 'not_found', message: 'Job not found' });
        return;
      }
      res.status(200).json({ notes: updated.notes });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/jobs/:id/stage — application stage
jobsRouter.patch(
  '/:id/stage',
  requireAuth,
  validateBody(userJobUpdateSchema),
  async (req, res, next) => {
    try {
      const ownerId = (req as { user?: { id: string } }).user!.id;
      const updated = await setUserJob(ownerId, req.params.id, req.body as UserJobUpdate);
      if (!updated) {
        res.status(404).json({ error: 'not_found', message: 'Job not found' });
        return;
      }
      res.status(200).json({ stage: updated.stage });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/jobs/:id — delete a job
jobsRouter.delete(
  '/:id',
  requireAuth,
  async (req, res, next) => {
    try {
      const ownerId = (req as { user?: { id: string } }).user!.id;
      const deleted = await deleteJob(ownerId, req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'not_found', message: 'Job not found' });
        return;
      }
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

export default jobsRouter;
