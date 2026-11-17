const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:3000';

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `API ${res.status} ${res.statusText}${text ? ': ' + text : ''}`
    );
  }
  return (await res.json()) as T;
}

export interface HealthResponse {
  status: string;
  version: string;
  uptime: number;
  database: { connected: boolean; status: string; name?: string };
  ollama: { reachable: boolean; url: string; model?: string };
  timestamp: string;
}

export async function getHealth(): Promise<HealthResponse> {
  return fetchJson<HealthResponse>('/api/health');
}

export interface DemoResponse {
  message: string;
  env?: string;
  version?: string;
  fixtures: {
    stats: { savedJobs: number; searches: number; applications: number };
    sources: string[];
  };
  timestamp: string;
}

export async function getDemo(): Promise<DemoResponse> {
  return fetchJson<DemoResponse>('/api/demo');
}

export { API_BASE };
