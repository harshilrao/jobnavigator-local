import { Router, type RequestHandler } from 'express';
import { requireAuth } from '../auth/auth.middleware';
import { AuthenticatedRequest } from '../auth/auth.middleware';
import {
  listResumeTemplates,
  listCoverLetterTemplates,
  createResumeTemplate,
  createCoverLetterTemplate,
  updateResumeTemplate,
  updateCoverLetterTemplate,
  deleteResumeTemplate,
  deleteCoverLetterTemplate,
  tailorResume,
  generateCoverLetterService,
  approveGeneratedDocument,
  exportGeneratedDocument,
  listGeneratedDocuments,
  getGeneratedDocument,
  deleteGeneratedDocument,
  type ResumeTemplateView,
  type CoverLetterTemplateView,
  type GeneratedDocumentView,
  type TailoredResumeResponse,
  type GeneratedCoverLetterResponse,
} from './resume.service';
import { z } from 'zod';

const router = Router();

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/resumes/templates/resume
 * List resume templates
 */
router.get('/templates/resume', (async (_req, res) => {
  const req = _req as AuthenticatedRequest;
  const templates = await listResumeTemplates(req.user!.id);
  res.json(templates);
}) as RequestHandler);

/**
 * GET /api/resumes/templates/cover-letter
 * List cover letter templates
 */
router.get('/templates/cover-letter', (async (_req, res) => {
  const req = _req as AuthenticatedRequest;
  const templates = await listCoverLetterTemplates(req.user!.id);
  res.json(templates);
}) as RequestHandler);

/**
 * POST /api/resumes/templates/resume
 * Create a custom resume template
 */
const createResumeTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  htmlTemplate: z.string().min(1),
  cssTemplate: z.string().min(1),
  isDefault: z.boolean().optional(),
});

router.post('/templates/resume', (async (_req, res) => {
  const req = _req as AuthenticatedRequest;
  const parsed = createResumeTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
    return;
  }
  const template = await createResumeTemplate(req.user!.id, parsed.data);
  res.status(201).json(template);
}) as RequestHandler);

/**
 * POST /api/resumes/templates/cover-letter
 * Create a custom cover letter template
 */
const createCoverLetterTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  htmlTemplate: z.string().min(1),
  cssTemplate: z.string().min(1),
  isDefault: z.boolean().optional(),
});

router.post('/templates/cover-letter', (async (_req, res) => {
  const req = _req as AuthenticatedRequest;
  const parsed = createCoverLetterTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
    return;
  }
  const template = await createCoverLetterTemplate(req.user!.id, parsed.data);
  res.status(201).json(template);
}) as RequestHandler);

/**
 * PATCH /api/resumes/templates/resume/:id
 * Update a resume template
 */
const updateResumeTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  htmlTemplate: z.string().optional(),
  cssTemplate: z.string().optional(),
  isDefault: z.boolean().optional(),
});

router.patch('/templates/resume/:id', (async (_req, res) => {
  const req = _req as AuthenticatedRequest;
  const parsed = updateResumeTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
    return;
  }
  const template = await updateResumeTemplate(req.user!.id, req.params.id, parsed.data);
  if (!template) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  res.json(template);
}) as RequestHandler);

/**
 * PATCH /api/resumes/templates/cover-letter/:id
 * Update a cover letter template
 */
const updateCoverLetterTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  htmlTemplate: z.string().optional(),
  cssTemplate: z.string().optional(),
  isDefault: z.boolean().optional(),
});

router.patch('/templates/cover-letter/:id', (async (_req, res) => {
  const req = _req as AuthenticatedRequest;
  const parsed = updateCoverLetterTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
    return;
  }
  const template = await updateCoverLetterTemplate(req.user!.id, req.params.id, parsed.data);
  if (!template) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  res.json(template);
}) as RequestHandler);

/**
 * DELETE /api/resumes/templates/resume/:id
 * Delete a custom resume template
 */
router.delete('/templates/resume/:id', (async (_req, res) => {
  const req = _req as AuthenticatedRequest;
  const deleted = await deleteResumeTemplate(req.user!.id, req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Template not found or cannot delete system template' });
    return;
  }
  res.status(204).send();
}) as RequestHandler);

/**
 * DELETE /api/resumes/templates/cover-letter/:id
 * Delete a custom cover letter template
 */
