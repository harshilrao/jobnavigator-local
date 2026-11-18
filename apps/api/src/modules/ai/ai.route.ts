import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware';
import { scoreJob, getJobMatches, getMatchReport, listProviders, getProviderHealth } from './ai.service';
import { type AIProviderId } from './ai.provider';

const aiRouter = Router();

/** GET /api/ai/providers — list providers with health status. */
aiRouter.get('/providers', requireAuth, async (_req, res) => {
  const providers = await listProviders();
  res.status(200).json({ providers });
});

/** GET /api/ai/health/:provider — provider health check. */
aiRouter.get(
  '/health/:provider',
  requireAuth,
  async (req, res, next) => {
    try {
      const providerId = req.params.provider as AIProviderId;
      if (providerId !== 'ollama' && providerId !== 'fcc-proxy') {
        res.status(400).json({ error: 'invalid_provider', message: 'Unknown provider' });
        return;
      }
      const health = await getProviderHealth(providerId);
      res.status(200).json(health);
    } catch (err) {
      next(err);
    }
  },
);

/** POST /api/jobs/:id/score — score a job against a resume. */
aiRouter.post(
  '/jobs/:id/score',
  requireAuth,
  async (req, res, next) => {
    try {
      const ownerId = (req as { user?: { id: string } }).user!.id;
      const { id: jobId } = req.params;
      const { resumeId, provider = 'ollama' } = req.body as {
        resumeId: string;
        provider?: AIProviderId;
      };

      if (!resumeId) {
        res.status(400).json({ error: 'validation', message: 'resumeId is required' });
        return;
      }

      const report = await scoreJob(ownerId, jobId, resumeId, provider);
      res.status(200).json({
        id: report.id,
        status: report.status,
        matchScore: report.matchScore,
        matchReport: report.matchReport,
        provider: report.provider,
        model: report.modelName,
        generatedAt: report.generatedAt,
        errorMessage: report.errorMessage,
      });
    } catch (err) {
      next(err);
    }
  },
);

/** GET /api/jobs/:id/matches — list match reports for a job. */
aiRouter.get(
  '/jobs/:id/matches',
  requireAuth,
  async (req, res, next) => {
    try {
      const ownerId = (req as { user?: { id: string } }).user!.id;
      const { id: jobId } = req.params;
      const matches = await getJobMatches(ownerId, jobId);
      res.status(200).json({
        matches: matches.map((m) => ({
          id: m.id,
          status: m.status,
          matchScore: m.matchScore,
          matchReport: m.matchReport,
          provider: m.provider,
          model: m.modelName,
          resumeId: m.resumeId,
          generatedAt: m.generatedAt,
          errorMessage: m.errorMessage,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

/** GET /api/ai/reports/:id — get a single match report. */
aiRouter.get(
  '/reports/:id',
  requireAuth,
  async (req, res, next) => {
    try {
      const ownerId = (req as { user?: { id: string } }).user!.id;
      const report = await getMatchReport(ownerId, req.params.id);
      if (!report) {
        res.status(404).json({ error: 'not_found', message: 'Match report not found' });
        return;
      }
      res.status(200).json({
        id: report.id,
        jobId: report.jobId,
        resumeId: report.resumeId,
        status: report.status,
        matchScore: report.matchScore,
        matchReport: report.matchReport,
        provider: report.provider,
        model: report.modelName,
        generatedAt: report.generatedAt,
        errorMessage: report.errorMessage,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default aiRouter;
