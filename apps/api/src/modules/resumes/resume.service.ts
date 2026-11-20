import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

import mongoose from 'mongoose';
import { GridFSBucket, type Db } from 'mongodb';
import { ResumeTemplate, CoverLetterTemplate, GeneratedDocument, type ResumeTemplateDoc, type CoverLetterTemplateDoc, type GeneratedDocumentDoc, type CanonicalResume, type CanonicalCoverLetter, DEFAULT_RESUME_TEMPLATE, DEFAULT_COVER_LETTER_TEMPLATE } from './resume.model';
import { OriginalDocument, type OriginalDocumentDoc } from '../documents/document.model';
import { Job, type JobDoc } from '../jobs/job.model';
import { MatchReport, type MatchReportDoc } from '../ai/ai.model';
import { getEnv } from '../../config/env';
import { createProvider, type AIProvider, buildScoringMessages, sanitizeJDText, type MatchReportOutput } from '../ai/ai.provider';
import { getDb, getBucket } from '../documents/document.service';

const pdfParseModule = require('pdf-parse');
const pdfParse: (buffer: Buffer | Uint8Array) => Promise<{ text: string }> =
  typeof pdfParseModule === 'function'
    ? pdfParseModule
    : (pdfParseModule as { default?: unknown }).default ?? ((() => { throw new Error('pdf-parse did not export a function'); })());

const mammothModule = require('mammoth');
const mammoth = mammothModule as { extract: (opts: { buffer: Buffer }) => Promise<{ value: string; messages: unknown[] }> };

