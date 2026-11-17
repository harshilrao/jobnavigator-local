import { describe, it, expect } from 'vitest';
import { healthCheck, demoCheck, APP_VERSION } from '../src/index';

describe('shared schemas', () => {
  it('APP_VERSION is a non-empty string', () => {
    expect(typeof APP_VERSION).toBe('string');
    expect(APP_VERSION.length).toBeGreaterThan(0);
  });

  it('healthCheck accepts a valid health payload', () => {
    const h = healthCheck({
      status: 'ok',
      version: APP_VERSION,
      uptime: 123,
      database: { connected: true, status: 'connected', name: 'jobnavigator_local' },
      ollama: { reachable: true, url: 'http://127.0.0.1:11434', model: 'qwen2.5:3b' },
      timestamp: new Date().toISOString(),
    });
    expect(h.status).toBe('ok');
    expect(h.database.connected).toBe(true);
  });

  it('healthCheck rejects an invalid payload', () => {
    expect(() => healthCheck({ not: 'a health object' as any })).toThrow();
  });

  it('demoCheck accepts a valid demo payload', () => {
    const d = demoCheck({
      message: 'demo',
      env: 'development',
      fixtures: { stats: { savedJobs: 0, searches: 0, applications: 0 }, sources: ['x'] },
      timestamp: new Date().toISOString(),
    });
    expect(d.message).toBe('demo');
  });
});
