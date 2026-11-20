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
    email: z.string().email().nullable().optional(),
    phone: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    linkedin: z.string().nullable().optional().transform((val) => {
      if (!val || val === '') return null;
      try { new URL(val); return val; } catch { return null; }
    }),
    github: z.string().nullable().optional().transform((val) => {
      if (!val || val === '') return null;
      try { new URL(val); return val; } catch { return null; }
    }),
    website: z.string().nullable().optional().transform((val) => {
      if (!val || val === '') return null;
      try { new URL(val); return val; } catch { return null; }
    }),
    summary: z.string().nullable().optional(),
  }),
  skills: z.array(z.object({
    name: z.string(),
    category: z.string().nullable().optional(),
    level: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).nullable().optional(),
    evidence: z.string().nullable().optional(), // Resume quote supporting this skill
  })).default([]),
  experience: z.array(z.object({
    company: z.string(),
    title: z.string(),
    location: z.string().nullable().optional(),
    startDate: z.string(), // ISO date string
    endDate: z.string().nullable().optional(), // ISO date string or 'present'
    current: z.boolean().default(false),
    description: z.string(),
    highlights: z.array(z.string()).default([]),
    technologies: z.array(z.string()).default([]),
  })).default([]),
  education: z.array(z.object({
    institution: z.string(),
    degree: z.string(),
    fieldOfStudy: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    gpa: z.string().nullable().optional(),
    highlights: z.array(z.string()).default([]),
  })).default([]),
  projects: z.array(z.object({
    name: z.string(),
    description: z.string(),
    highlights: z.array(z.string()).default([]),
    technologies: z.array(z.string()).default([]),
    url: z.string().nullable().optional().transform((val) => {
      if (!val || val === '') return null;
      try { new URL(val); return val; } catch { return null; }
    }),
  })).default([]),
  certifications: z.array(z.object({
    name: z.string(),
    issuer: z.string(),
    date: z.string().nullable().optional(),
    url: z.string().nullable().optional().transform((val) => {
      if (!val || val === '') return null;
      try { new URL(val); return val; } catch { return null; }
    }),
  })).default([]),
  languages: z.array(z.object({
    language: z.string(),
    proficiency: z.enum(['native', 'fluent', 'conversational', 'basic']).nullable().optional(),
  })).default([]),
});
export type CanonicalResume = z.infer<typeof CanonicalResumeSchema>;

/** Canonical cover letter JSON */
export const CanonicalCoverLetterSchema = z.object({
  header: z.object({
    senderName: z.string(),
    senderEmail: z.string().email(),
    senderPhone: z.string().nullable().optional(),
    senderLocation: z.string().nullable().optional(),
    recipientName: z.string().nullable().optional(),
    recipientTitle: z.string().nullable().optional(),
    companyName: z.string(),
    companyAddress: z.string().nullable().optional(),
    date: z.string(), // ISO date string
  }),
  salutation: z.string().nullable().optional(),
  body: z.array(z.string()).default([]),
  closing: z.string().nullable().optional(),
  signature: z.string().nullable().optional(),
  tone: z.enum(['professional', 'enthusiastic', 'confident', 'conversational']).nullable().optional().default('professional'),
  length: z.enum(['short', 'medium', 'long']).nullable().optional().default('medium'),
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

/** Raw AI response for tailored resume (all fields optional for repair tolerance) */
// Accept both 'canonicalResume' (expected) and 'tailoredResume' (what AI actually returns)
// Use a loose schema that accepts any structure for AI tolerance
const LooseCanonicalResumeSchema = z.record(z.unknown()).optional();

export const RawTailoredResumeResponseSchema = z.object({
  // Support multiple field names that AI might return:
  // - canonicalResume (expected by prompt)
  // - tailoredResume (what AI returned initially)
  // - tailoredCanonicalResume (what AI returns now)
  canonicalResume: LooseCanonicalResumeSchema,
  tailoredResume: LooseCanonicalResumeSchema,
  tailoredCanonicalResume: LooseCanonicalResumeSchema,
  changes: z.array(z.object({
    section: z.string(),
    field: z.string(),
    original: z.string().nullable().optional(),
    proposed: z.string().nullable().optional(),
    reason: z.string().nullable().optional(),
    isNew: z.boolean().nullable().optional(),
  })).optional(),
  warnings: z.array(z.string()).nullable().optional(),
}).passthrough(); // Allow extra fields
export type RawTailoredResumeResponse = z.infer<typeof RawTailoredResumeResponseSchema>;

/** AI-generated tailored resume response (from AI, before HTML preview is built) */
export const TailoredResumeResponseSchema = z.object({
  canonicalResume: CanonicalResumeSchema,
  changes: z.array(z.object({
    section: z.string(),
    field: z.string(),
    original: z.string().nullable().optional(),
    proposed: z.string(),
    reason: z.string().nullable().optional().default(''),
    isNew: z.boolean().default(false),
  })).default([]),
  warnings: z.array(z.string()).default([]),
});
export type TailoredResumeResponse = z.infer<typeof TailoredResumeResponseSchema>;

/** Full tailored resume response including HTML preview (for API responses) */
export const FullTailoredResumeResponseSchema = TailoredResumeResponseSchema.extend({
  htmlPreview: z.string(),
});
export type FullTailoredResumeResponse = z.infer<typeof FullTailoredResumeResponseSchema>;

/** AI-generated cover letter response */
export const GeneratedCoverLetterResponseSchema = z.object({
  canonicalCoverLetter: CanonicalCoverLetterSchema,
  htmlPreview: z.string(),
  warnings: z.array(z.string()).default([]),
});
export type GeneratedCoverLetterResponse = z.infer<typeof GeneratedCoverLetterResponseSchema>;

/** Raw AI response for cover letter (all fields optional for repair tolerance) */
// Accept both object and string (stringified JSON) for canonicalCoverLetter
const LooseCanonicalCoverLetterSchema = z.union([z.record(z.unknown()), z.string()]).optional();

export const RawGeneratedCoverLetterResponseSchema = z.object({
  canonicalCoverLetter: LooseCanonicalCoverLetterSchema,
  htmlPreview: z.string().optional(),
  warnings: z.array(z.union([z.string(), z.object({}).passthrough()])).nullable().optional(),
}).passthrough();
export type RawGeneratedCoverLetterResponse = z.infer<typeof RawGeneratedCoverLetterResponseSchema>;

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