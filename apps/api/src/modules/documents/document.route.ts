import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth } from '../auth/auth.middleware';
import {
  uploadDocument,
  getDocumentStream,
  listDocuments,
  deleteDocument,
  type DocumentType,
} from './document.service';
import { getEnv } from '../../config/env';

const documentsRouter = Router();

const env = getEnv();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.UPLOAD_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!allowedMimes.includes(file.mimetype)) {
      return cb(new Error('Only PDF and DOCX files are allowed'));
    }
    cb(null, true);
  },
});

const documentTypeSchema = z.enum(['resume', 'cover-letter']);

function validateDocumentType(req: { query: Record<string, string> }, _res: unknown, next: (err?: unknown) => void) {
  const result = documentTypeSchema.safeParse(req.query.type);
  if (!result.success) {
    const err: Error & { statusCode?: number } = new Error('Invalid document type (resume or cover-letter)');
    err.statusCode = 400;
    return next(err);
  }
  (req as { validatedType?: DocumentType }).validatedType = result.data;
  next();
}

// POST /api/documents/upload — multipart/form-data, field name "file"
documentsRouter.post(
  '/upload',
  requireAuth,
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        const err: Error & { statusCode?: number } = new Error('No file uploaded');
        err.statusCode = 400;
        throw err;
      }
      const typeParam = (req.query.type as string) ?? 'resume';
      const typeResult = documentTypeSchema.safeParse(typeParam);
      if (!typeResult.success) {
        const err: Error & { statusCode?: number } = new Error('Invalid document type');
        err.statusCode = 400;
        throw err;
      }
      const { document, extractedText, textExtractionStatus } = await uploadDocument(
        (req as { user?: { id: string } }).user!.id,
        req.file,
        typeResult.data
      );
      res.status(201).json({
        id: document.id,
        ownerId: document.ownerId,
        originalFilename: document.originalFilename,
        mimeType: document.mimeType,
        size: document.size,
        checksum: document.checksum,
        documentType: document.documentType,
        version: document.version,
        textExtractionStatus,
        extractedText: textExtractionStatus === 'complete' ? extractedText : undefined,
        createdAt: document.createdAt,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/documents — list
documentsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const documents = await listDocuments((req as { user?: { id: string } }).user!.id);
    res.status(200).json(documents);
  } catch (err) {
    next(err);
  }
});

// GET /api/documents/:id/preview — stream original file bytes (authenticated)
documentsRouter.get('/:id/preview', requireAuth, async (req, res, next) => {
  try {
    const ownerId = (req as { user?: { id: string } }).user!.id;
    const result = await getDocumentStream(ownerId, req.params.id);
    if (!result) {
      res.status(404).json({ error: 'not_found', message: 'Document not found' });
      return;
    }
    const { stream, document } = result;
    res.set('Content-Type', document.mimeType);
    res.set('Content-Disposition', `inline; filename="${document.originalFilename}"`);
    res.set('X-Request-Id', res.getHeader('x-request-id') as string);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    res.send(Buffer.concat(chunks));
  } catch (err) {
    next(err);
  }
});

// GET /api/documents/:id/download — download original file
documentsRouter.get('/:id/download', requireAuth, async (req, res, next) => {
  try {
    const ownerId = (req as { user?: { id: string } }).user!.id;
    const result = await getDocumentStream(ownerId, req.params.id);
    if (!result) {
      res.status(404).json({ error: 'not_found', message: 'Document not found' });
      return;
    }
    const { stream, document } = result;
    res.set('Content-Type', document.mimeType);
    res.set('Content-Disposition', `attachment; filename="${document.originalFilename}"`);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    res.send(Buffer.concat(chunks));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/documents/:id — soft delete
documentsRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const ownerId = (req as { user?: { id: string } }).user!.id;
    const deleted = await deleteDocument(ownerId, req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'not_found', message: 'Document not found' });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default documentsRouter;
