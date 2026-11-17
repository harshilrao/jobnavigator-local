import { Router } from 'express';
import { getHealth } from './health.service';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  const health = await getHealth();
  res.status(200).json(health);
});
