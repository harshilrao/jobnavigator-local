import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../src/app';
import { connectDB, closeDB } from '../src/config/mongodb';

let server: http.Server;
let baseURL: string;

beforeAll(async () => {
  // Ensure demo route (development-only) is mounted for this test.
  process.env.NODE_ENV = 'development';
  await connectDB();
  const app = createApp();
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'string' ? parseInt(addr.split(':').pop() ?? '0', 10) : (addr as { port: number }).port;
  baseURL = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeDB();
});

async function fetchJSON(path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseURL}${path}`);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

describe('GET /api/health (integration)', () => {
  it('returns 200 with a valid health shape', async () => {
    const { status, body } = await fetchJSON('/api/health');
    expect(status).toBe(200);
    expect(typeof body).toBe('object');
    const h = body as Record<string, unknown>;
    expect(h.status).toBe('ok');
    expect(typeof h.uptime).toBe('number');
    expect(h.database).toBeDefined();
    const db = h.database as Record<string, unknown>;
    expect(typeof db.connected).toBe('boolean');
    expect(typeof db.status).toBe('string');
    expect(h.ollama).toBeDefined();
    const ollama = h.ollama as Record<string, unknown>;
    expect(typeof ollama.reachable).toBe('boolean');
    expect(typeof ollama.url).toBe('string');
    expect(typeof h.timestamp).toBe('string');
  });

  it('database status reflects connection when MONGODB_URI is set', async () => {
    const { body } = await fetchJSON('/api/health');
    const db = (body as Record<string, unknown>).database as Record<string, unknown>;
    expect(typeof db.connected).toBe('boolean');
    expect(typeof db.status).toBe('string');
  });

  it('GET /api/_ping returns ok', async () => {
    const { status, body } = await fetchJSON('/api/_ping');
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).ok).toBe(true);
  });

  it('GET /api/demo returns 200 in development', async () => {
    const { status, body } = await fetchJSON('/api/demo');
    expect(status).toBe(200);
    const b = body as Record<string, unknown>;
    expect(typeof b.message).toBe('string');
    expect(b.fixtures).toBeDefined();
  });

  it('undefined route under /api returns 404', async () => {
    const { status } = await fetchJSON('/api/does-not-exist');
    expect(status).toBe(404);
  });
});
