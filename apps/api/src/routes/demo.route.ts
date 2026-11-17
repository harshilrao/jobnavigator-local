import { Router } from 'express';
import { demoCheck, APP_VERSION } from '@jobnavigator/shared';

export const demoRouter = Router();

demoRouter.get('/', (_req, res) => {
  const body = demoCheck({
    message: 'JobNavigator Local demo (development only — deterministic fixtures)',
    env: process.env.NODE_ENV,
    version: APP_VERSION,
    fixtures: {
      stats: { savedJobs: 0, searches: 0, applications: 0 },
      sources: ['Greenhouse', 'Lever', 'Manual import', 'CSV import'],
    },
    timestamp: new Date().toISOString(),
  });
  res.status(200).json(body);
});
