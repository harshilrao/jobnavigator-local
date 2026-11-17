import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

import { GridFSBucket, type Db } from 'mongodb';
import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import { OriginalDocument, type OriginalDocumentDoc, type DocumentType, type TextExtractionStatus } from './document.model';
import { getEnv } from '../../config/env';

/**
 * pdf-parse and mammoth are CommonJS / dual modules. Use createRequire so ESM
 * resolution never throws "pdfParse is not a function" (the known failure mode
 * the build plan calls out).
 */
const pdfParseModule = require('pdf-parse');
const pdfParse: (buffer: Buffer | Uint8Array) => Promise<{ text: string; info?: unknown; metadata?: unknown }> =
  typeof pdfParseModule === 'function'
    ? pdfParseModule
    : (pdfParseModule as { default?: unknown }).default ?? ((() => { throw new Error('pdf-parse did not export a function'); })());

const mammothModule = require('mammoth');
const mammoth = mammothModule as { extract: (opts: { buffer: Buffer }) => Promise<{ value: string; messages: unknown[] }> };

function checksumBuffer(buffer: Buffer): string {
  return createHash('md5').update(buffer).digest('hex');
}

function getDb(): Db {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('MongoDB database not connected');
  }
  // mongoose bundles its own mongodb copy; its `connection.db` is typed against
  // that copy while `Db`/`GridFSBucket` above resolve to the hoisted copy. The
  // handles are the same object at runtime, so the cast is safe.
  return db as unknown as Db;
}

function getBucket(): GridFSBucket {
  return new GridFSBucket(getDb(), { bucketName: 'original_documents' });
}

export interface UploadedDocument {
  document: OriginalDocumentDoc;
  extractedText?: string;
  textExtractionStatus: TextExtractionStatus;
}

/**
 * Store a file's original bytes in GridFS (immutable), save metadata with a
 * checksum, and run text extraction. Never mutates the stored original;
 * version replacement appends a new GridFS file and archives the old one.
 */
export async function uploadDocument(
  ownerId: string,
  file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  documentType: DocumentType
): Promise<UploadedDocument> {
  const env = getEnv();
  const checksum = checksumBuffer(file.buffer);
  const bucket = getBucket();

  // Upload original bytes to GridFS.
  const uploadStream = bucket.openUploadStream(file.originalname, {
    contentType: file.mimetype,
    metadata: { ownerId, documentType, checksum, uploadedAt: new Date().toISOString() },
  });
  await new Promise<void>((resolve, reject) => {
    uploadStream.end(file.buffer);
    uploadStream.on('finish', resolve);
    uploadStream.on('error', reject);
  });
  const gridFsFileId = uploadStream.id;

  // Existing active document for this owner+type?
  const existing = await OriginalDocument.findOne({
    ownerId,
    documentType,
    deletedAt: { $exists: false },
  }).sort({ version: -1 });

  let document: OriginalDocumentDoc;
  let extractedText: string | undefined;
  let status: TextExtractionStatus = 'missing';

  if (existing) {
    // Archive the current (active) version before creating the new one.
    existing.previousVersions.push({
      gridFsFileId: existing.gridFsFileId,
      checksum: existing.checksum,
      originalFilename: existing.originalFilename,
      size: existing.size,
      mimeType: existing.mimeType,
      uploadedAt: existing.createdAt ?? new Date(),
    });
    existing.version += 1;
    existing.gridFsFileId = gridFsFileId;
    existing.checksum = checksum;
    existing.originalFilename = file.originalname;
    existing.mimeType = file.mimetype;
    existing.size = file.size;
    existing.textExtractionStatus = 'pending';
    existing.extractedText = undefined;
    existing.deletedAt = undefined;
    document = await existing.save();
  } else {
    document = await OriginalDocument.create({
      ownerId: new mongoose.Types.ObjectId(ownerId),
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      checksum,
      documentType,
      gridFsFileId,
      version: 1,
      previousVersions: [],
      textExtractionStatus: 'pending',
      deletedAt: undefined,
    });
  }

  // Text extraction (never crashes the upload; status reflects outcome).
  // pdf-parse/pdf.js requires a plain Uint8Array; Node.js Buffer is not reliably handled.
  const buffer = new Uint8Array(file.buffer.buffer, file.buffer.byteOffset, file.buffer.byteLength);
  try {
    const extracted = await extractText(buffer, file.mimetype);
    if (extracted && extracted.length > 0) {
      extractedText = extracted;
      status = 'complete';
    } else {
      status = 'missing';
    }
  } catch {
    status = 'failed';
  }

  document.textExtractionStatus = status;
  document.extractedText = extractedText;
  await document.save();

  return { document, extractedText, textExtractionStatus: status };
}

/**
 * Extract text from PDF or DOCX. Returns empty string when nothing extractable.
 */
async function extractText(buffer: Uint8Array, mimeType: string): Promise<string> {
  if (mimeType === 'application/pdf') {
    const result = await pdfParse(buffer);
    return result.text ?? '';
  }
  if (
    mimeType ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const result = await mammoth.extract({ buffer: Buffer.from(buffer) });
    return result.value ?? '';
  }
  return '';
}

/**
 * Get a readable stream for the original file bytes plus metadata.
 * Returns null when no active document exists.
 */
export async function getDocumentStream(
  ownerId: string,
  documentId: string
): Promise<{ stream: import('stream').Readable; document: OriginalDocumentDoc } | null> {
  const document = await OriginalDocument.findOne({
    _id: documentId,
    ownerId,
    deletedAt: { $exists: false },
  });
  if (!document) return null;

  const bucket = getBucket();
  const stream = bucket.openDownloadStream(document.gridFsFileId);
  return { stream, document };
}

/**
 * List active documents for an owner (newest first).
 */
export async function listDocuments(ownerId: string): Promise<OriginalDocumentDoc[]> {
  return OriginalDocument.find({
    ownerId,
    deletedAt: { $exists: false },
  })
    .sort({ createdAt: -1 })
    .select('-extractedText') // don't return extracted text in lists
    .exec();
}

/**
 * Soft-delete a document (keeps GridFS bytes immutable, hides from listing).
 */
export async function deleteDocument(ownerId: string, documentId: string): Promise<boolean> {
  const result = await OriginalDocument.updateOne(
    { _id: documentId, ownerId, deletedAt: { $exists: false } },
    { $set: { deletedAt: new Date() } }
  );
  return result.modifiedCount > 0;
}

export { getDb, getBucket };
export type { OriginalDocumentDoc, DocumentType, TextExtractionStatus };
