import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { connectDB, closeDB } from '../src/config/mongodb';
import {
  startFixtureServers,
  stopFixtureServers,
} from '../src/modules/scraping/fixtures/ats-server';
import {
  createAdapter,
  listAdapters,
  isSourceSupported,
  type ScrapeSourceAdapter,
} from '../src/modules/scraping/adapters';
import {
  getScrapeSession,
  cancelScrapeSession,
  runScrapeSession,
  getScrapeEvents,
} from '../src/modules/scraping/scrape.service';
import { Job } from '../src/modules/jobs/job.model';
import { ScrapeSession } from '../src/modules/scraping/scrape.model';

const MONGODB_URI = process.env.MONGODB_URI;
const dbDescribe = MONGODB_URI ? describe : describe.skip;

let fixtureServers: { port: number; server: import('http').Server }[] = [];
let accessToken = '';
let ownerId = '';

async function registerAndLogin(baseURL: string): Promise<{ token: string; userId: string }> {
  const email = `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
  await fetch(`${baseURL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Str0ng!Pass123' }),
  });
  const res = await fetch(`${baseURL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Str0ng!Pass123' }),
  });
  const body = await res.json();
  return { token: body.accessToken as string, userId: (body as { user?: { id?: string } }).user?.id as string };
}

async function request(
  baseURL: string,
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${baseURL}${path}`, init);
  let parsed: unknown;
  try { parsed = await res.json(); } catch { parsed = undefined; }
  return { status: res.status, body: parsed };
}

dbDescribe('Phase 4: Scraping adapters (fixture servers)', () => {
  beforeAll(async () => {
    fixtureServers = startFixtureServers();
    await connectDB();
  });

  afterAll(async () => {
    stopFixtureServers(fixtureServers);
    await closeDB();
  });

  it('lists available adapters', () => {
    const adapters = listAdapters();
    expect(adapters.length).toBeGreaterThan(0);
    const sourceIds = adapters.map((a) => a.sourceId);
    expect(sourceIds).toContain('greenhouse');
    expect(sourceIds).toContain('lever');
    expect(sourceIds).toContain('ashby');
    expect(sourceIds).toContain('smartrecruiters');
    for (const a of adapters) {
      expect(typeof a.sourcePolicies.rateLimitMs).toBe('number');
      expect(typeof a.sourcePolicies.concurrency).toBe('number');
      expect(typeof a.sourcePolicies.timeoutMs).toBe('number');
    }
  });

  it('reports source support', () => {
    // Phase 4 ATS adapters
    expect(isSourceSupported('greenhouse')).toBe(true);
    expect(isSourceSupported('lever')).toBe(true);
    expect(isSourceSupported('ashby')).toBe(true);
    expect(isSourceSupported('smartrecruiters')).toBe(true);
    // Phase 6A JobSpy sources (enabled when venv is set up)
    expect(isSourceSupported('linkedin')).toBe(true);
    expect(isSourceSupported('indeed')).toBe(true);
    expect(isSourceSupported('glassdoor')).toBe(true);
    expect(isSourceSupported('zip_recruiter')).toBe(true);
  });

  it('creates a Greenhouse adapter pointing at fixture server', () => {
    const adapter = createAdapter(
      'greenhouse',
      'acme',
      'http://127.0.0.1:9001',
    ) as ScrapeSourceAdapter;
    expect(adapter.sourceId).toBe('greenhouse');
    expect(adapter.supportsQuery).toBe(true);
    expect(typeof adapter.fetchJobs).toBe('function');
    expect(typeof adapter.fetchDetail).toBe('function');
  });

  it('fetches Greenhouse jobs from fixture', async () => {
    const adapter = createAdapter(
      'greenhouse',
      'acme',
      'http://127.0.0.1:9001',
    ) as ScrapeSourceAdapter;
    const result = await adapter.fetchJobs({
      signal: new AbortController().signal,
      limit: 10,
    });
    expect(result.jobs.length).toBeGreaterThan(0);
    expect(result.jobs[0].sourceJobId).toBeDefined();
    expect(result.jobs[0].title).toBeDefined();
    expect(result.jobs[0].url).toBeDefined();
    // First job should have a complete description (fixture has content)
    const first = result.jobs.find((j) => j.sourceJobId === '1001');
    expect(first?.descriptionStatus).toBe('complete');
    // Second job has null content -> missing description
    const second = result.jobs.find((j) => j.sourceJobId === '1002');
    expect(second?.descriptionStatus).toBe('missing');
  });

  it('fetches Lever jobs from fixture', async () => {
    const adapter = createAdapter(
      'lever',
      'acme',
      'http://127.0.0.1:9002',
    ) as ScrapeSourceAdapter;
    const result = await adapter.fetchJobs({
      signal: new AbortController().signal,
      limit: 10,
    });
    expect(result.jobs.length).toBeGreaterThan(0);
    const first = result.jobs[0];
    expect(first.sourceJobId).toBe('lever-001');
    expect(first.descriptionStatus).toBe('complete');
  });

  it('fetches Ashby jobs from fixture', async () => {
    const adapter = createAdapter(
      'ashby',
      'acme',
      'http://127.0.0.1:9003',
    ) as ScrapeSourceAdapter;
    const result = await adapter.fetchJobs({
      signal: new AbortController().signal,
      limit: 10,
    });
    expect(result.jobs.length).toBeGreaterThan(0);
    const first = result.jobs.find((j) => j.sourceJobId === 'ashby-001');
    expect(first?.descriptionStatus).toBe('complete');
  });

  it('fetches SmartRecruiters jobs from fixture', async () => {
    const adapter = createAdapter(
      'smartrecruiters',
      'acme',
      'http://127.0.0.1:9004',
    ) as ScrapeSourceAdapter;
    const result = await adapter.fetchJobs({
      signal: new AbortController().signal,
      limit: 10,
    });
    expect(result.jobs.length).toBeGreaterThan(0);
    const first = result.jobs.find((j) => j.sourceJobId === 'sr-001');
    expect(first?.descriptionStatus).toBe('complete');
    const second = result.jobs.find((j) => j.sourceJobId === 'sr-002');
    expect(second?.descriptionStatus).toBe('missing');
  });

  it('fetches SmartRecruiters job detail from fixture', async () => {
    const adapter = createAdapter(
      'smartrecruiters',
      'acme',
      'http://127.0.0.1:9004',
    ) as ScrapeSourceAdapter;
    const detail = await adapter.fetchDetail('sr-001');
    expect(detail).not.toBeNull();
    expect(detail?.title).toBe('Data Scientist');
    expect(detail?.descriptionStatus).toBe('complete');
  });

  it('returns null for missing SmartRecruiters detail', async () => {
    const adapter = createAdapter(
      'smartrecruiters',
      'acme',
      'http://127.0.0.1:9004',
    ) as ScrapeSourceAdapter;
    const detail = await adapter.fetchDetail('nonexistent');
    expect(detail).toBeNull();
  });
});

