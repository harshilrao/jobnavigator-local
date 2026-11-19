import mongoose, { type Document, type Model, type Schema } from 'mongoose';

/** Resume template document */
export interface ResumeTemplateDoc extends Document {
  ownerId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  htmlTemplate: string;
  cssTemplate: string;
  isDefault: boolean;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Cover letter template document */
export interface CoverLetterTemplateDoc extends Document {
  ownerId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  htmlTemplate: string;
  cssTemplate: string;
  isDefault: boolean;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Generated document type */
export type GeneratedDocumentType = 'resume' | 'cover-letter';

/** Generated document status */
export type GeneratedDocumentStatus = 'draft' | 'approved' | 'exported';

/** Canonical resume structure (stored as Mixed) */
export interface CanonicalResume {
  basics: {
    name: string;
    email?: string | null;
    phone?: string | null;
    location?: string | null;
    linkedin?: string | null;
    github?: string | null;
    website?: string | null;
    summary?: string | null;
  };
  skills: Array<{
    name: string;
    category?: string | null;
    level?: 'beginner' | 'intermediate' | 'advanced' | 'expert' | null;
    evidence?: string | null;
  }>;
  experience: Array<{
    company: string;
    title: string;
    location?: string | null;
    startDate: string | null;
    endDate?: string | null;
    current: boolean;
    description?: string | null;
    highlights: string[];
    technologies: string[];
  }>;
  education: Array<{
    institution: string;
    degree: string;
    fieldOfStudy?: string | null;
    location?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    gpa?: string | null;
    highlights: string[];
  }>;
  projects: Array<{
    name: string;
    description?: string | null;
    highlights: string[];
    technologies: string[];
    url?: string | null;
  }>;
  certifications: Array<{
    name: string;
    issuer: string;
    date?: string | null;
    url?: string | null;
  }>;
  languages: Array<{
    language: string;
    proficiency?: 'native' | 'fluent' | 'conversational' | 'basic' | null;
  }>;
}

/** Canonical cover letter structure (stored as Mixed) */
export interface CanonicalCoverLetter {
  header: {
    senderName: string;
    senderEmail: string;
    senderPhone?: string | null;
    senderLocation?: string | null;
    recipientName?: string | null;
    recipientTitle?: string | null;
    companyName: string;
    companyAddress?: string | null;
    date: string;
  };
  salutation?: string | null;
  body: string[];
  closing?: string | null;
  signature?: string | null;
  tone?: 'professional' | 'enthusiastic' | 'confident' | 'conversational' | null;
  length?: 'short' | 'medium' | 'long' | null;
}

/** Generated document document */
export interface GeneratedDocumentDoc extends Document {
  ownerId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  originalResumeId: mongoose.Types.ObjectId;
  matchReportId?: mongoose.Types.ObjectId;
  type: GeneratedDocumentType;
  status: GeneratedDocumentStatus;
  canonicalContent: CanonicalResume | CanonicalCoverLetter;
  templateId?: mongoose.Types.ObjectId;
  templateName?: string;
  gridFsFileId?: mongoose.Types.ObjectId; // For exported PDF/DOCX
  fileName?: string;
  createdAt: Date;
  updatedAt: Date;
  exportedAt?: Date;
}

// Resume Template Schema
const ResumeTemplateSchema = new mongoose.Schema<ResumeTemplateDoc>({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, maxlength: 100 },
  description: { type: String },
  htmlTemplate: { type: String, required: true },
  cssTemplate: { type: String, required: true },
  isDefault: { type: Boolean, default: false },
  isSystem: { type: Boolean, default: false },
}, { timestamps: true });

// Cover Letter Template Schema
const CoverLetterTemplateSchema = new mongoose.Schema<CoverLetterTemplateDoc>({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, maxlength: 100 },
  description: { type: String },
  htmlTemplate: { type: String, required: true },
  cssTemplate: { type: String, required: true },
  isDefault: { type: Boolean, default: false },
  isSystem: { type: Boolean, default: false },
}, { timestamps: true });

// Generated Document Schema
const GeneratedDocumentSchema = new mongoose.Schema<GeneratedDocumentDoc>({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
  originalResumeId: { type: mongoose.Schema.Types.ObjectId, ref: 'OriginalDocument', required: true },
  matchReportId: { type: mongoose.Schema.Types.ObjectId, ref: 'MatchReport' },
  type: { type: String, enum: ['resume', 'cover-letter'], required: true },
  status: { type: String, enum: ['draft', 'approved', 'exported'], default: 'draft' },
  canonicalContent: { type: mongoose.Schema.Types.Mixed, required: true },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'ResumeTemplate' },
  templateName: { type: String },
  gridFsFileId: { type: mongoose.Schema.Types.ObjectId },
  fileName: { type: String },
  exportedAt: { type: Date },
}, { timestamps: true });

// Indexes
GeneratedDocumentSchema.index({ ownerId: 1, jobId: 1, type: 1 });
GeneratedDocumentSchema.index({ ownerId: 1, createdAt: -1 });
GeneratedDocumentSchema.index({ originalResumeId: 1 });

