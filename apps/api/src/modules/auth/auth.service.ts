import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');

import { type UserDoc, User } from './user.model';
import { RefreshToken, hashToken } from './refreshToken.model';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  ACCESS_TTL,
  REFRESH_TTL,
} from '../../config/auth';

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(candidate: string, hash: string): Promise<boolean> {
  return bcrypt.compare(candidate, hash);
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: string };
}

/**
 * Register the first owner. Returns tokens on success.
 * Duplicate email is rejected.
 */
export async function register(email: string, password: string): Promise<AuthResult> {
  const normalized = email.toLowerCase().trim();
  const existing = await User.findOne({ email: normalized });
  if (existing) {
    const err: Error & { statusCode?: number } = new Error('Email already registered');
    err.statusCode = 409;
    throw err;
  }

  const passwordHash = await hashPassword(password);
  const user = await User.create({
    email: normalized,
    passwordHash,
    role: 'owner',
    accountStatus: 'active',
  });

  return issueTokens(user);
}

/**
 * Login with email + password. Returns rotated tokens.
 */
export async function login(email: string, password: string): Promise<AuthResult> {
  const normalized = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalized });
  if (!user) {
    const err: Error & { statusCode?: number } = new Error('Invalid credentials');
    err.statusCode = 401;
    throw err;
  }
  if (user.accountStatus !== 'active') {
    const err: Error & { statusCode?: number } = new Error('Account not active');
    err.statusCode = 403;
    throw err;
  }
  const ok = await comparePassword(password, user.passwordHash);
  if (!ok) {
    const err: Error & { statusCode?: number } = new Error('Invalid credentials');
    err.statusCode = 401;
    throw err;
  }
  return issueTokens(user);
}

async function issueTokens(user: UserDoc): Promise<AuthResult> {
  const payload: { sub: string; email: string } = { sub: user._id.toString(), email: user.email };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + parseMs(REFRESH_TTL));

  await RefreshToken.create({
    userId: user._id,
    tokenHash,
    expiresAt,
    revoked: false,
  });

  return { accessToken, refreshToken, user: { id: user._id.toString(), email: user.email, role: user.role } };
}

/**
 * Rotate refresh token: verify current refresh token, revoke it (record replacedBy),
 * issue a new access + refresh token pair.
 */
export async function refresh(refreshToken: string): Promise<AuthResult> {
  let payload: { sub: string; email: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    const err: Error & { statusCode?: number } = new Error('Invalid or expired refresh token');
    err.statusCode = 401;
    throw err;
  }

  const tokenHash = hashToken(refreshToken);
  const record = await RefreshToken.findOne({ userId: payload.sub, tokenHash, revoked: false });
  if (!record) {
    // Token not found or already revoked -> possible theft. Revoke all tokens for this user.
    await RefreshToken.updateMany({ userId: payload.sub, revoked: false }, { revoked: true });
    const err: Error & { statusCode?: number } = new Error('Refresh token revoked or invalid');
    err.statusCode = 401;
    throw err;
  }

  // Rotate: revoke current, issue new.
  record.revoked = true;
  record.replacedBy = 'rotated';
  await record.save();

  const user = await User.findById(payload.sub);
  if (!user || user.accountStatus !== 'active') {
    const err: Error & { statusCode?: number } = new Error('Account not active');
    err.statusCode = 403;
    throw err;
  }

  return issueTokens(user);
}

export async function logout(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  try {
    const payload = verifyRefreshToken(refreshToken);
    const tokenHash = hashToken(refreshToken);
    await RefreshToken.updateOne(
      { userId: payload.sub, tokenHash, revoked: false },
      { revoked: true }
    );
  } catch {
    // Best-effort revocation; ignore invalid tokens on logout.
  }
}

export async function getMe(userId: string): Promise<UserDoc> {
  const user = await User.findById(userId).select('-passwordHash');
  if (!user) {
    const err: Error & { statusCode?: number } = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  if (user.accountStatus !== 'active') {
    const err: Error & { statusCode?: number } = new Error('Account not active');
    err.statusCode = 403;
    throw err;
  }
  return user;
}

function parseMs(ttl: string): number {
  const match = /^(\d+)([mhd])$/.exec(ttl);
  if (!match) return 1000 * 60 * 15;
  const val = parseInt(match[1], 10);
  const unit = match[2];
  const mult = unit === 'm' ? 1000 * 60 : unit === 'h' ? 1000 * 60 * 60 : 1000 * 60 * 60 * 24;
  return val * mult;
}

export { verifyAccessToken };