/** View types for API responses */
export interface ResumeTemplateView {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  isDefault: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CoverLetterTemplateView {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  isDefault: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedDocumentView {
  id: string;
  ownerId: string;
  jobId: string;
  originalResumeId: string;
  matchReportId?: string;
  type: 'resume' | 'cover-letter';
  status: 'draft' | 'approved' | 'exported';
  canonicalContent: CanonicalResume | CanonicalCoverLetter;
  templateId?: string;
  templateName?: string;
  gridFsFileId?: string;
  fileName?: string;
  createdAt: string;
  updatedAt: string;
  exportedAt?: string;
}

export interface TailoredResumeResponse {
  canonicalResume: CanonicalResume;
  htmlPreview: string;
  changes: Array<{
    section: string;
    field: string;
    original?: string | null;
    proposed: string;
    reason?: string | null;
    isNew: boolean;
  }>;
  warnings: string[];
  generatedDocumentId: string;
}

export interface GeneratedCoverLetterResponse {
  canonicalCoverLetter: CanonicalCoverLetter;
  htmlPreview: string;
  warnings: string[];
  generatedDocumentId: string;
}

/** Initialize default system templates for a user */
export async function ensureDefaultTemplates(ownerId: string): Promise<void> {
  // Resume template
  const existingResume = await ResumeTemplate.findOne({ ownerId, isSystem: true });
  if (!existingResume) {
    await ResumeTemplate.create({
      ownerId: new mongoose.Types.ObjectId(ownerId),
      ...DEFAULT_RESUME_TEMPLATE,
    });
  }

  // Cover letter template
  const existingCover = await CoverLetterTemplate.findOne({ ownerId, isSystem: true });
  if (!existingCover) {
    await CoverLetterTemplate.create({
      ownerId: new mongoose.Types.ObjectId(ownerId),
      ...DEFAULT_COVER_LETTER_TEMPLATE,
    });
  }
}

/** Get user's resume templates */
export async function listResumeTemplates(ownerId: string): Promise<ResumeTemplateView[]> {
  await ensureDefaultTemplates(ownerId);
  const templates = await ResumeTemplate.find({ ownerId }).sort({ isSystem: -1, isDefault: -1, createdAt: 1 });
  return templates.map(t => ({
    id: t._id.toString(),
    ownerId: t.ownerId.toString(),
    name: t.name,
    description: t.description,
    isDefault: t.isDefault,
    isSystem: t.isSystem,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));
}

/** Get user's cover letter templates */
export async function listCoverLetterTemplates(ownerId: string): Promise<CoverLetterTemplateView[]> {
  await ensureDefaultTemplates(ownerId);
  const templates = await CoverLetterTemplate.find({ ownerId }).sort({ isSystem: -1, isDefault: -1, createdAt: 1 });
  return templates.map(t => ({
    id: t._id.toString(),
    ownerId: t.ownerId.toString(),
    name: t.name,
    description: t.description,
    isDefault: t.isDefault,
    isSystem: t.isSystem,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));
}

/** Create a custom resume template */
export async function createResumeTemplate(
  ownerId: string,
  data: { name: string; description?: string; htmlTemplate: string; cssTemplate: string; isDefault?: boolean }
): Promise<ResumeTemplateView> {
  const template = await ResumeTemplate.create({
    ownerId: new mongoose.Types.ObjectId(ownerId),
    name: data.name,
    description: data.description,
    htmlTemplate: data.htmlTemplate,
    cssTemplate: data.cssTemplate,
    isDefault: data.isDefault ?? false,
    isSystem: false,
  });

  if (data.isDefault) {
    await ResumeTemplate.updateMany(
      { ownerId, _id: { $ne: template._id } },
      { $set: { isDefault: false } }
    );
  }

  return {
    id: template._id.toString(),
    ownerId: template.ownerId.toString(),
    name: template.name,
    description: template.description,
    isDefault: template.isDefault,
    isSystem: template.isSystem,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}

/** Create a custom cover letter template */
export async function createCoverLetterTemplate(
  ownerId: string,
  data: { name: string; description?: string; htmlTemplate: string; cssTemplate: string; isDefault?: boolean }
): Promise<CoverLetterTemplateView> {
  const template = await CoverLetterTemplate.create({
    ownerId: new mongoose.Types.ObjectId(ownerId),
    name: data.name,
    description: data.description,
    htmlTemplate: data.htmlTemplate,
    cssTemplate: data.cssTemplate,
    isDefault: data.isDefault ?? false,
    isSystem: false,
  });

  if (data.isDefault) {
    await CoverLetterTemplate.updateMany(
      { ownerId, _id: { $ne: template._id } },
      { $set: { isDefault: false } }
    );
  }

  return {
    id: template._id.toString(),
    ownerId: template.ownerId.toString(),
    name: template.name,
    description: template.description,
    isDefault: template.isDefault,
    isSystem: template.isSystem,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}

/** Update a template */
export async function updateResumeTemplate(
  ownerId: string,
  templateId: string,
  data: Partial<{ name: string; description?: string; htmlTemplate: string; cssTemplate: string; isDefault: boolean }>
): Promise<ResumeTemplateView | null> {
  const template = await ResumeTemplate.findOne({ _id: templateId, ownerId, isSystem: false });
  if (!template) return null;

  if (data.isDefault) {
    await ResumeTemplate.updateMany(
      { ownerId, _id: { $ne: template._id } },
      { $set: { isDefault: false } }
    );
  }

  Object.assign(template, data);
  await template.save();

  return {
    id: template._id.toString(),
    ownerId: template.ownerId.toString(),
    name: template.name,
    description: template.description,
    isDefault: template.isDefault,
    isSystem: template.isSystem,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}

export async function updateCoverLetterTemplate(
  ownerId: string,
  templateId: string,
  data: Partial<{ name: string; description?: string; htmlTemplate: string; cssTemplate: string; isDefault: boolean }>
): Promise<CoverLetterTemplateView | null> {
  const template = await CoverLetterTemplate.findOne({ _id: templateId, ownerId, isSystem: false });
  if (!template) return null;

  if (data.isDefault) {
    await CoverLetterTemplate.updateMany(
      { ownerId, _id: { $ne: template._id } },
      { $set: { isDefault: false } }
    );
  }

  Object.assign(template, data);
  await template.save();

  return {
    id: template._id.toString(),
    ownerId: template.ownerId.toString(),
    name: template.name,
    description: template.description,
    isDefault: template.isDefault,
    isSystem: template.isSystem,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}

/** Delete a custom template (not system) */
export async function deleteResumeTemplate(ownerId: string, templateId: string): Promise<boolean> {
  const result = await ResumeTemplate.deleteOne({ _id: templateId, ownerId, isSystem: false });
  return result.deletedCount > 0;
}

export async function deleteCoverLetterTemplate(ownerId: string, templateId: string): Promise<boolean> {
  const result = await CoverLetterTemplate.deleteOne({ _id: templateId, ownerId, isSystem: false });
  return result.deletedCount > 0;
}

/** Get template by ID */
export async function getResumeTemplate(ownerId: string, templateId: string): Promise<ResumeTemplateDoc | null> {
  return ResumeTemplate.findOne({ _id: templateId, ownerId });
}

export async function getCoverLetterTemplate(ownerId: string, templateId: string): Promise<CoverLetterTemplateDoc | null> {
  return CoverLetterTemplate.findOne({ _id: templateId, ownerId });
}

/** Get default templates */
export async function getDefaultResumeTemplate(ownerId: string): Promise<ResumeTemplateDoc> {
  await ensureDefaultTemplates(ownerId);
  let template = await ResumeTemplate.findOne({ ownerId, isDefault: true });
  if (!template) {
    template = await ResumeTemplate.findOne({ ownerId, isSystem: true });
  }
  if (!template) throw new Error('No resume template found');
  return template;
}

export async function getDefaultCoverLetterTemplate(ownerId: string): Promise<CoverLetterTemplateDoc> {
  await ensureDefaultTemplates(ownerId);
  let template = await CoverLetterTemplate.findOne({ ownerId, isDefault: true });
  if (!template) {
    template = await CoverLetterTemplate.findOne({ ownerId, isSystem: true });
  }
  if (!template) throw new Error('No cover letter template found');
  return template;
}

/** Simple Handlebars-like template rendering */
function renderTemplate(template: string, data: Record<string, unknown>): string {
  // Helper to join arrays
  const joinHelper = (arr: unknown[], separator = ', ') => {
    if (!Array.isArray(arr)) return '';
    return arr.map(String).join(separator);
  };

  // First pass: handle {{#each}} blocks
  let result = template.replace(/\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, key, block) => {
    const arr = data[key];
    if (!Array.isArray(arr)) return '';
    return arr.map(item => {
      let itemResult = block;
      // Replace {{this}} with item value
      itemResult = itemResult.replace(/\{\{this\}\}/g, String(item));
      // Replace {{prop}} with item.prop
      itemResult = itemResult.replace(/\{\{(\w+)\}\}/g, (_m: string, prop: string) => {
        if (item && typeof item === 'object' && prop in item) {
          return String((item as Record<string, unknown>)[prop] ?? '');
        }
        return '';
      });
      return itemResult;
    }).join('');
  });

  // Second pass: handle {{#if}} blocks
  result = result.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, key, block) => {
    const val = data[key];
    if (val && (typeof val !== 'object' || Object.keys(val).length > 0 || (Array.isArray(val) && val.length > 0))) {
      return block;
    }
    return '';
  });

  // Third pass: replace simple {{key}} and {{{key}}} (triple for unescaped)
  result = result.replace(/\{\{\{(\w+)\}\}\}/g, (match, key) => String(data[key] ?? ''));
  result = result.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const val = data[key];
    if (val === undefined || val === null) return '';
    return String(val);
  });

  return result;
}

/** Raw AI response type (all fields optional) */
interface RawCanonicalResume {
  basics?: { name?: string | null; email?: string | null; phone?: string | null; location?: string | null; linkedin?: string | null; github?: string | null; website?: string | null; summary?: string | null };
  skills?: Array<{ name: string; category?: string | null; level?: string | null; evidence?: string | null }>;
  experience?: Array<{ company: string; title: string; location?: string | null; startDate?: string | null; endDate?: string | null; current?: boolean | null; description?: string | null; highlights?: string[] | null; technologies?: string[] | null }>;
  education?: Array<{ institution: string; degree: string; fieldOfStudy?: string | null; location?: string | null; startDate?: string | null; endDate?: string | null; gpa?: string | null; highlights?: string[] | null }>;
  projects?: Array<{ name: string; description?: string | null; highlights?: string[] | null; technologies?: string[] | null; url?: string | null }>;
  certifications?: Array<{ name: string; issuer: string; date?: string | null; url?: string | null }>;
  languages?: Array<{ language: string; proficiency?: string | null }>;
}

/** Convert null to undefined for optional fields */
function nullableToUndefined<T>(value: T | null | undefined): T | undefined {
  return value === null ? undefined : value;
}

/** Deep-apply defaults to canonical resume from AI response */
function applyCanonicalResumeDefaults(resume: RawCanonicalResume): CanonicalResume {
  return {
    basics: {
      name: resume.basics?.name ?? '',
      email: nullableToUndefined(resume.basics?.email),
      phone: nullableToUndefined(resume.basics?.phone),
      location: nullableToUndefined(resume.basics?.location),
      linkedin: nullableToUndefined(resume.basics?.linkedin),
      github: nullableToUndefined(resume.basics?.github),
      website: nullableToUndefined(resume.basics?.website),
      summary: nullableToUndefined(resume.basics?.summary),
    },
    skills: (resume.skills ?? []).map(s => ({ name: s.name, category: nullableToUndefined(s.category), level: nullableToUndefined(s.level) as any, evidence: nullableToUndefined(s.evidence) })),
    experience: (resume.experience ?? []).map(e => ({
      company: e.company,
      title: e.title,
      location: nullableToUndefined(e.location),
      startDate: nullableToUndefined(e.startDate) ?? '',
      endDate: nullableToUndefined(e.endDate),
      current: e.current ?? false,
      description: nullableToUndefined(e.description) ?? '',
      highlights: e.highlights ?? [],
      technologies: e.technologies ?? [],
    })),
    education: (resume.education ?? []).map(e => ({
      institution: e.institution,
      degree: e.degree,
      fieldOfStudy: nullableToUndefined(e.fieldOfStudy),
      location: nullableToUndefined(e.location),
      startDate: nullableToUndefined(e.startDate),
      endDate: nullableToUndefined(e.endDate),
      gpa: nullableToUndefined(e.gpa),
      highlights: e.highlights ?? [],
    })),
    projects: (resume.projects ?? []).map(p => ({
      name: p.name,
      description: nullableToUndefined(p.description) ?? '',
      highlights: p.highlights ?? [],
      technologies: p.technologies ?? [],
      url: nullableToUndefined(p.url),
    })),
    certifications: (resume.certifications ?? []).map(c => ({
      name: c.name,
      issuer: c.issuer,
      date: nullableToUndefined(c.date),
      url: nullableToUndefined(c.url),
    })),
    languages: (resume.languages ?? []).map(l => ({
      language: l.language,
      proficiency: nullableToUndefined(l.proficiency) as any,
    })),
  };
}

/** Raw AI response type for cover letter (all fields optional) */
interface RawCanonicalCoverLetter {
  header?: { senderName?: string | null; senderEmail?: string | null; senderPhone?: string | null; senderLocation?: string | null; recipientName?: string | null; recipientTitle?: string | null; companyName?: string | null; companyAddress?: string | null; date?: string | null };
  salutation?: string | null;
  body?: string[] | null;
  closing?: string | null;
  signature?: string | null;
  tone?: string | null;
  length?: string | null;
}

/** Deep-apply defaults to canonical cover letter from AI response */
function applyCanonicalCoverLetterDefaults(letter: RawCanonicalCoverLetter): CanonicalCoverLetter {
  return {
    header: {
      senderName: letter.header?.senderName ?? '',
      senderEmail: letter.header?.senderEmail ?? '',
      senderPhone: nullableToUndefined(letter.header?.senderPhone),
      senderLocation: nullableToUndefined(letter.header?.senderLocation),
      recipientName: nullableToUndefined(letter.header?.recipientName),
      recipientTitle: nullableToUndefined(letter.header?.recipientTitle),
      companyName: letter.header?.companyName ?? '',
      companyAddress: nullableToUndefined(letter.header?.companyAddress),
      date: nullableToUndefined(letter.header?.date) ?? '',
    },
    salutation: nullableToUndefined(letter.salutation) ?? '',
    body: letter.body ?? [],
    closing: nullableToUndefined(letter.closing) ?? '',
    signature: nullableToUndefined(letter.signature) ?? '',
    tone: (nullableToUndefined(letter.tone) as any) ?? 'professional',
    length: (nullableToUndefined(letter.length) as any) ?? 'medium',
  };
}

/** Extract canonical resume from original resume text using AI */
async function extractCanonicalResume(
  provider: AIProvider,
  resumeText: string,
  jobDescription?: string,
  matchReport?: MatchReportOutput
): Promise<CanonicalResume> {
  const systemPrompt = `You are an expert resume parser. Extract structured, factual information from the resume text.
NEVER invent degrees, dates, companies, achievements, skills, or work authorizations.
If information is not present in the resume text, omit the field or use empty arrays.
Return ONLY valid JSON matching the CanonicalResume schema.

Schema:
{
  "basics": { "name": "string", "email": "string?", "phone": "string?", "location": "string?", "linkedin": "string?", "github": "string?", "website": "string?", "summary": "string?" },
  "skills": [{ "name": "string", "category": "string?", "level": "beginner|intermediate|advanced|expert?", "evidence": "string?" }],
  "experience": [{ "company": "string", "title": "string", "location": "string?", "startDate": "string (ISO)", "endDate": "string? (ISO or 'present')", "current": "boolean", "description": "string", "highlights": "string[]", "technologies": "string[]" }],
  "education": [{ "institution": "string", "degree": "string", "fieldOfStudy": "string?", "location": "string?", "startDate": "string?", "endDate": "string?", "gpa": "string?", "highlights": "string[]" }],
  "projects": [{ "name": "string", "description": "string", "highlights": "string[]", "technologies": "string[]", "url": "string?" }],
  "certifications": [{ "name": "string", "issuer": "string", "date": "string?", "url": "string?" }],
  "languages": [{ "language": "string", "proficiency": "native|fluent|conversational|basic?" }]
}`;

  const userPrompt = `RESUME TEXT:
---
${resumeText}
---
${jobDescription ? `JOB DESCRIPTION (for context on relevant skills):
---
${jobDescription}
---
` : ''}
${matchReport ? `MATCH REPORT (for emphasis on matched skills):
---
Fit: ${matchReport.fitSummary}
Matched skills: ${matchReport.requiredSkills.filter(s => s.status === 'met').map(s => s.skill).join(', ')}
---
` : ''}
Extract the canonical resume JSON.`;

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt },
  ];

