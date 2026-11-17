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

dbDescribe('Jobs integration (requires MONGODB_URI)', () => {
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

  it('POST /api/jobs creates a manual job', async () => {
    const { status, body } = await request(
      'POST',
      '/api/jobs',
      {
        title: 'Senior Frontend Engineer',
        company: 'Acme Corp',
        description: 'Build great UIs with React.',
        remoteType: 'remote',
        employmentType: 'full-time',
        seniority: 'senior',
        source: 'manual',
      },
      accessToken,
    );
    expect(status).toBe(201);
    const b = body as { job?: { id?: string; title?: string } };
    expect(b.job?.id).toBeDefined();
    expect(b.job?.title).toBe('Senior Frontend Engineer');
  });

  it('GET /api/jobs lists jobs and supports filtering', async () => {
    const { status, body } = await request('GET', '/api/jobs', undefined, accessToken);
    expect(status).toBe(200);
    const list = body as {
      jobs?: unknown[];
      total?: number;
      page?: number;
      limit?: number;
      totalPages?: number;
    };
    expect(Array.isArray(list.jobs)).toBe(true);
    expect((list.jobs ?? []).length).toBeGreaterThan(0);
    expect(typeof list.total).toBe('number');
    expect(list.total).toBeGreaterThan(0);

    // Filter by savedState should still return the list shape.
    const { status: fStatus, body: fBody } = await request(
      'GET',
      '/api/jobs?savedState=none',
      undefined,
      accessToken,
    );
    expect(fStatus).toBe(200);
    const flist = fBody as { jobs?: unknown[] };
    expect(Array.isArray(flist.jobs)).toBe(true);
  });

  it('GET /api/jobs/:id returns the job detail', async () => {
    const { body } = await request(
      'POST',
      '/api/jobs',
      { title: 'Detail Job', company: 'Detail Co', source: 'manual' },
      accessToken,
    );
    const b = body as { job?: { id?: string } };
    const id = b.job?.id;
    expect(typeof id).toBe('string');

    const { status, body: detail } = await request(
      'GET',
      `/api/jobs/${encodeURIComponent(id as string)}`,
      undefined,
      accessToken,
    );
    expect(status).toBe(200);
    const d = detail as { id?: string; title?: string; companyName?: string };
    expect(d.id).toBe(id);
    expect(d.title).toBe('Detail Job');
    expect(d.companyName).toBe('Detail Co');
  });

  it('POST /api/jobs/import imports CSV and dedups by source+sourceJobId', async () => {
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const csv = `title,company,source,sourceJobId,remoteType,employmentType
CSV Engineer 1,CSV Co,csv,csv-1-${tag},remote,full-time
CSV Engineer 2,CSV Co,csv,csv-2-${tag},hybrid,contract
`;
    const { status, body } = await request(
      'POST',
      '/api/jobs/import',
      { format: 'csv', data: csv },
      accessToken,
    );
    expect(status).toBe(200);
    const r = body as {
      imported?: number;
      skipped?: number;
      total?: number;
      errors?: string[];
    };
    expect(r.imported).toBe(2);
    expect(r.total).toBe(2);

    // Re-importing the same CSV should dedup (skip both).
    const { status: s2, body: b2 } = await request(
      'POST',
      '/api/jobs/import',
      { format: 'csv', data: csv },
      accessToken,
    );
    expect(s2).toBe(200);
    const r2 = b2 as { imported?: number; skipped?: number; total?: number };
    expect(r2.imported).toBe(0);
    expect(r2.skipped).toBe(2);
    expect(r2.total).toBe(2);
  });

  it('PATCH /api/jobs/:id/save-state toggles saved state', async () => {
    const { body } = await request(
      'POST',
      '/api/jobs',
      { title: 'Save Job', company: 'Save Co', source: 'manual' },
      accessToken,
    );
    const b = body as { job?: { id?: string } };
    const id = b.job?.id;
    expect(typeof id).toBe('string');

    const { status, body: updated } = await request(
      'PATCH',
      `/api/jobs/${encodeURIComponent(id as string)}/save-state`,
      { savedState: 'saved' },
      accessToken,
    );
    expect(status).toBe(200);
    const u = updated as { savedState?: string };
    expect(u.savedState).toBe('saved');

    // List filtered by saved should now include it.
    const { body: list } = await request(
      'GET',
      '/api/jobs?savedState=saved',
      undefined,
      accessToken,
    );
    const l = list as { jobs?: Array<{ id?: string }> };
    expect(l.jobs?.some((j) => j.id === id)).toBe(true);
  });

  it('PATCH /api/jobs/:id/note and /:id/stage update user fields', async () => {
    const { body } = await request(
      'POST',
      '/api/jobs',
      { title: 'Note Job', company: 'Note Co', source: 'manual' },
      accessToken,
    );
    const b = body as { job?: { id?: string } };
    const id = b.job?.id;
    expect(typeof id).toBe('string');

    const { status: nStatus } = await request(
      'PATCH',
      `/api/jobs/${encodeURIComponent(id as string)}/note`,
      { notes: 'Great opportunity, follow up next week' },
      accessToken,
    );
    expect(nStatus).toBe(200);

    const { status: sStatus, body: sBody } = await request(
      'PATCH',
      `/api/jobs/${encodeURIComponent(id as string)}/stage`,
      { stage: 'applied' },
      accessToken,
    );
    expect(sStatus).toBe(200);
    const s = sBody as { stage?: string };
    expect(s.stage).toBe('applied');
  });

  it('GET /api/jobs/:id returns 404 for unknown job', async () => {
    const { status } = await request(
      'GET',
      '/api/jobs/000000000000000000000000',
      undefined,
      accessToken,
    );
    expect(status).toBe(404);
  });

  it('POST /api/jobs requires authentication', async () => {
    const { status } = await request(
      'POST',
      '/api/jobs',
      { title: 'No Auth', source: 'manual' },
    );
    expect(status).toBe(401);
  });
});
