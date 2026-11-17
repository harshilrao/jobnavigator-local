import { isDBConnected, getDatabaseName, closeDB } from '../../config/mongodb';
import { getEnv } from '../../config/env';

export interface HealthStatus {
  status: string;
  version: string;
  uptime: number;
  database: { connected: boolean; status: string; name?: string };
  ollama: { reachable: boolean; url: string; model?: string };
  timestamp: string;
}

export async function getHealth(): Promise<HealthStatus> {
  const env = getEnv();
  const connected = isDBConnected();
  const database = {
    connected,
    status: connected
      ? 'connected'
      : env.MONGODB_URI
        ? 'disconnected'
        : 'not_configured',
    name: getDatabaseName(),
  };

  // Ollama reachability: non-blocking, short timeout, never blocks the UI.
  const ollama = { reachable: false, url: env.OLLAMA_BASE_URL, model: env.OLLAMA_MODEL as string };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${env.OLLAMA_BASE_URL}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    ollama.reachable = response.ok;
  } catch {
    ollama.reachable = false;
  }

  return {
    status: 'ok',
    version: '0.1.0',
    uptime: process.uptime(),
    database,
    ollama,
    timestamp: new Date().toISOString(),
  };
}

export async function shutdown(): Promise<void> {
  await closeDB();
}