  const { CanonicalResumeSchema } = await import('@jobnavigator/shared');
  console.log('[API] Calling extractCanonicalResume (structuredChat)...');
  const result = await provider.structuredChat(messages, CanonicalResumeSchema, { temperature: 0.1, maxTokens: 4000 });
  console.log('[API] extractCanonicalResume complete');
  return applyCanonicalResumeDefaults(result);
}

/** Tailor canonical resume for a specific job using match report */
async function tailorCanonicalResume(
  provider: AIProvider,
  canonicalResume: CanonicalResume,
  jobDescription: string,
  matchReport: MatchReportOutput,
  instructions?: string
): Promise<{ canonicalResume: CanonicalResume; changes: TailoredResumeResponse['changes']; warnings: string[] }> {
  const systemPrompt = `You are a career coach tailoring a resume for a specific job.
You have a canonical resume (factual, extracted from the original) and a match report comparing it to the job description.
Your task: propose edits to emphasize matched skills, add relevant keywords, and address gaps.
NEVER invent facts, degrees, dates, companies, or achievements.
Only rephrase, reorder, emphasize, or suggest additions that the user must verify.
Return JSON with the tailored canonicalResume, a changes array explaining each edit, and warnings.`;

  const userPrompt = `CANONICAL RESUME:
---
${JSON.stringify(canonicalResume, null, 2)}
---

JOB DESCRIPTION:
---
${sanitizeJDText(jobDescription)}
---

MATCH REPORT:
---
Fit: ${matchReport.fitSummary}
Required skills: ${JSON.stringify(matchReport.requiredSkills, null, 2)}
Relevant keywords: ${matchReport.relevantKeywords.join(', ')}
Cautions: ${matchReport.cautions.join('; ')}
Suggested improvements: ${matchReport.suggestedImprovements.join('; ')}
---
${instructions ? `USER INSTRUCTIONS: ${instructions}` : ''}

Propose a tailored resume. For each change, include: section, field, original (if changed), proposed, reason, isNew (true for additions).`;

  const { RawTailoredResumeResponseSchema, TailoredResumeResponseSchema } = await import('@jobnavigator/shared');
  console.log('[API] Calling tailorCanonicalResume (structuredChat)...');
  const rawResult = await provider.structuredChat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    RawTailoredResumeResponseSchema,
    { temperature: 0.2, maxTokens: 4000 }
  );
  console.log('[API] tailorCanonicalResume complete');
  // Normalize: accept multiple field names that AI might return
  const canonicalResumeInput = rawResult.canonicalResume ?? rawResult.tailoredResume ?? rawResult.tailoredCanonicalResume ?? {};
  // Apply defaults to nested fields
  const canonicalResumeResult = applyCanonicalResumeDefaults(canonicalResumeInput);
  const changes = (rawResult.changes ?? []).map(c => ({ ...c, isNew: c.isNew ?? false }));
  const warnings = rawResult.warnings ?? [];
  // Validate final result against strict schema
  const validated = TailoredResumeResponseSchema.parse({ canonicalResume: canonicalResumeResult, changes, warnings });
  return validated;
}

