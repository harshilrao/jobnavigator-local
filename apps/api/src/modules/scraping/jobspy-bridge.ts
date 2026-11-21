import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { getEnv } from '../../config/env';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Worker paths
const WORKER_DIR = resolve(__dirname, '../../../../../workers/jobspy');
const WORKER_SCRIPT = join(WORKER_DIR, 'worker.py');
const VENV_PYTHON = process.platform === 'win32'
  ? join(WORKER_DIR, '.venv', 'Scripts', 'python.exe')
  : join(WORKER_DIR, '.venv', 'bin', 'python');

/** Input schema for the worker (matches Python JobInput) */
export const JobSpyWorkerInputSchema = z.object({
  sources: z.array(z.enum(['linkedin', 'indeed', 'glassdoor', 'zip_recruiter'])).min(1),
  query: z.string().optional(),
  location: z.string().optional(),
  country: z.string().optional(),
  resultsWanted: z.number().int().positive().max(100).default(10),
  offset: z.number().int().nonnegative().default(0),
  fetchDescription: z.boolean().default(true),
  hoursOld: z.number().int().positive().optional(),
  jobType: z.enum(['fulltime', 'parttime', 'contract', 'internship', 'temporary']).optional(),
  remote: z.boolean().optional(),
  easyApply: z.boolean().optional(),
  isRemote: z.boolean().optional(),
});
export type JobSpyWorkerInput = z.infer<typeof JobSpyWorkerInputSchema>;

/** Output schema from the worker */
export const JobSpyWorkerOutputSchema = z.object({
  version: z.literal(1),
  requestId: z.string(),
  jobs: z.array(z.object({
    sourceJobId: z.string(),
    title: z.string(),
    company: z.string(),
    location: z.string(),
    url: z.string(),
    description: z.string(),
    descriptionStatus: z.enum(['complete', 'partial', 'missing', 'blocked', 'closed']),
    salary: z.object({
      min: z.number().optional(),
      max: z.number().optional(),
      currency: z.string(),
      period: z.enum(['hour', 'month', 'year']),
    }).nullable().optional(),
    postedAt: z.string().nullable().optional(),
    source: z.string(),
    jobType: z.string().nullable().optional(),
    isRemote: z.boolean().nullable().optional(),
    emails: z.array(z.string()).nullable().optional(),
  })),
  hasMore: z.boolean(),
  error: z.string().nullable(),
});
export type JobSpyWorkerOutput = z.infer<typeof JobSpyWorkerOutputSchema>;

/** Internal worker process handle */
interface WorkerProcess {
  proc: ChildProcessWithoutNullStreams;
  pending: Map<string, { resolve: (value: JobSpyWorkerOutput) => void; reject: (err: Error) => void }>;
  buffer: string;
  closed: boolean;
}

/** Singleton worker manager */
class JobSpyWorkerManager {
  private worker: WorkerProcess | null = null;
  private requestCounter = 0;

  /** Get or spawn the worker process */
  private getWorker(): WorkerProcess {
    if (this.worker && !this.worker.closed) {
      return this.worker;
    }

    // Check if venv exists
    if (!existsSync(VENV_PYTHON)) {
      throw new Error(`Python venv not found at ${VENV_PYTHON}. Run setup script first.`);
    }
    if (!existsSync(WORKER_SCRIPT)) {
      throw new Error(`Worker script not found at ${WORKER_SCRIPT}`);
    }

    console.log('[JobSpy Bridge] Spawning worker:', { python: VENV_PYTHON, script: WORKER_SCRIPT, cwd: WORKER_DIR });
    const proc = spawn(VENV_PYTHON, [WORKER_SCRIPT], {
      cwd: WORKER_DIR,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      stdio: ['pipe', 'pipe', 'pipe'], // stdin, stdout, stderr
      windowsHide: true,
    });

    console.log('[JobSpy Bridge] Worker process spawned, PID:', proc.pid);

    proc.on('spawn', () => {
      console.log('[JobSpy Bridge] Worker process spawn event fired');
    });

    const worker: WorkerProcess = {
      proc,
      pending: new Map(),
      buffer: '',
      closed: false,
    };

    // Handle stdout (JSONL responses)
    proc.stdout.on('data', (chunk: Buffer) => {
      const data = chunk.toString('utf8');
      console.log('[JobSpy Bridge] Received stdout chunk:', { length: data.length, preview: data.slice(0, 200) });
      worker.buffer += data;
      this.processBuffer(worker);
    });

    // Handle stderr (logging only)
    proc.stderr.on('data', (chunk: Buffer) => {
      const lines = chunk.toString('utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        console.log('[JobSpy Worker]', line);
      }
    });

    // Handle process exit
    proc.on('exit', (code, signal) => {
      console.log(`[JobSpy Worker] Process exited: code=${code}, signal=${signal}`);
      worker.closed = true;
      // Reject all pending requests
      for (const [, { reject }] of worker.pending) {
        reject(new Error(`Worker process exited: code=${code}, signal=${signal}`));
      }
      worker.pending.clear();
      this.worker = null;
    });

    proc.on('error', (err) => {
      console.error('[JobSpy Worker] Process error:', err);
      worker.closed = true;
      for (const [, { reject }] of worker.pending) {
        reject(err);
      }
      worker.pending.clear();
      this.worker = null;
    });

    this.worker = worker;
    return worker;
  }

