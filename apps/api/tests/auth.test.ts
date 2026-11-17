import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import mongoose from 'mongoose';
import { createApp } from '../src/app';
import { connectDB, closeDB } from '../src/config/mongodb';
import { User } from '../src/modules/auth/user.model';

const MONGODB_URI = process.env.MONGODB_URI;
const dbDescribe = MONGODB_URI ? describe : describe.skip;

let server: http.Server | undefined;
let baseURL = '';
let accessToken = '';
let refreshToken = '';
let userId = '';

function randEmail(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
}

async function request(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${baseURL}${path}`, init);
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    parsed = undefined;
  }
  return { status: res.status, body: parsed };
}

dbDescribe('Auth integration (requires MONGODB_URI)', () => {
  beforeAll(async () => {
    await connectDB();
    const app = createApp();
    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const addr = server!.address();
    const port = typeof addr === 'string' ? parseInt(addr.split(':').pop() ?? '0', 10) : (addr as { port: number }).port;
    baseURL = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    const s = server;
    if (s) {
      await new Promise<void>((resolve) => s.close(() => resolve()));
    }
    await closeDB();
    if (userId) {
      await User.deleteOne({ _id: new mongoose.Types.ObjectId(userId) }).catch(() => undefined);
    }
  });

  it('registers a new user and returns access + refresh tokens', async () => {
    const email = randEmail();
    const { status, body } = await request('POST', '/api/auth/register', {
      email,
      password: 'Str0ng!Pass123',
    });
    expect(status).toBe(201);
    const b = body as {
      accessToken?: string;
      refreshToken?: string;
      user?: { id?: string; email?: string };
    };
    expect(typeof b.accessToken).toBe('string');
    expect(typeof b.refreshToken).toBe('string');
    expect(b.user?.email).toBe(email);
    expect(typeof b.user?.id).toBe('string');

    accessToken = b.accessToken as string;
    refreshToken = b.refreshToken as string;
    userId = (b.user as { id: string }).id;
  });

  it('rejects duplicate email on register', async () => {
    // Reuse the email from the previous test by fetching it from the DB is not
    // available here; instead register a fresh user, then register again with
    // the same email inside this test.
    const email = randEmail();
    await request('POST', '/api/auth/register', { email, password: 'Str0ng!Pass123' });
    const { status } = await request('POST', '/api/auth/register', {
      email,
      password: 'Str0ng!Pass123',
    });
    expect(status).toBe(409);
  });

  it('rejects short password on register', async () => {
    const { status } = await request('POST', '/api/auth/register', {
      email: randEmail(),
      password: 'short',
    });
    expect(status).toBe(400);
  });

  it('rejects invalid email on register', async () => {
    const { status } = await request('POST', '/api/auth/register', {
      email: 'not-an-email',
      password: 'Str0ng!Pass123',
    });
    expect(status).toBe(400);
  });

  it('logs in with valid credentials', async () => {
    const email = randEmail();
    await request('POST', '/api/auth/register', { email, password: 'Str0ng!Pass123' });
    const { status, body } = await request('POST', '/api/auth/login', {
      email,
      password: 'Str0ng!Pass123',
    });
    expect(status).toBe(200);
    const b = body as { accessToken?: string; refreshToken?: string };
    expect(typeof b.accessToken).toBe('string');
    expect(typeof b.refreshToken).toBe('string');
  });

  it('rejects wrong password on login', async () => {
    const email = randEmail();
    await request('POST', '/api/auth/register', { email, password: 'Str0ng!Pass123' });
    const { status } = await request('POST', '/api/auth/login', {
      email,
      password: 'Wrong!Pass123',
    });
    expect(status).toBe(401);
  });

  it('rejects login for nonexistent user', async () => {
    const { status } = await request('POST', '/api/auth/login', {
      email: randEmail(),
      password: 'Str0ng!Pass123',
    });
    expect(status).toBe(401);
  });

  it('GET /me requires authentication', async () => {
    const { status } = await request('GET', '/api/auth/me');
    expect(status).toBe(401);
  });

  it('GET /me returns the current user with a valid token', async () => {
    expect(accessToken).toBeTruthy();
    const { status, body } = await request('GET', '/api/auth/me', undefined, accessToken);
    expect(status).toBe(200);
    const b = body as { id?: string; email?: string; role?: string };
    expect(b.id).toBe(userId);
    expect(typeof b.email).toBe('string');
    expect(b.role).toBe('owner');
  });

  it('refreshes tokens with a valid refresh token', async () => {
    expect(refreshToken).toBeTruthy();
    const { status, body } = await request('POST', '/api/auth/refresh', {
      refreshToken,
    });
    expect(status).toBe(200);
    const b = body as { accessToken?: string; refreshToken?: string };
    expect(typeof b.accessToken).toBe('string');
    expect(typeof b.refreshToken).toBe('string');
    accessToken = b.accessToken as string;
    refreshToken = b.refreshToken as string;
  });

  it('rejects refresh with an invalid token', async () => {
    const { status } = await request('POST', '/api/auth/refresh', {
      refreshToken: 'not-a-valid-refresh-token',
    });
    expect(status).toBe(401);
  });

  it('POST /logout returns ok', async () => {
    const { status } = await request('POST', '/api/auth/logout', {
      refreshToken,
    });
    expect(status).toBe(200);
  });

  it('enforces rate limiting on public routes', async () => {
    const email = randEmail();
    // 20 requests pass the fixed-window limiter (register may return 201 or 409);
    // the 21st is rejected by the limiter before reaching the handler.
    for (let i = 0; i < 20; i++) {
      await request('POST', '/api/auth/register', {
        email,
        password: 'Str0ng!Pass123',
      });
    }
    const { status } = await request('POST', '/api/auth/register', {
      email,
      password: 'Str0ng!Pass123',
    });
    expect(status).toBe(429);
  });
});