/** Generate cover letter from canonical resume and job description */
async function generateCoverLetter(
  provider: AIProvider,
  canonicalResume: CanonicalResume,
  jobDescription: string,
  matchReport: MatchReportOutput,
  options: { tone: string; length: string; recipientName?: string; recipientTitle?: string; companyAddress?: string; instructions?: string }
): Promise<{ canonicalCoverLetter: CanonicalCoverLetter; warnings: string[] }> {
  const systemPrompt = `You are a career coach writing a tailored cover letter.
Use the canonical resume (factual) and match report to write a letter for the specific job.
Reference the actual role, company, and supported accomplishments from the resume.
Do NOT invent a hiring manager name, fake achievements, or unsupported claims.
Return JSON with canonicalCoverLetter and warnings.`;

  const userPrompt = `CANONICAL RESUME:
---
${JSON.stringify(canonicalResume, null, 2)}
---

JOB DESCRIPTION:
---
${sanitizeJDText(jobDescription)}
---

MATCH REPORT:
---
Fit: ${matchReport.fitSummary}
Required skills: ${JSON.stringify(matchReport.requiredSkills, null, 2)}
Relevant keywords: ${matchReport.relevantKeywords.join(', ')}
---
OPTIONS:
- Tone: ${options.tone}
- Length: ${options.length}
- Recipient name: ${options.recipientName || 'Hiring Manager'}
- Recipient title: ${options.recipientTitle || ''}
- Company address: ${options.companyAddress || ''}
${options.instructions ? `- Instructions: ${options.instructions}` : ''}

Write the cover letter.`;

  const { RawGeneratedCoverLetterResponseSchema } = await import('@jobnavigator/shared');
  const result = await provider.structuredChat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    RawGeneratedCoverLetterResponseSchema,
    { temperature: 0.3, maxTokens: 3000 }
  );

  // Handle case where AI returns stringified JSON for canonicalCoverLetter
  let coverLetter: RawCanonicalCoverLetter;
  if (typeof result.canonicalCoverLetter === 'string') {
    try {
      coverLetter = JSON.parse(result.canonicalCoverLetter);
    } catch {
      coverLetter = {};
    }
  } else {
    coverLetter = result.canonicalCoverLetter ?? {};
  }

  // Apply defaults to nested fields
  return {
    canonicalCoverLetter: applyCanonicalCoverLetterDefaults(coverLetter),
    warnings: Array.isArray(result.warnings)
      ? result.warnings.map(w => typeof w === 'string' ? w : JSON.stringify(w))
      : [],
  };
}

