import { z } from 'zod';

/**
 * Shared resume/cover letter types used by API and web.
 * Kept dependency-free (only Zod) so both workspaces can import safely.
 */

/** Document type for generated outputs */
export const GeneratedDocumentTypeSchema = z.enum(['resume', 'cover-letter']);
export type GeneratedDocumentType = z.infer<typeof GeneratedDocumentTypeSchema>;

/** Status of a generated document */
export const GeneratedDocumentStatusSchema = z.enum(['draft', 'approved', 'exported']);
export type GeneratedDocumentStatus = z.infer<typeof GeneratedDocumentStatusSchema>;

/** Resume template definition */
export const ResumeTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  htmlTemplate: z.string(), // HTML with handlebars-like placeholders
  cssTemplate: z.string(),  // CSS for styling
  isDefault: z.boolean().default(false),
});
export type ResumeTemplate = z.infer<typeof ResumeTemplateSchema>;

/** Cover letter template definition */
export const CoverLetterTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  htmlTemplate: z.string(),
  cssTemplate: z.string(),
  isDefault: z.boolean().default(false),
});
export type CoverLetterTemplate = z.infer<typeof CoverLetterTemplateSchema>;

/** Canonical resume JSON - structured, evidence-grounded facts */
export const CanonicalResumeSchema = z.object({
  basics: z.object({
    name: z.string(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    location: z.string().optional(),
    linkedin: z.string().url().optional(),
    github: z.string().url().optional(),
    website: z.string().url().optional(),
    summary: z.string().optional(),
  }),
  skills: z.array(z.object({
    name: z.string(),
    category: z.string().optional(),
    level: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).optional(),
    evidence: z.string().optional(), // Resume quote supporting this skill
  })).default([]),
  experience: z.array(z.object({
    company: z.string(),
    title: z.string(),
    location: z.string().optional(),
    startDate: z.string(), // ISO date string
    endDate: z.string().optional(), // ISO date string or 'present'
    current: z.boolean().default(false),
    description: z.string(),
    highlights: z.array(z.string()).default([]),
    technologies: z.array(z.string()).default([]),
  })).default([]),
  education: z.array(z.object({
    institution: z.string(),
    degree: z.string(),
    fieldOfStudy: z.string().optional(),
    location: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    gpa: z.string().optional(),
    highlights: z.array(z.string()).default([]),
  })).default([]),
  projects: z.array(z.object({
    name: z.string(),
    description: z.string(),
    highlights: z.array(z.string()).default([]),
    technologies: z.array(z.string()).default([]),
    url: z.string().url().optional(),
  })).default([]),
  certifications: z.array(z.object({
    name: z.string(),
    issuer: z.string(),
    date: z.string().optional(),
    url: z.string().url().optional(),
  })).default([]),
  languages: z.array(z.object({
    language: z.string(),
    proficiency: z.enum(['native', 'fluent', 'conversational', 'basic']).optional(),
  })).default([]),
});
export type CanonicalResume = z.infer<typeof CanonicalResumeSchema>;

/** Canonical cover letter JSON */
export const CanonicalCoverLetterSchema = z.object({
  header: z.object({
    senderName: z.string(),
    senderEmail: z.string().email(),
    senderPhone: z.string().optional(),
    senderLocation: z.string().optional(),
    recipientName: z.string().optional(),
    recipientTitle: z.string().optional(),
    companyName: z.string(),
    companyAddress: z.string().optional(),
    date: z.string(), // ISO date string
  }),
  salutation: z.string(),
  body: z.array(z.string()), // Paragraphs
  closing: z.string(),
  signature: z.string(),
  tone: z.enum(['professional', 'enthusiastic', 'confident', 'conversational']).default('professional'),
  length: z.enum(['short', 'medium', 'long']).default('medium'),
});
export type CanonicalCoverLetter = z.infer<typeof CanonicalCoverLetterSchema>;

/** Input for tailoring a resume */
export const TailorResumeInputSchema = z.object({
  originalResumeId: z.string(),
  jobId: z.string(),
  matchReportId: z.string().optional(),
  templateId: z.string().optional(),
  instructions: z.string().optional(), // User guidance for AI
});
export type TailorResumeInput = z.infer<typeof TailorResumeInputSchema>;

/** Input for generating a cover letter */
export const GenerateCoverLetterInputSchema = z.object({
  originalResumeId: z.string(),
  jobId: z.string(),
  matchReportId: z.string().optional(),
  templateId: z.string().optional(),
  tone: z.enum(['professional', 'enthusiastic', 'confident', 'conversational']).default('professional'),
  length: z.enum(['short', 'medium', 'long']).default('medium'),
  recipientName: z.string().optional(),
  recipientTitle: z.string().optional(),
  companyAddress: z.string().optional(),
  instructions: z.string().optional(),
});
export type GenerateCoverLetterInput = z.infer<typeof GenerateCoverLetterInputSchema>;

/** AI-generated tailored resume response */
export const TailoredResumeResponseSchema = z.object({
  canonicalResume: CanonicalResumeSchema,
  htmlPreview: z.string(),
  changes: z.array(z.object({
    section: z.string(),
    field: z.string(),
    original: z.string().optional(),
    proposed: z.string(),
    reason: z.string(),
    isNew: z.boolean().default(false),
  })).default([]),
  warnings: z.array(z.string()).default([]),
});
export type TailoredResumeResponse = z.infer<typeof TailoredResumeResponseSchema>;

/** AI-generated cover letter response */
export const GeneratedCoverLetterResponseSchema = z.object({
  canonicalCoverLetter: CanonicalCoverLetterSchema,
  htmlPreview: z.string(),
  warnings: z.array(z.string()).default([]),
});
export type GeneratedCoverLetterResponse = z.infer<typeof GeneratedCoverLetterResponseSchema>;

/** Export options */
export const ExportOptionsSchema = z.object({
  format: z.enum(['pdf', 'docx', 'html']),
  margins: z.object({
    top: z.number().default(20),
    right: z.number().default(20),
    bottom: z.number().default(20),
    left: z.number().default(20),
  }).optional(),
  pageSize: z.enum(['A4', 'Letter']).default('A4'),
});
export type ExportOptions = z.infer<typeof ExportOptionsSchema>;

/** Generated document view for API responses */
export const GeneratedDocumentViewSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  jobId: z.string(),
  originalResumeId: z.string(),
  matchReportId: z.string().optional(),
  type: GeneratedDocumentTypeSchema,
  status: GeneratedDocumentStatusSchema,
  canonicalContent: z.union([CanonicalResumeSchema, CanonicalCoverLetterSchema]),
  templateId: z.string().optional(),
  templateName: z.string().optional(),
  gridFsFileId: z.string().optional(), // For exported PDF/DOCX
  fileName: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  exportedAt: z.string().optional(),
});
export type GeneratedDocumentView = z.infer<typeof GeneratedDocumentViewSchema>;

/** Resume template view for API responses */
export const ResumeTemplateViewSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  isDefault: z.boolean(),
  isSystem: z.boolean().default(false), // System templates can't be deleted
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ResumeTemplateView = z.infer<typeof ResumeTemplateViewSchema>;

/** Cover letter template view for API responses */
export const CoverLetterTemplateViewSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  isDefault: z.boolean(),
  isSystem: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CoverLetterTemplateView = z.infer<typeof CoverLetterTemplateViewSchema>;