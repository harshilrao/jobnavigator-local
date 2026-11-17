import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/app';
import { connectDB, closeDB, isDBConnected } from '../src/config/mongodb';

describe('API /api/health', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await closeDB();
  });

  it('health service reports isDBConnected consistently', () => {
    expect(typeof isDBConnected()).toBe('boolean');
  });

  it('createApp returns an Express app with routes registered', () => {
    const app = createApp();
    expect(typeof app).toBe('function');
    expect(app).toHaveProperty('use');
    expect(app).toHaveProperty('get');
  });
});