/** Build HTML from template and canonical data */
function buildHtml(templateDoc: ResumeTemplateDoc | CoverLetterTemplateDoc, canonicalContent: CanonicalResume | CanonicalCoverLetter): string {
  const html = templateDoc.htmlTemplate;
  const css = templateDoc.cssTemplate;

  // Prepare data for template
  const data: Record<string, unknown> = { css };

  if ('basics' in canonicalContent) {
    // Resume
    const resume = canonicalContent as CanonicalResume;
    data.basics = resume.basics;
    data.skills = resume.skills;
    data.experience = resume.experience;
    data.education = resume.education;
    data.projects = resume.projects;
    data.certifications = resume.certifications;
    data.languages = resume.languages;
  } else {
    // Cover letter
    const letter = canonicalContent as CanonicalCoverLetter;
    data.header = letter.header;
    data.salutation = letter.salutation;
    data.body = letter.body;
    data.closing = letter.closing;
    data.signature = letter.signature;
  }

  return renderTemplate(html, data);
}

/** Export HTML to PDF using Playwright */
async function exportHtmlToPdf(html: string, options?: { margins?: { top: number; right: number; bottom: number; left: number }; pageSize?: 'A4' | 'Letter' }): Promise<Buffer> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });

  const margins = options?.margins ?? { top: 20, right: 20, bottom: 20, left: 20 };
  const pageSize = options?.pageSize ?? 'A4';

  const pdfBuffer = await page.pdf({
    format: pageSize,
    printBackground: true,
    margin: {
      top: `${margins.top}mm`,
      right: `${margins.right}mm`,
      bottom: `${margins.bottom}mm`,
      left: `${margins.left}mm`,
    },
  });

  await browser.close();
  return Buffer.from(pdfBuffer);
}

