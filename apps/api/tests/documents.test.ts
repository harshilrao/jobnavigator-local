import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import fs from 'node:fs';
import { createApp } from '../src/app';
import { connectDB, closeDB } from '../src/config/mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const dbDescribe = MONGODB_URI ? describe : describe.skip;

let server: http.Server | undefined;
let baseURL = '';
let accessToken = '';
let uploadedDocId: string | undefined;

function randEmail(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
}

function readFixture(name: string): Buffer {
  return fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
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

/** Builds a multipart/form-data body with explicit Content-Type per part. */
function buildMultipart(fields: Record<string, string>, files: Array<{
  field: string;
  filename: string;
  mime: string;
  buffer: Buffer;
}>): { body: Buffer; contentType: string } {
  const boundary = `----JobNavigatorTestBoundary${Date.now()}`;
  const parts: Buffer[] = [];
  for (const [key, value] of Object.entries(fields)) {
    parts.push(
      Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n`),
        Buffer.from(value),
        Buffer.from('\r\n'),
      ]),
    );
  }
  for (const f of files) {
    parts.push(
      Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${f.field}"; filename="${f.filename}"\r\nContent-Type: ${f.mime}\r\n\r\n`,
        ),
        f.buffer,
        Buffer.from('\r\n'),
      ]),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function uploadFile(file: Buffer, filename: string, mime: string, type?: string): Promise<{ status: number; body: unknown }> {
  const { body, contentType } = buildMultipart(type ? { type } : {}, [{
    field: 'file',
    filename,
    mime,
    buffer: file,
  }]);
  const res = await fetch(`${baseURL}/api/documents/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': contentType,
    },
    body,
  });
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

dbDescribe('Documents integration (requires MONGODB_URI)', () => {
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

  it('POST /upload requires authentication', async () => {
    const pdf = readFixture('sample.pdf');
    const { body, contentType } = buildMultipart({}, [{
      field: 'file',
      filename: 'sample.pdf',
      mime: 'application/pdf',
      buffer: pdf,
    }]);
    const res = await fetch(`${baseURL}/api/documents/upload`, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body,
    });
    expect(res.status).toBe(401);
  });

  it('uploads a PDF and extracts text', async () => {
    const pdf = readFixture('sample.pdf');
    const { status, body } = await uploadFile(pdf, 'sample.pdf', 'application/pdf', 'resume');
    expect(status).toBe(201);
    const b = body as {
      id?: string;
      originalFilename?: string;
      mimeType?: string;
      size?: number;
      documentType?: string;
      version?: number;
      textExtractionStatus?: string;
      extractedText?: string;
    };
    uploadedDocId = b.id;
    expect(typeof b.id).toBe('string');
    expect(b.originalFilename).toBe('sample.pdf');
    expect(b.mimeType).toBe('application/pdf');
    expect(typeof b.size).toBe('number');
    expect(b.documentType).toBe('resume');
    expect(b.version).toBe(1);
    expect(b.textExtractionStatus).toBe('complete');
    expect(typeof b.extractedText).toBe('string');
    expect((b.extractedText ?? '')).toContain('John Doe');
  });

  it('rejects a non-PDF/DOCX file type', async () => {
    const csv = Buffer.from('a,b\n1,2\n');
    const { status } = await uploadFile(csv, 'data.csv', 'text/csv');
    // multer surfaces file-filter rejections as an error response; assert rejection.
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it('GET /list returns the uploaded document without extracted text', async () => {
    const { status, body } = await request('GET', '/api/documents', undefined, accessToken);
    expect(status).toBe(200);
    const list = body as Array<{ id?: string; documentType?: string; extractedText?: string }>;
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
    const doc = list.find((d) => d.documentType === 'resume');
    expect(doc).toBeDefined();
    expect(doc?.extractedText).toBeUndefined();
  });

  it('GET /:id/preview streams the original PDF bytes', async () => {
    const id = uploadedDocId;
    expect(typeof id).toBe('string');

    const res = await fetch(`${baseURL}/api/documents/${encodeURIComponent(id as string)}/preview`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    const bytes = new Uint8Array(await res.arrayBuffer());
    const expected = readFixture('sample.pdf');
    expect(bytes.length).toBe(expected.length);
    expect(Array.from(bytes).slice(0, 5)).toEqual(Array.from(expected).slice(0, 5));
  });

  it('GET /:id/download returns the original file as attachment', async () => {
    const id = uploadedDocId;

    const res = await fetch(`${baseURL}/api/documents/${encodeURIComponent(id as string)}/download`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    const disp = res.headers.get('content-disposition') ?? '';
    expect(disp).toContain('attachment');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.length).toBe(readFixture('sample.pdf').length);
  });

  it('DELETE /:id soft-deletes the document', async () => {
    const id = uploadedDocId;

    const { status } = await request('DELETE', `/api/documents/${encodeURIComponent(id as string)}`, undefined, accessToken);
    expect(status).toBe(200);

    const { body: after } = await request('GET', '/api/documents', undefined, accessToken);
    const remaining = after as Array<{ id?: string }>;
    expect(remaining.find((d) => d.id === id)).toBeUndefined();
  });
});
