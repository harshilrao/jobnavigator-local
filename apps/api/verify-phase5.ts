/**
 * Phase 5 end-to-end API verification script.
 *
 * 1. Logs in as hrhr@gmail.com
 * 2. Generates a PDF resume with pdf-lib
 * 3. Uploads it via POST /api/documents/upload?type=resume (multipart/form-data)
 * 4. Creates a job with descriptionStatus='complete' via POST /api/jobs
 * 5. Scores the job via POST /api/ai/jobs/:id/score
 * 6. Lists matches via GET /api/ai/jobs/:id/matches
 * 7. Fetches the single report via GET /api/ai/reports/:id
 *
 * Run: npx tsx verify-phase5.ts   (from apps/api)
 */

import { PDFDocument, rgb } from 'pdf-lib';
import { createHash } from 'node:crypto';

const BASE = 'http://localhost:3000';
const EMAIL = 'hrhr@gmail.com';
const PASSWORD = 'hrhr12345@';

let token = '';

async function api(path: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => (headers[k] = v));
    } else if (!Array.isArray(init.headers)) {
      Object.assign(headers, init.headers as Record<string, string>);
    }
  }
  return fetch(`${BASE}${path}`, { ...init, headers });
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init?.body && !(init.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => (headers[k] = v));
    } else if (!Array.isArray(init.headers)) {
      Object.assign(headers, init.headers as Record<string, string>);
    }
  }
  const res = await api(path, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status} ${res.statusText} ${path}: ${text}`);
  }
  return (await res.json()) as T;
}

function md5(bytes: Uint8Array): string {
  return createHash('md5').update(bytes).digest('hex');
}

async function main() {
  // 1. Login
  const login = await json<{ accessToken: string; user: { id: string } }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  token = login.accessToken;
  const ownerId = login.user.id;
  console.log(`Logged in as ${EMAIL} (ownerId=${ownerId})`);

  // 2. Generate a PDF resume
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();
  const fontSize = 12;
  page.drawText('Harsh Test Resume', { x: 50, y: height - 80, size: fontSize });
  page.drawText('Email: hrhr@gmail.com', { x: 50, y: height - 110, size: fontSize });
  page.drawText('Skills: TypeScript, React, Node.js, MongoDB, Tailwind CSS, AI/LLM integration.', {
    x: 50,
    y: height - 140,
    size: fontSize,
  });
  page.drawText('Experience: Senior Full-Stack Engineer at TestCorp (2022-Present).', {
    x: 50,
    y: height - 170,
    size: fontSize,
  });
  page.drawText(
    'Built job-search and application management tools using Express, Mongoose, React, and Ollama.',
    { x: 50, y: height - 200, size: fontSize },
  );
  page.drawText(
    'Experience with REST APIs, Zod validation, JWT authentication, and MongoDB Atlas.',
    { x: 50, y: height - 230, size: fontSize },
  );
  const pdfBytes = await pdfDoc.save();
  console.log(`Generated PDF resume (${pdfBytes.length} bytes)`);

  // 3. Upload the resume via multipart/form-data
  const form = new FormData();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  form.append('file', blob, 'harsh-resume.pdf');
  const upload = await json<{
    id: string;
    originalFilename: string;
    textExtractionStatus: string;
    extractedText?: string;
  }>('/api/documents/upload?type=resume', {
    method: 'POST',
    body: form as unknown as BodyInit,
  });
  // form has no Content-Type; fetch sets boundary automatically. Remove our manual header.
  const resumeId = upload.id;
  console.log(
    `Uploaded resume id=${resumeId} status=${upload.textExtractionStatus} extractedTextLen=${upload.extractedText?.length ?? 0}`,
  );

  // 4. Create a job with a complete description
  const job = await json<{ job: { id: string; title: string } }>('/api/jobs', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Senior Full-Stack Engineer',
      company: 'TestCorp',
      description:
        'We are hiring a senior full-stack engineer to build job-search and application management tools using Node.js, Express, React, TypeScript, MongoDB, and Ollama. Experience with REST APIs, Zod, JWT auth, and AI/LLM integration is required.',
      descriptionStatus: 'complete',
      source: 'manual',
      sourceJobId: 'jn-phase5-e2e-' + Date.now(),
      remoteType: 'remote',
      seniority: 'senior',
      employmentType: 'full-time',
      departments: ['engineering'],
      location: { city: 'Remote', remoteType: 'remote' },
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  const jobId = job.job.id;
  console.log(`Created job id=${jobId} title=${job.job.title}`);

  // 5. Score the job
  const scored = await json<{
    id: string;
    status: string;
    matchScore: number;
    matchReport: Record<string, unknown>;
    provider: string;
    model: string;
  }>(`/api/ai/jobs/${encodeURIComponent(jobId)}/score`, {
    method: 'POST',
    body: JSON.stringify({ resumeId, provider: 'ollama' }),
    headers: { 'Content-Type': 'application/json' },
  });
  console.log(
    `Scored: id=${scored.id} status=${scored.status} matchScore=${scored.matchScore} provider=${scored.provider} model=${scored.model}`,
  );
  console.log(`Match report: ${JSON.stringify(scored.matchReport, null, 2)}`);

  // 6. List matches
  const matches = await json<{ matches: Array<{ id: string; status: string; matchScore: number }> }>(
    `/api/ai/jobs/${encodeURIComponent(jobId)}/matches`,
  );
  console.log(`Matches count=${matches.matches.length}`);
  matches.matches.forEach((m) => console.log(`  match id=${m.id} status=${m.status} score=${m.matchScore}`));

  // 7. Fetch single report
  const report = await json<{
    id: string;
    status: string;
    matchScore: number;
    matchReport: Record<string, unknown>;
  }>(`/api/ai/reports/${encodeURIComponent(scored.id)}`);
  console.log(
    `Report: id=${report.id} status=${report.status} matchScore=${report.matchScore}`,
  );

  console.log('\n=== PHASE 5 E2E VERIFICATION PASSED ===');
}

main().catch((err) => {
  console.error('PHASE 5 E2E VERIFICATION FAILED:', err);
  process.exit(1);
});