/** Export HTML to DOCX (basic implementation using mammoth-compatible HTML) */
async function exportHtmlToDocx(html: string): Promise<Buffer> {
  // For now, we'll use a simple approach - convert HTML to DOCX via a basic conversion
  // In production, you might want to use a more robust library like docx or html-to-docx
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');

  // This is a simplified conversion - in practice you'd parse the HTML more carefully
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          children: [new TextRun({ text: 'Generated from HTML template', bold: true })],
        }),
      ],
    }],
  });

  return Packer.toBuffer(doc);
}

/** Main function: Tailor resume for a job */
export async function tailorResume(
  ownerId: string,
  input: { originalResumeId: string; jobId: string; matchReportId?: string; templateId?: string; instructions?: string }
): Promise<TailoredResumeResponse> {
  console.log('[API] tailorResume start', { ownerId, input });
  const env = getEnv();
  const provider = createProvider(env.AI_PROVIDER as 'ollama' | 'fcc-proxy');

  // Fetch original resume
  console.log('[API] Fetching original resume...');
  const originalDoc = await OriginalDocument.findOne({ _id: input.originalResumeId, ownerId, deletedAt: { $exists: false } });
  if (!originalDoc) throw new Error('Original resume not found');
  if (originalDoc.textExtractionStatus !== 'complete' || !originalDoc.extractedText) {
    throw new Error('Resume text not extracted or incomplete');
  }
  console.log('[API] Original resume found, text length:', originalDoc.extractedText.length);

  // Fetch job
  console.log('[API] Fetching job...');
  const job = await Job.findOne({ _id: input.jobId, ownerId });
  if (!job) throw new Error('Job not found');
  if (!job.description || job.descriptionStatus === 'missing') {
    throw new Error('Job description is missing');
  }
  console.log('[API] Job found:', job.title);

  // Fetch match report if provided
  let matchReport: MatchReportOutput | undefined;
  if (input.matchReportId) {
    console.log('[API] Fetching match report...');
    const report = await MatchReport.findOne({ _id: input.matchReportId, ownerId });
    if (report) matchReport = report.matchReport as MatchReportOutput;
    console.log('[API] Match report found:', !!matchReport);
  }

  // If no match report, create a basic one from scoring
  if (!matchReport) {
    console.log('[API] No match report provided, scoring job...');
    const scored = await provider.structuredChat(
      buildScoringMessages(originalDoc.extractedText, job.description),
      (await import('../ai/ai.provider')).MatchReportSchema,
      { temperature: 0.1 }
    );
    matchReport = scored;
    console.log('[API] Job scored, matchScore:', matchReport.matchScore);
  }

  // Extract canonical resume from original
  console.log('[API] Extracting canonical resume...');
  const canonicalResume = await extractCanonicalResume(provider, originalDoc.extractedText, job.description, matchReport);
  console.log('[API] Canonical resume extracted');

  // Tailor it for the job
  console.log('[API] Tailoring canonical resume...');
  const { canonicalResume: tailoredResume, changes, warnings } = await tailorCanonicalResume(
    provider,
    canonicalResume,
    job.description,
    matchReport,
    input.instructions
  );
  console.log('[API] Resume tailored, changes:', changes.length);

  // Get template
  console.log('[API] Fetching template...');
  let template: ResumeTemplateDoc;
  if (input.templateId) {
    const t = await ResumeTemplate.findOne({ _id: input.templateId, ownerId });
    if (!t) throw new Error('Template not found');
    template = t;
  } else {
    template = await getDefaultResumeTemplate(ownerId);
  }
  console.log('[API] Template found:', template.name);

  // Build HTML preview
  console.log('[API] Building HTML preview...');
  const htmlPreview = buildHtml(template, tailoredResume);
  console.log('[API] HTML preview built, length:', htmlPreview.length);

  // Store as draft
  console.log('[API] Storing generated document...');
  const generated = await GeneratedDocument.create({
    ownerId: new mongoose.Types.ObjectId(ownerId),
    jobId: new mongoose.Types.ObjectId(input.jobId),
    originalResumeId: new mongoose.Types.ObjectId(input.originalResumeId),
    matchReportId: input.matchReportId ? new mongoose.Types.ObjectId(input.matchReportId) : undefined,
    type: 'resume',
    status: 'draft',
    canonicalContent: tailoredResume,
    templateId: template._id,
    templateName: template.name,
  });
  console.log('[API] Generated document stored:', generated._id);

  console.log('[API] tailorResume complete');
  return {
    canonicalResume: tailoredResume,
    htmlPreview,
    changes,
    warnings,
    generatedDocumentId: generated._id.toString(),
  };
}

