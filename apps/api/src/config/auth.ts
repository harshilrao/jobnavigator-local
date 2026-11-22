import { createRequire } from 'node:module';
import { sign, verify, type Secret, type SignOptions, type VerifyOptions } from 'jsonwebtoken';

const require = createRequire(import.meta.url);

// jsonwebtoken is CommonJS; use createRequire so ESM typecheck/runtime resolve it.
const jwt = require('jsonwebtoken');

const ACCESS_SECRET: Secret = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me';
const REFRESH_SECRET: Secret = process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me';

export const ACCESS_TTL = '7h';
export const REFRESH_TTL = '7d';

export interface TokenPayload {
  sub: string; // userId
  email: string;
  role?: string;
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL } as SignOptions);
}

export function signRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_TTL } as SignOptions);
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, ACCESS_SECRET, {}) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, REFRESH_SECRET, {}) as TokenPayload;
}

export function hashToken(token: string): string {
  // Deterministic hash so we can look up / revoke a refresh token without storing plaintext.
  const crypto = require('node:crypto');
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function isDev(): boolean {
  return process.env.NODE_ENV === 'development';
}