// Models
export const ResumeTemplate: Model<ResumeTemplateDoc> =
  mongoose.models.ResumeTemplate ?? mongoose.model<ResumeTemplateDoc>('ResumeTemplate', ResumeTemplateSchema);

export const CoverLetterTemplate: Model<CoverLetterTemplateDoc> =
  mongoose.models.CoverLetterTemplate ?? mongoose.model<CoverLetterTemplateDoc>('CoverLetterTemplate', CoverLetterTemplateSchema);

export const GeneratedDocument: Model<GeneratedDocumentDoc> =
  mongoose.models.GeneratedDocument ?? mongoose.model<GeneratedDocumentDoc>('GeneratedDocument', GeneratedDocumentSchema);

/** Default system resume template (ATS-friendly, single-column) */
export const DEFAULT_RESUME_TEMPLATE = {
  name: 'ATS Standard',
  description: 'Clean, single-column layout optimized for ATS parsing',
  htmlTemplate: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>{{basics.name}} - Resume</title>
  <style>{{{css}}}</style>
</head>
<body>
  <div class="resume">
    <header class="header">
      <h1 class="name">{{basics.name}}</h1>
      <div class="contact">
        {{#if basics.email}}<span class="contact-item">{{basics.email}}</span>{{/if}}
        {{#if basics.phone}}<span class="contact-item">{{basics.phone}}</span>{{/if}}
        {{#if basics.location}}<span class="contact-item">{{basics.location}}</span>{{/if}}
        {{#if basics.linkedin}}<span class="contact-item"><a href="{{basics.linkedin}}">LinkedIn</a></span>{{/if}}
        {{#if basics.github}}<span class="contact-item"><a href="{{basics.github}}">GitHub</a></span>{{/if}}
        {{#if basics.website}}<span class="contact-item"><a href="{{basics.website}}">Website</a></span>{{/if}}
      </div>
    </header>

    {{#if basics.summary}}
    <section class="section">
      <h2>Summary</h2>
      <p>{{basics.summary}}</p>
    </section>
    {{/if}}

    {{#if skills.length}}
    <section class="section">
      <h2>Skills</h2>
      <ul class="skills-list">
        {{#each skills}}
        <li>{{name}}{{#if category}} ({{category}}){{/if}}{{#if level}} - {{level}}{{/if}}</li>
        {{/each}}
      </ul>
    </section>
    {{/if}}

    {{#if experience.length}}
    <section class="section">
      <h2>Experience</h2>
      {{#each experience}}
      <div class="entry">
        <div class="entry-header">
          <h3 class="title">{{title}}</h3>
          <span class="company">{{company}}</span>
        </div>
        <div class="entry-meta">
          {{#if location}}<span class="location">{{location}}</span>{{/if}}
          <span class="dates">{{startDate}} - {{#if current}}Present{{else}}{{endDate}}{{/if}}</span>
        </div>
        <p class="description">{{description}}</p>
        {{#if highlights.length}}
        <ul class="highlights">
          {{#each highlights}}<li>{{this}}</li>{{/each}}
        </ul>
        {{/if}}
        {{#if technologies.length}}
        <div class="technologies">Technologies: {{join technologies ", "}}</div>
        {{/if}}
      </div>
      {{/each}}
    </section>
    {{/if}}

    {{#if education.length}}
    <section class="section">
      <h2>Education</h2>
      {{#each education}}
      <div class="entry">
        <h3 class="degree">{{degree}}</h3>
        <span class="institution">{{institution}}</span>
        {{#if fieldOfStudy}}<span class="field">{{fieldOfStudy}}</span>{{/if}}
        {{#if location}}<span class="location">{{location}}</span>{{/if}}
        {{#if startDate || endDate}}<span class="dates">{{startDate}} - {{endDate}}</span>{{/if}}
        {{#if highlights.length}}
        <ul class="highlights">
          {{#each highlights}}<li>{{this}}</li>{{/each}}
        </ul>
        {{/if}}
      </div>
      {{/each}}
    </section>
    {{/if}}

    {{#if projects.length}}
    <section class="section">
      <h2>Projects</h2>
      {{#each projects}}
      <div class="entry">
        <h3 class="project-name">{{name}}</h3>
        <p class="description">{{description}}</p>
        {{#if highlights.length}}
        <ul class="highlights">
          {{#each highlights}}<li>{{this}}</li>{{/each}}
        </ul>
        {{/if}}
        {{#if technologies.length}}
        <div class="technologies">Technologies: {{join technologies ", "}}</div>
        {{/if}}
        {{#if url}}<div class="url"><a href="{{url}}">{{url}}</a></div>{{/if}}
      </div>
      {{/each}}
    </section>
    {{/if}}

    {{#if certifications.length}}
    <section class="section">
      <h2>Certifications</h2>
      {{#each certifications}}
      <div class="entry">
        <h3>{{name}}</h3>
        <span class="issuer">{{issuer}}</span>
        {{#if date}}<span class="date">{{date}}</span>{{/if}}
        {{#if url}}<a href="{{url}}">Verify</a>{{/if}}
      </div>
      {{/each}}
    </section>
    {{/if}}

    {{#if languages.length}}
    <section class="section">
      <h2>Languages</h2>
      <ul class="skills-list">
        {{#each languages}}
        <li>{{language}}{{#if proficiency}} ({{proficiency}}){{/if}}</li>
        {{/each}}
      </ul>
    </section>
    {{/if}}
  </div>
</body>
</html>`,
  cssTemplate: `@page { size: A4; margin: 20mm; }
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #1a1a1a; }
.resume { max-width: 800px; margin: 0 auto; }
.header { text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #2d2d2d; }
.name { font-size: 28pt; font-weight: 700; margin: 0 0 8px; color: #1a1a1a; }
.contact { display: flex; flex-wrap: wrap; justify-content: center; gap: 16px; font-size: 10pt; color: #4a4a4a; }
.contact-item a { color: #2d2d2d; text-decoration: none; }
.contact-item a:hover { text-decoration: underline; }
.section { margin-bottom: 24px; }
.section h2 { font-size: 14pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 12px; padding-bottom: 4px; border-bottom: 1px solid #e0e0e0; color: #1a1a1a; }
.entry { margin-bottom: 16px; }
.entry-header { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 8px; }
.entry-header .title { font-size: 12pt; font-weight: 600; margin: 0; color: #1a1a1a; }
.entry-header .company { font-weight: 500; color: #333; }
.entry-meta { display: flex; gap: 16px; font-size: 10pt; color: #666; margin-bottom: 4px; }
.description { margin: 8px 0; color: #333; }
.highlights { margin: 8px 0 0; padding-left: 20px; }
.highlights li { margin: 4px 0; }
.technologies { font-size: 10pt; color: #666; font-style: italic; margin-top: 8px; }
.project-name { font-size: 11pt; font-weight: 600; margin: 0 0 4px; }
.degree { font-size: 11pt; font-weight: 600; margin: 0 0 4px; }
.institution { font-weight: 500; color: #333; }
.field { color: #666; font-size: 10pt; }
.skills-list { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
.skills-list li { background: #f5f5f5; padding: 4px 10px; border-radius: 4px; font-size: 10pt; }
.url a { color: #2d2d2d; text-decoration: none; }
.url a:hover { text-decoration: underline; }`,
  isDefault: true,
  isSystem: true,
};

/** Default system cover letter template */
export const DEFAULT_COVER_LETTER_TEMPLATE = {
  name: 'Professional Standard',
  description: 'Classic business letter format',
  htmlTemplate: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Cover Letter - {{header.senderName}}</title>
  <style>{{{css}}}</style>
</head>
<body>
  <div class="letter">
    <header class="letter-header">
      <div class="sender">
        <p class="sender-name">{{header.senderName}}</p>
        {{#if header.senderEmail}}<p>{{header.senderEmail}}</p>{{/if}}
        {{#if header.senderPhone}}<p>{{header.senderPhone}}</p>{{/if}}
        {{#if header.senderLocation}}<p>{{header.senderLocation}}</p>{{/if}}
      </div>
      <div class="date">{{header.date}}</div>
      <div class="recipient">
        {{#if header.recipientName}}<p>{{header.recipientName}}</p>{{/if}}
        {{#if header.recipientTitle}}<p>{{header.recipientTitle}}</p>{{/if}}
        <p>{{header.companyName}}</p>
        {{#if header.companyAddress}}<p>{{header.companyAddress}}</p>{{/if}}
      </div>
    </header>

    <div class="salutation">{{salutation}}</div>

    <div class="body">
      {{#each body}}
      <p>{{this}}</p>
      {{/each}}
    </div>

    <div class="closing">
      <p>{{closing}}</p>
      <p class="signature">{{signature}}</p>
    </div>
  </div>
</body>
</html>`,
  cssTemplate: `@page { size: A4; margin: 25mm; }
* { box-sizing: border-box; }
body { font-family: Georgia, 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.6; color: #1a1a1a; }
.letter { max-width: 700px; margin: 0 auto; }
.letter-header { display: flex; justify-content: space-between; margin-bottom: 32px; }
.sender { text-align: left; }
.sender-name { font-weight: 600; font-size: 13pt; margin: 0 0 4px; }
.sender p { margin: 2px 0; color: #444; font-size: 11pt; }
.date { text-align: right; margin-bottom: 24px; color: #444; }
.recipient { text-align: right; margin-bottom: 24px; }
.recipient p { margin: 2px 0; }
.salutation { margin-bottom: 16px; font-weight: 500; }
.body { margin-bottom: 24px; }
.body p { margin: 0 0 12px; text-align: justify; }
.closing { margin-top: 24px; }
.signature { margin-top: 48px; font-weight: 500; }`,
  isDefault: true,
  isSystem: true,
};