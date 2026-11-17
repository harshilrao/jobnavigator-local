import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../src/app';
import { connectDB, closeDB } from '../src/config/mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const dbDescribe = MONGODB_URI ? describe : describe.skip;

let server: http.Server | undefined;
let baseURL = '';
let accessToken = '';

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

async function registerAndLogin(): Promise<string> {
  const email = randEmail();
  await request('POST', '/api/auth/register', { email, password: 'Str0ng!Pass123' });
  const { body } = await request('POST', '/api/auth/login', { email, password: 'Str0ng!Pass123' });
  const b = body as { accessToken?: string };
  return b.accessToken as string;
}

dbDescribe('Persona integration (requires MONGODB_URI)', () => {
  beforeAll(async () => {
    await connectDB();
    const app = createApp();
    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const addr = server!.address();
    const port = typeof addr === 'string' ? parseInt(addr.split(':').pop() ?? '0', 10) : (addr as { port: number }).port;
    baseURL = `http://127.0.0.1:${port}`;
    accessToken = await registerAndLogin();
  });

  afterAll(async () => {
    const s = server;
    if (s) {
      await new Promise<void>((resolve) => s.close(() => resolve()));
    }
    await closeDB();
  });

  it('GET /persona requires authentication', async () => {
    const { status } = await request('GET', '/api/persona');
    expect(status).toBe(401);
  });

  it('PUT /persona requires authentication', async () => {
    const { status } = await request('PUT', '/api/persona', { fullName: 'A' });
    expect(status).toBe(401);
  });

  it('PUT /persona upserts and GET /persona returns it', async () => {
    const payload = {
      fullName: 'Jane Tester',
      email: 'jane@example.invalid',
      phone: '+1-555-0100',
      locations: [{ city: 'Portland', state: 'OR', country: 'US', remote: true }],
      skills: ['TypeScript', 'React'],
      workAuthorization: 'Citizen',
      eligibilityAnswers: { sponsored: 'no' },
      qaBank: [{ question: 'Q1', answer: 'A1' }],
      summary: 'Experienced engineer.',
    };

    const { status: putStatus, body: putBody } = await request('PUT', '/api/persona', payload, accessToken);
    expect(putStatus).toBe(200);
    const put = putBody as {
      fullName?: string;
      skills?: string[];
      qaBank?: Array<{ question: string; answer: string }>;
      summary?: string;
    };
    expect(put.fullName).toBe('Jane Tester');
    expect(Array.isArray(put.skills)).toBe(true);
    expect(put.skills ?? []).toContain('TypeScript');
    expect(put.summary).toBe('Experienced engineer.');

    const { status: getStatus, body: getBody } = await request('GET', '/api/persona', undefined, accessToken);
    expect(getStatus).toBe(200);
    const got = getBody as { fullName?: string; email?: string };
    expect(got.fullName).toBe('Jane Tester');
    expect(got.email).toBe('jane@example.invalid');
  });

  it('PUT /persona with invalid body returns 400', async () => {
    // email field, when provided, must be a valid email.
    const { status } = await request('PUT', '/api/persona', { email: 'not-an-email' }, accessToken);
    expect(status).toBe(400);
  });
});