router.delete('/templates/cover-letter/:id', (async (_req, res) => {
  const req = _req as AuthenticatedRequest;
  const deleted = await deleteCoverLetterTemplate(req.user!.id, req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Template not found or cannot delete system template' });
    return;
  }
  res.status(204).send();
}) as RequestHandler);

/**
 * POST /api/resumes/tailor
 * Tailor a resume for a specific job
 */
const tailorResumeSchema = z.object({
  originalResumeId: z.string().min(1),
  jobId: z.string().min(1),
  matchReportId: z.string().optional(),
  templateId: z.string().optional(),
  instructions: z.string().optional(),
});

router.post('/tailor', (async (_req, res) => {
  const req = _req as AuthenticatedRequest;
  const parsed = tailorResumeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const result = await tailorResume(req.user!.id, parsed.data);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to tailor resume';
    const statusCode = message.includes('not found') || message.includes('missing') ? 404 : 500;
    res.status(statusCode).json({ error: message });
  }
}) as RequestHandler);

/**
 * POST /api/resumes/cover-letter
 * Generate a cover letter for a specific job
 */
const generateCoverLetterSchema = z.object({
  originalResumeId: z.string().min(1),
  jobId: z.string().min(1),
  matchReportId: z.string().optional(),
  templateId: z.string().optional(),
  tone: z.enum(['professional', 'enthusiastic', 'confident', 'conversational']).default('professional'),
  length: z.enum(['short', 'medium', 'long']).default('medium'),
  recipientName: z.string().optional(),
  recipientTitle: z.string().optional(),
  companyAddress: z.string().optional(),
  instructions: z.string().optional(),
});

router.post('/cover-letter', (async (_req, res) => {
  const req = _req as AuthenticatedRequest;
  const parsed = generateCoverLetterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const result = await generateCoverLetterService(req.user!.id, parsed.data);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate cover letter';
    const statusCode = message.includes('not found') || message.includes('missing') ? 404 : 500;
    res.status(statusCode).json({ error: message });
  }
}) as RequestHandler);

/**
 * POST /api/resumes/generated/:id/approve
 * Approve a generated document (move from draft to approved)
 */
router.post('/generated/:id/approve', (async (_req, res) => {
  const req = _req as AuthenticatedRequest;
  const doc = await approveGeneratedDocument(req.user!.id, req.params.id);
  if (!doc) {
    res.status(404).json({ error: 'Generated document not found' });
    return;
  }
  res.json(doc);
}) as RequestHandler);

/**
 * POST /api/resumes/generated/:id/export
 * Export a generated document to PDF/DOCX/HTML
 */
const exportSchema = z.object({
  format: z.enum(['pdf', 'docx', 'html']).default('pdf'),
  margins: z.object({
    top: z.number().default(20),
    right: z.number().default(20),
    bottom: z.number().default(20),
    left: z.number().default(20),
  }).optional(),
  pageSize: z.enum(['A4', 'Letter']).default('A4'),
});

router.post('/generated/:id/export', (async (_req, res) => {
  const req = _req as AuthenticatedRequest;
  const parsed = exportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const { buffer, fileName, contentType } = await exportGeneratedDocument(req.user!.id, req.params.id, parsed.data);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to export document';
    const statusCode = message.includes('not found') ? 404 : message.includes('must be approved') ? 400 : 500;
    res.status(statusCode).json({ error: message });
  }
}) as RequestHandler);

/**
 * GET /api/resumes/generated
 * List generated documents (optionally filtered by jobId)
 */
router.get('/generated', (async (_req, res) => {
  const req = _req as AuthenticatedRequest;
  const jobId = req.query.jobId as string | undefined;
  const docs = await listGeneratedDocuments(req.user!.id, jobId);
  res.json(docs);
}) as RequestHandler);

/**
 * GET /api/resumes/generated/:id
 * Get a single generated document
 */
router.get('/generated/:id', (async (_req, res) => {
  const req = _req as AuthenticatedRequest;
  const doc = await getGeneratedDocument(req.user!.id, req.params.id);
  if (!doc) {
    res.status(404).json({ error: 'Generated document not found' });
    return;
  }
  res.json(doc);
}) as RequestHandler);

/**
 * DELETE /api/resumes/generated/:id
 * Delete a generated document
 */
router.delete('/generated/:id', (async (_req, res) => {
  const req = _req as AuthenticatedRequest;
  const deleted = await deleteGeneratedDocument(req.user!.id, req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Generated document not found' });
    return;
  }
  res.status(204).send();
}) as RequestHandler);

export { router as resumeRouter };