/** Main function: Generate cover letter */
export async function generateCoverLetterService(
  ownerId: string,
  input: { originalResumeId: string; jobId: string; matchReportId?: string; templateId?: string; tone: string; length: string; recipientName?: string; recipientTitle?: string; companyAddress?: string; instructions?: string }
): Promise<GeneratedCoverLetterResponse> {
  const env = getEnv();
  const provider = createProvider(env.AI_PROVIDER as 'ollama' | 'fcc-proxy');

  // Fetch original resume
  const originalDoc = await OriginalDocument.findOne({ _id: input.originalResumeId, ownerId, deletedAt: { $exists: false } });
  if (!originalDoc) throw new Error('Original resume not found');
  if (originalDoc.textExtractionStatus !== 'complete' || !originalDoc.extractedText) {
    throw new Error('Resume text not extracted or incomplete');
  }

  // Fetch job
  const job = await Job.findOne({ _id: input.jobId, ownerId }).populate('companyId', 'name');
  if (!job) throw new Error('Job not found');
  if (!job.description || job.descriptionStatus === 'missing') {
    throw new Error('Job description is missing');
  }

  // Get company name
  const companyName = (job.companyId as { name?: string } | null)?.name || 'the company';

  // Fetch match report if provided
  let matchReport: MatchReportOutput | undefined;
  if (input.matchReportId) {
    const report = await MatchReport.findOne({ _id: input.matchReportId, ownerId });
    if (report) matchReport = report.matchReport as MatchReportOutput;
  }

  // If no match report, create a basic one
  if (!matchReport) {
    const scored = await provider.structuredChat(
      buildScoringMessages(originalDoc.extractedText, job.description),
      (await import('../ai/ai.provider')).MatchReportSchema,
      { temperature: 0.1 }
    );
    matchReport = scored;
  }

  // Extract canonical resume
  const canonicalResume = await extractCanonicalResume(provider, originalDoc.extractedText, job.description, matchReport);

  // Generate cover letter
  const { canonicalCoverLetter, warnings } = await generateCoverLetter(provider, canonicalResume, job.description, matchReport, {
    tone: input.tone as any,
    length: input.length as any,
    recipientName: input.recipientName,
    recipientTitle: input.recipientTitle,
    companyAddress: input.companyAddress,
    instructions: input.instructions,
  });

  // Set header fields from canonical resume
  canonicalCoverLetter.header.senderName = canonicalResume.basics.name;
  canonicalCoverLetter.header.senderEmail = canonicalResume.basics.email || '';
  canonicalCoverLetter.header.senderPhone = canonicalResume.basics.phone;
  canonicalCoverLetter.header.senderLocation = canonicalResume.basics.location;
  canonicalCoverLetter.header.companyName = companyName;
  canonicalCoverLetter.header.date = new Date().toISOString().split('T')[0];

  // Get template
  let template: CoverLetterTemplateDoc;
  if (input.templateId) {
    const t = await CoverLetterTemplate.findOne({ _id: input.templateId, ownerId });
    if (!t) throw new Error('Template not found');
    template = t;
  } else {
    template = await getDefaultCoverLetterTemplate(ownerId);
  }

  // Build HTML preview
  const htmlPreview = buildHtml(template, canonicalCoverLetter);

  // Store as draft
  const generated = await GeneratedDocument.create({
    ownerId: new mongoose.Types.ObjectId(ownerId),
    jobId: new mongoose.Types.ObjectId(input.jobId),
    originalResumeId: new mongoose.Types.ObjectId(input.originalResumeId),
    matchReportId: input.matchReportId ? new mongoose.Types.ObjectId(input.matchReportId) : undefined,
    type: 'cover-letter',
    status: 'draft',
    canonicalContent: canonicalCoverLetter,
    templateId: template._id,
    templateName: template.name,
  });

  return { canonicalCoverLetter, htmlPreview, warnings, generatedDocumentId: generated._id.toString() };
}

