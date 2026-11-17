import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/auth.middleware';
import { upsertPersona, getPersona } from './persona.service';

const personaRouter = Router();

const personaSchema = z.object({
  fullName: z.string().trim().optional(),
  email: z.string().email().optional(),
  phone: z.string().trim().optional(),
  locations: z.array(z.any()).optional(),
  skills: z.array(z.string()).optional(),
  workAuthorization: z.string().optional(),
  eligibilityAnswers: z.record(z.string()).optional(),
  qaBank: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
  summary: z.string().optional(),
});

personaRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const ownerId = (req as { user?: { id: string } }).user!.id;
    const persona = await getPersona(ownerId);
    res.status(200).json(persona ?? null);
  } catch (err) {
    next(err);
  }
});

personaRouter.put('/', requireAuth, async (req, res, next) => {
  try {
    const ownerId = (req as { user?: { id: string } }).user!.id;
    const result = personaSchema.safeParse(req.body);
    if (!result.success) {
      const err: Error & { statusCode?: number } = new Error('Validation error');
      err.statusCode = 400;
      return next(err);
    }
    const persona = await upsertPersona(ownerId, result.data);
    res.status(200).json(persona);
  } catch (err) {
    next(err);
  }
});

export default personaRouter;
