import crypto from 'crypto';
import { type RequestHandler } from 'express';

export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const id = (req.headers['x-request-id'] as string) ?? crypto.randomBytes(16).toString('hex');
  res.setHeader('x-request-id', id);
  (req as RequestWithId).requestId = id;
  next();
};

interface RequestWithId {
  requestId?: string;
}