  /** Process accumulated buffer for complete JSONL lines */
  private processBuffer(worker: WorkerProcess): void {
    let newlineIdx: number;
    while ((newlineIdx = worker.buffer.indexOf('\n')) !== -1) {
      const line = worker.buffer.slice(0, newlineIdx).trim();
      worker.buffer = worker.buffer.slice(newlineIdx + 1);

      if (!line) continue;

      try {
        const parsed = JSON.parse(line);
        const requestId = parsed.requestId;

        const pending = worker.pending.get(requestId);
        if (pending) {
          worker.pending.delete(requestId);
          // Validate output
          const result = JobSpyWorkerOutputSchema.safeParse(parsed);
          if (result.success) {
            pending.resolve(result.data);
          } else {
            pending.reject(new Error(`Worker output validation failed: ${result.error.message}`));
          }
        } else {
          console.warn('[JobSpy Worker] Received response for unknown requestId:', requestId);
        }
      } catch (err) {
        console.error('[JobSpy Worker] Failed to parse response line:', line, err);
      }
    }
  }

  /** Send a request to the worker and wait for response */
  async request(input: JobSpyWorkerInput, signal?: AbortSignal): Promise<JobSpyWorkerOutput> {
    const worker = this.getWorker();
    const requestId = `req-${++this.requestCounter}-${Date.now()}`;

    const message = {
      version: 1,
      requestId,
      params: input,
    };

    console.log('[JobSpy Bridge] Sending request to worker:', {
      requestId,
      sources: input.sources,
      query: input.query,
      location: input.location,
      country: input.country,
      resultsWanted: input.resultsWanted,
      hoursOld: input.hoursOld,
      jobType: input.jobType,
      remote: input.remote,
      easyApply: input.easyApply,
      fetchDescription: input.fetchDescription,
    });

    return new Promise<JobSpyWorkerOutput>((resolve, reject) => {
      // Store pending request
      worker.pending.set(requestId, { resolve, reject });

      // Handle abort signal
      const abortHandler = () => {
        const pending = worker.pending.get(requestId);
        if (pending) {
          worker.pending.delete(requestId);
          console.log('[JobSpy Bridge] Request aborted:', requestId);
          reject(new DOMException('Aborted', 'AbortError'));
        }
      };

      if (signal) {
        if (signal.aborted) {
          abortHandler();
          return;
        }
        signal.addEventListener('abort', abortHandler, { once: true });
      }

      // Send request
      try {
        console.log('[JobSpy Bridge] Writing to stdin, process.killed:', worker.proc.killed, 'exitCode:', worker.proc.exitCode);
        const written = worker.proc.stdin.write(JSON.stringify(message) + '\n');
        console.log('[JobSpy Bridge] Request written to stdin:', requestId, { written });
      } catch (err) {
        worker.pending.delete(requestId);
        if (signal) signal.removeEventListener('abort', abortHandler);
        console.error('[JobSpy Bridge] Failed to write to stdin:', err);
        reject(err);
        return;
      }

      // Set timeout (default 180s for JobSpy - description fetching can be slow)
      const timeout = setTimeout(() => {
        const pending = worker.pending.get(requestId);
        if (pending) {
          worker.pending.delete(requestId);
          if (signal) signal.removeEventListener('abort', abortHandler);
          console.error('[JobSpy Bridge] Request timeout:', requestId);
          reject(new Error('Worker request timeout (180s)'));
        }
      }, 180000);

      // Clean up timeout on resolution
      const originalResolve = resolve;
      const originalReject = reject;
      const newResolve: (value: JobSpyWorkerOutput | PromiseLike<JobSpyWorkerOutput>) => void = (value) => {
        clearTimeout(timeout);
        if (signal) signal.removeEventListener('abort', abortHandler);
        const v = value as JobSpyWorkerOutput;
        console.log('[JobSpy Bridge] Request resolved:', requestId, {
          jobCount: v.jobs.length,
          hasMore: v.hasMore,
          error: v.error,
        });
        originalResolve(value);
      };
      const newReject: (reason?: unknown) => void = (err) => {
        clearTimeout(timeout);
        if (signal) signal.removeEventListener('abort', abortHandler);
        console.error('[JobSpy Bridge] Request rejected:', requestId, err);
        originalReject(err);
      };
      // Replace the resolve/reject in the pending map
      worker.pending.set(requestId, { resolve: newResolve, reject: newReject });
    });
  }

  /** Terminate the worker process */
  async terminate(): Promise<void> {
    if (this.worker && !this.worker.closed) {
      this.worker.closed = true;
      this.worker.proc.kill('SIGTERM');
      // Wait a bit for graceful exit
      await new Promise(resolve => setTimeout(resolve, 500));
      if (!this.worker.proc.killed) {
        this.worker.proc.kill('SIGKILL');
      }
      this.worker = null;
    }
  }

  /** Check if worker is healthy */
  isHealthy(): boolean {
    return this.worker !== null && !this.worker.closed && !this.worker.proc.killed;
  }
}

// Singleton instance
const workerManager = new JobSpyWorkerManager();

/** High-level function to fetch jobs via JobSpy worker */
export async function fetchJobsViaJobSpy(
  input: JobSpyWorkerInput,
  signal?: AbortSignal
): Promise<{ jobs: JobSpyWorkerOutput['jobs']; hasMore: boolean }> {
  const result = await workerManager.request(input, signal);
  if (result.error) {
    throw new Error(`JobSpy worker error: ${result.error}`);
  }
  return { jobs: result.jobs, hasMore: result.hasMore };
}

/** Terminate the worker (for testing or shutdown) */
export async function terminateJobSpyWorker(): Promise<void> {
  await workerManager.terminate();
}

/** Check worker health */
export function isJobSpyWorkerHealthy(): boolean {
  return workerManager.isHealthy();
}

/** Get worker path info for debugging */
export function getJobSpyWorkerInfo() {
  return {
    workerScript: WORKER_SCRIPT,
    venvPython: VENV_PYTHON,
    workerDir: WORKER_DIR,
    exists: {
      script: existsSync(WORKER_SCRIPT),
      venv: existsSync(VENV_PYTHON),
    },
  };
}