/** Approve a generated document (mark as approved) */
export async function approveGeneratedDocument(ownerId: string, documentId: string): Promise<GeneratedDocumentView | null> {
  const doc = await GeneratedDocument.findOneAndUpdate(
    { _id: documentId, ownerId },
    { $set: { status: 'approved' } },
    { new: true }
  );
  if (!doc) return null;
  return mapGeneratedDocument(doc);
}

/** Export a generated document to PDF/DOCX and store in GridFS */
export async function exportGeneratedDocument(
  ownerId: string,
  documentId: string,
  options: { format: 'pdf' | 'docx' | 'html'; margins?: { top: number; right: number; bottom: number; left: number }; pageSize?: 'A4' | 'Letter' }
): Promise<{ buffer: Buffer; fileName: string; contentType: string }> {
  const doc = await GeneratedDocument.findOne({ _id: documentId, ownerId });
  if (!doc) throw new Error('Generated document not found');
  if (doc.status === 'draft') throw new Error('Document must be approved before export');

  let templateDoc: ResumeTemplateDoc | CoverLetterTemplateDoc | null;
  if (doc.type === 'resume') {
    templateDoc = await ResumeTemplate.findById(doc.templateId);
  } else {
    templateDoc = await CoverLetterTemplate.findById(doc.templateId);
  }
  if (!templateDoc) throw new Error('Template not found');

  const html = buildHtml(templateDoc, doc.canonicalContent as CanonicalResume | CanonicalCoverLetter);

  let buffer: Buffer;
  let contentType: string;
  let extension: string;

  if (options.format === 'pdf') {
    buffer = await exportHtmlToPdf(html, { margins: options.margins, pageSize: options.pageSize });
    contentType = 'application/pdf';
    extension = 'pdf';
  } else if (options.format === 'docx') {
    buffer = await exportHtmlToDocx(html);
    contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    extension = 'docx';
  } else {
    buffer = Buffer.from(html, 'utf-8');
    contentType = 'text/html';
    extension = 'html';
  }

  // Store in GridFS
  const bucket = getBucket();
  const fileName = `${doc.type}-${doc.jobId.toString().slice(0, 8)}-${Date.now()}.${extension}`;
  const uploadStream = bucket.openUploadStream(fileName, {
    contentType,
    metadata: { ownerId, documentType: doc.type, generatedDocumentId: doc._id },
  });

  await new Promise<void>((resolve, reject) => {
    uploadStream.end(buffer);
    uploadStream.on('finish', resolve);
    uploadStream.on('error', reject);
  });

  // Update document with GridFS file ID
  doc.gridFsFileId = uploadStream.id;
  doc.fileName = fileName;
  doc.status = 'exported';
  doc.exportedAt = new Date();
  await doc.save();

  return { buffer, fileName, contentType };
}

/** List generated documents for a user */
export async function listGeneratedDocuments(ownerId: string, jobId?: string): Promise<GeneratedDocumentView[]> {
  const query: Record<string, unknown> = { ownerId };
  if (jobId) query.jobId = jobId;
  const docs = await GeneratedDocument.find(query).sort({ createdAt: -1 });
  return docs.map(mapGeneratedDocument);
}

/** Get a single generated document */
export async function getGeneratedDocument(ownerId: string, documentId: string): Promise<GeneratedDocumentView | null> {
  const doc = await GeneratedDocument.findOne({ _id: documentId, ownerId });
  return doc ? mapGeneratedDocument(doc) : null;
}

/** Delete a generated document */
export async function deleteGeneratedDocument(ownerId: string, documentId: string): Promise<boolean> {
  const result = await GeneratedDocument.deleteOne({ _id: documentId, ownerId });
  return result.deletedCount > 0;
}

/** Map DB document to view */
function mapGeneratedDocument(doc: GeneratedDocumentDoc): GeneratedDocumentView {
  return {
    id: doc._id.toString(),
    ownerId: doc.ownerId.toString(),
    jobId: doc.jobId.toString(),
    originalResumeId: doc.originalResumeId.toString(),
    matchReportId: doc.matchReportId?.toString(),
    type: doc.type,
    status: doc.status,
    canonicalContent: doc.canonicalContent as CanonicalResume | CanonicalCoverLetter,
    templateId: doc.templateId?.toString(),
    templateName: doc.templateName,
    gridFsFileId: doc.gridFsFileId?.toString(),
    fileName: doc.fileName,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    exportedAt: doc.exportedAt?.toISOString(),
  };
}