dbDescribe('Phase 4: Scrape sessions (requires MONGODB_URI)', () => {
  let server: import('http').Server;
  let baseURL: string;

  beforeAll(async () => {
    fixtureServers = startFixtureServers();
    await connectDB();
    // Drop the old dedup index (without ownerId) so the new per-owner index
    // defined in job.model.ts can be created by Mongoose autoIndex.
    try {
      await Job.collection.dropIndex('provenance.source_1_provenance.sourceJobId_1');
    } catch {
      // Index may not exist yet — that's fine.
    }
    const { createApp } = await import('../src/app');
    const app = createApp();
    server = await new Promise<import('http').Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const addr = server.address();
    const port = typeof addr === 'string' ? parseInt(addr.split(':').pop() ?? '0', 10) : (addr as { port: number }).port;
    baseURL = `http://127.0.0.1:${port}`;
    const { token, userId } = await registerAndLogin(baseURL);
    accessToken = token;
    ownerId = userId;
  });

  afterAll(async () => {
    stopFixtureServers(fixtureServers);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closeDB();
  });

  beforeEach(async () => {
    // Clean jobs and sessions between tests (owner-scoped to avoid clobbering
    // other test files that share the same database).
    await Job.deleteMany({ ownerId }).exec();
    await ScrapeSession.deleteMany({ ownerId }).exec();
  });

  it('creates a scrape session', async () => {
    const { status, body } = await request(
      baseURL,
      'POST',
      '/api/scrape/sessions',
      {
        filter: { q: 'engineer', sources: ['greenhouse', 'lever'] },
        sources: ['greenhouse', 'lever'],
        locations: ['Toronto'],
      },
      accessToken,
    );
    expect(status).toBe(201);
    const b = body as { id?: string; status?: string; sources?: string[] };
    expect(typeof b.id).toBe('string');
    expect(b.status).toBe('queued');
    expect(Array.isArray(b.sources)).toBe(true);
    expect(b.sources).toHaveLength(2);
  });

  it('rejects session with no sources', async () => {
    const { status } = await request(
      baseURL,
      'POST',
      '/api/scrape/sessions',
      { filter: {}, sources: [] },
      accessToken,
    );
    expect(status).toBe(400);
  });

  it('rejects session without authentication', async () => {
    const { status } = await request(
      baseURL,
      'POST',
      '/api/scrape/sessions',
      { filter: {}, sources: ['greenhouse'] },
    );
    expect(status).toBe(401);
  });

  it('runs a scrape session against fixture servers and saves jobs', async () => {
    // Create session with fixture server URLs
    const { body: createBody } = await request(
      baseURL,
      'POST',
      '/api/scrape/sessions',
      {
        filter: { q: 'engineer', sources: ['greenhouse'] },
        sources: ['greenhouse'],
        locations: ['Toronto'],
      },
      accessToken,
    );
    const sessionId = (createBody as { id?: string }).id as string;

    // Run against fixture servers (greenhouse on port 9001)
    await runScrapeSession(sessionId, ownerId, {
      greenhouse: { identifier: 'acme', baseUrl: 'http://127.0.0.1:9001' },
    } as never);

    // Verify jobs were saved
    const jobs = await Job.find({}).exec();
    expect(jobs.length).toBeGreaterThan(0);

    // Verify session status
    const session = await getScrapeSession(ownerId, sessionId);
    expect(session?.status).toBe('completed');
    expect(session?.totalSaved).toBeGreaterThan(0);

    // Verify events were persisted
    const events = await getScrapeEvents(sessionId, ownerId);
    expect(events.length).toBeGreaterThan(0);
    const types = events.map((e) => e.type);
    expect(types).toContain('started');
    expect(types).toContain('source_started');
    expect(types).toContain('job_saved');
  });

  it('handles cancellation mid-run', async () => {
    const { body: createBody } = await request(
      baseURL,
      'POST',
      '/api/scrape/sessions',
      {
        filter: { q: 'engineer', sources: ['greenhouse'] },
        sources: ['greenhouse'],
      },
      accessToken,
    );
    const sessionId = (createBody as { id?: string }).id as string;

    // Start run, wait until it's actually running, then cancel.
    const runPromise = runScrapeSession(sessionId, ownerId, {
      greenhouse: { identifier: 'acme', baseUrl: 'http://127.0.0.1:9001' },
    } as never);

    // Poll until the session has started running.
    for (let i = 0; i < 50; i++) {
      const s = await getScrapeSession(ownerId, sessionId);
      if (s?.status === 'running') break;
      await new Promise((r) => setTimeout(r, 50));
    }

    await cancelScrapeSession(ownerId, sessionId);

    await runPromise;

    const session = await getScrapeSession(ownerId, sessionId);
    expect(['cancelled', 'completed']).toContain(session?.status);
    if (session?.status === 'cancelled') {
      expect(session?.cancelRequested).toBe(true);
    }
  });

  it('dedups jobs by source + sourceJobId on re-run', async () => {
    const { body: createBody } = await request(
      baseURL,
      'POST',
      '/api/scrape/sessions',
      {
        filter: { sources: ['greenhouse'] },
        sources: ['greenhouse'],
      },
      accessToken,
    );
    const sessionId = (createBody as { id?: string }).id as string;

    await runScrapeSession(sessionId, ownerId, {
      greenhouse: { identifier: 'acme', baseUrl: 'http://127.0.0.1:9001' },
    } as never);

    const firstRunJobs = await Job.countDocuments({}).exec();
    expect(firstRunJobs).toBeGreaterThan(0);

    // Create a new session and run again — same source+sourceJobId should dedup
    const { body: createBody2 } = await request(
      baseURL,
      'POST',
      '/api/scrape/sessions',
      {
        filter: { sources: ['greenhouse'] },
        sources: ['greenhouse'],
      },
      accessToken,
    );
    const sessionId2 = (createBody2 as { id?: string }).id as string;

    await runScrapeSession(sessionId2, ownerId, {
      greenhouse: { identifier: 'acme', baseUrl: 'http://127.0.0.1:9001' },
    } as never);

    const secondRunJobs = await Job.countDocuments({}).exec();
    expect(secondRunJobs).toBe(firstRunJobs); // No new jobs added
  });

  it('lists scrape sessions for owner', async () => {
    // Create two sessions
    await request(
      baseURL,
      'POST',
      '/api/scrape/sessions',
      { filter: {}, sources: ['greenhouse'] },
      accessToken,
    );
    await request(
      baseURL,
      'POST',
      '/api/scrape/sessions',
      { filter: {}, sources: ['lever'] },
      accessToken,
    );

    const { status, body } = await request(
      baseURL,
      'GET',
      '/api/scrape/sessions',
      undefined,
      accessToken,
    );
    expect(status).toBe(200);
    const b = body as { sessions?: unknown[] };
    expect(Array.isArray(b.sessions)).toBe(true);
    expect(b.sessions?.length).toBeGreaterThanOrEqual(2);
  });

  it('gets SSE events for a session', async () => {
    const { body: createBody } = await request(
      baseURL,
      'POST',
      '/api/scrape/sessions',
      { filter: {}, sources: ['greenhouse'] },
      accessToken,
    );
    const sessionId = (createBody as { id?: string }).id as string;

    await runScrapeSession(sessionId, ownerId, {
      greenhouse: { identifier: 'acme', baseUrl: 'http://127.0.0.1:9001' },
    } as never);

    // Fetch persisted events directly from the service (SSE reconnect path).
    const events = await getScrapeEvents(sessionId, ownerId);
    expect(events.length).toBeGreaterThan(0);
    const types = events.map((e) => e.type);
    expect(types).toContain('started');
    expect(types).toContain('source_started');
    expect(types).toContain('job_saved');
  });
});
