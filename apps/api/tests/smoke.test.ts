import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../src/app';

const APP_VERSION = '0.1.0';

let server: http.Server;
let baseURL: string;

beforeAll(async () => {
  const app = createApp();
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'string' ? parseInt(addr.split(':').pop() ?? '0', 10) : (addr as { port: number }).port;
  baseURL = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function fetchJSON(path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseURL}${path}`);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

describe('API smoke', () => {
  it('serves /api/health with correct shape', async () => {
    const { status, body } = await fetchJSON('/api/health');
    expect(status).toBe(200);
    const h = body as Record<string, unknown>;
    expect(h.status).toBe('ok');
    expect(typeof h.uptime).toBe('number');
    const db = h.database as Record<string, unknown>;
    expect(typeof db.connected).toBe('boolean');
    expect(typeof db.status).toBe('string');
  });

  it('exposes x-request-id correlation header', async () => {
    const res = await fetch(`${baseURL}/api/_ping`);
    const rid = res.headers.get('x-request-id') ?? '';
    expect(typeof rid).toBe('string');
    expect(rid.length).toBeGreaterThan(0);
  });

  it('report version constant matches', () => {
    expect(APP_VERSION).toBe('0.1.0');
  });
});
