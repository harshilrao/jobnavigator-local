import { type ErrorRequestHandler } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  expose?: boolean;
  requestId?: string;
}

export const errorMiddleware: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = (err as AppError).statusCode ?? 500;
  const message = (err as AppError).expose ? err.message : 'Internal server error';
  const body: { error: string; message: string; requestId?: string } = {
    error: status === 500 ? 'internal_error' : 'request_error',
    message,
  };
  if ((err as AppError).requestId) {
    body.requestId = (err as AppError).requestId;
  }
  res.status(status).json(body);
}
