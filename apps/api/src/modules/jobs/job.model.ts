import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type JobSource =
  | 'manual'
  | 'csv'
  | 'json'
  | 'url'
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'smartrecruiters'
  | 'linkedin'
  | 'indeed'
  | 'glassdoor'
  | 'zip_recruiter'
  | 'other';

export type RemoteType = 'remote' | 'hybrid' | 'onsite' | 'unspecified';
export type Seniority = 'intern' | 'entry' | 'mid' | 'senior' | 'lead' | 'unspecified';
export type EmploymentType =
  | 'full-time'
  | 'part-time'
  | 'contract'
  | 'temporary'
  | 'freelance'
  | 'unspecified';
export type DescriptionStatus = 'complete' | 'partial' | 'missing' | 'blocked' | 'closed';
export type JobQualityStatus = 'good' | 'limited' | 'unsupported';
export type SavedState = 'saved' | 'ignored' | 'viewed' | 'none';
export type ApplicationStage =
  | 'saved'
  | 'preparing'
  | 'ready_for_review'
  | 'applied'
  | 'assessment'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn';

export interface JobLocation {
  city?: string;
  region?: string;
  country?: string;
  remoteType: RemoteType;
}

export interface JobSalary {
  min?: number;
  max?: number;
  currency?: string;
  period?: 'hour' | 'month' | 'year';
}

export interface JobSourceLink {
  source: string;
  url: string;
  sourceJobId?: string;
  retrievedAt: Date;
}

export interface JobProvenance {
  source: JobSource;
  sourceJobId?: string;
  canonicalUrl?: string;
  originalUrl?: string;
  retrievedAt: Date;
  retrievalMethod: 'manual' | 'csv' | 'json' | 'url-fetch' | 'scrape';
}

export interface JobDoc extends Document {
  ownerId: mongoose.Types.ObjectId;
  companyId?: mongoose.Types.ObjectId;
  title: string;
  normalizedTitle?: string;
  description?: string;
  descriptionStatus: DescriptionStatus;
  location: JobLocation;
  salary?: JobSalary;
  remoteType: RemoteType;
  seniority?: Seniority;
  employmentType?: EmploymentType;
  departments?: string[];
  sources: JobSourceLink[];
  provenance: JobProvenance;
  qualityStatus: JobQualityStatus;
  isClosed: boolean;
  savedState: SavedState;
  aiScore?: number;
  aiScoreProvider?: string;
  aiScoredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const jobLocationSchema = new Schema<JobLocation>({
  city: { type: String },
  region: { type: String },
  country: { type: String },
  remoteType: {
    type: String,
    enum: ['remote', 'hybrid', 'onsite', 'unspecified'],
    default: 'unspecified',
    required: true,
  },
});

const jobSalarySchema = new Schema<JobSalary>({
  min: { type: Number },
  max: { type: Number },
  currency: { type: String },
  period: { type: String, enum: ['hour', 'month', 'year'] },
});

const jobSourceLinkSchema = new Schema<JobSourceLink>({
  source: { type: String, required: true },
  url: { type: String, required: true },
  sourceJobId: { type: String },
  retrievedAt: { type: Date, required: true, default: Date.now },
});

const jobProvenanceSchema = new Schema<JobProvenance>({
  source: {
    type: String,
    enum: [
      'manual',
      'csv',
      'json',
      'url',
      'greenhouse',
      'lever',
      'ashby',
      'smartrecruiters',
      'linkedin',
      'indeed',
      'glassdoor',
      'zip_recruiter',
      'other',
    ],
    required: true,
  },
  sourceJobId: { type: String },
  canonicalUrl: { type: String },
  originalUrl: { type: String },
  retrievedAt: { type: Date, required: true, default: Date.now },
  retrievalMethod: {
    type: String,
    enum: ['manual', 'csv', 'json', 'url-fetch', 'scrape'],
    required: true,
  },
});

const jobSchema = new Schema<JobDoc>(
  {
    ownerId: { type: Schema.Types.ObjectId, required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', index: true },
    title: { type: String, required: true },
    normalizedTitle: { type: String },
    description: { type: String, default: undefined },
    descriptionStatus: {
      type: String,
      enum: ['complete', 'partial', 'missing', 'blocked', 'closed'],
      default: 'missing',
      required: true,
    },
    location: { type: jobLocationSchema, required: true },
    salary: { type: jobSalarySchema },
    remoteType: {
      type: String,
      enum: ['remote', 'hybrid', 'onsite', 'unspecified'],
      default: 'unspecified',
      required: true,
    },
    seniority: {
      type: String,
      enum: ['intern', 'entry', 'mid', 'senior', 'lead', 'unspecified'],
    },
    employmentType: {
      type: String,
      enum: [
        'full-time',
        'part-time',
        'contract',
        'temporary',
        'freelance',
        'unspecified',
      ],
    },
    departments: [{ type: String }],
    sources: [jobSourceLinkSchema],
    provenance: { type: jobProvenanceSchema, required: true },
    qualityStatus: {
      type: String,
      enum: ['good', 'limited', 'unsupported'],
      default: 'good',
      required: true,
    },
    isClosed: { type: Boolean, default: false, required: true },
    savedState: {
      type: String,
      enum: ['saved', 'ignored', 'viewed', 'none'],
      default: 'none',
      required: true,
      index: true,
    },
    aiScore: { type: Number },
    aiScoreProvider: { type: String },
    aiScoredAt: { type: Date },
  },
  { timestamps: true }
);

// Dedup index: same source + sourceJobId should not create duplicate jobs
// for the same owner. Different owners may save the same source job.
jobSchema.index(
  { 'provenance.source': 1, 'provenance.sourceJobId': 1, ownerId: 1 },
  { unique: true, partialFilterExpression: { 'provenance.sourceJobId': { $exists: true } } }
);

// Index for list queries
jobSchema.index({ ownerId: 1, savedState: 1, createdAt: -1 });
jobSchema.index({ ownerId: 1, title: 'text', companyId: 1 });

export const Job: Model<JobDoc> =
  mongoose.models.Job ?? mongoose.model<JobDoc>('Job', jobSchema);

export interface CompanyDoc extends Document {
  name: string;
  normalizedName: string;
  domains: string[];
  atsIds: { ats: string; atsId: string }[];
  createdAt: Date;
  updatedAt: Date;
}

const companySchema = new Schema<CompanyDoc>(
  {
    name: { type: String, required: true },
    normalizedName: { type: String, required: true },
    domains: [{ type: String }],
    atsIds: [{ ats: { type: String }, atsId: { type: String } }],
  },
  { timestamps: true }
);

companySchema.index({ normalizedName: 1 }, { unique: true });

export const Company: Model<CompanyDoc> =
  mongoose.models.Company ?? mongoose.model<CompanyDoc>('Company', companySchema);

export interface RawPostingDoc extends Document {
  source: string;
  sourceJobId: string;
  originalUrl: string;
  canonicalUrl?: string;
  retrievedAt: Date;
  rawFields: Record<string, unknown>;
  qualityStatus: JobQualityStatus;
  descriptionStatus: DescriptionStatus;
  normalizedJobId?: mongoose.Types.ObjectId;
}

const rawPostingSchema = new Schema<RawPostingDoc>(
  {
    source: { type: String, required: true },
    sourceJobId: { type: String, required: true },
    originalUrl: { type: String, required: true },
    canonicalUrl: { type: String },
    retrievedAt: { type: Date, required: true, default: Date.now },
    rawFields: { type: Schema.Types.Mixed, default: {} },
    qualityStatus: {
      type: String,
      enum: ['good', 'limited', 'unsupported'],
      default: 'good',
      required: true,
    },
    descriptionStatus: {
      type: String,
      enum: ['complete', 'partial', 'missing', 'blocked', 'closed'],
      default: 'missing',
      required: true,
    },
    normalizedJobId: { type: Schema.Types.ObjectId, ref: 'Job' },
  },
  { timestamps: true }
);

rawPostingSchema.index(
  { source: 1, sourceJobId: 1 },
  { unique: true }
);

export const RawPosting: Model<RawPostingDoc> =
  mongoose.models.RawPosting ?? mongoose.model<RawPostingDoc>('RawPosting', rawPostingSchema);

export interface UserJobDoc extends Document {
  ownerId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  savedState: SavedState;
  notes?: string;
  stage: ApplicationStage;
  createdAt: Date;
  updatedAt: Date;
}

const userJobSchema = new Schema<UserJobDoc>(
  {
    ownerId: { type: Schema.Types.ObjectId, required: true, index: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    savedState: {
      type: String,
      enum: ['saved', 'ignored', 'viewed', 'none'],
      default: 'none',
      required: true,
    },
    notes: { type: String },
    stage: {
      type: String,
      enum: [
        'saved',
        'preparing',
        'ready_for_review',
        'applied',
        'assessment',
        'interview',
        'offer',
        'rejected',
        'withdrawn',
      ],
      default: 'saved',
      required: true,
    },
  },
  { timestamps: true }
);

userJobSchema.index({ ownerId: 1, jobId: 1 }, { unique: true });

export const UserJob: Model<UserJobDoc> =
  mongoose.models.UserJob ?? mongoose.model<UserJobDoc>('UserJob', userJobSchema);

export interface SavedSearchDoc extends Document {
  ownerId: mongoose.Types.ObjectId;
  name: string;
  keywords?: string[];
  includeTitles?: string[];
  excludeTitles?: string[];
  includeCompanies?: string[];
  excludeCompanies?: string[];
  locations?: string[];
  remoteTypes?: RemoteType[];
  employmentTypes?: EmploymentType[];
  seniorities?: Seniority[];
  salaryMin?: number;
  salaryMax?: number;
  postingAgeDays?: number;
  sources?: JobSource[];
  isScheduled: boolean;
  lastRunAt?: Date;
  nextRunAt?: Date;
  status: 'active' | 'paused' | 'error';
  createdAt: Date;
  updatedAt: Date;
}

const savedSearchSchema = new Schema<SavedSearchDoc>(
  {
    ownerId: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true },
    keywords: [{ type: String }],
    includeTitles: [{ type: String }],
    excludeTitles: [{ type: String }],
    includeCompanies: [{ type: String }],
    excludeCompanies: [{ type: String }],
    locations: [{ type: String }],
    remoteTypes: [{ type: String, enum: ['remote', 'hybrid', 'onsite', 'unspecified'] }],
    employmentTypes: [{ type: String }],
    seniorities: [{ type: String }],
    salaryMin: { type: Number },
    salaryMax: { type: Number },
    postingAgeDays: { type: Number },
    sources: [{ type: String }],
    isScheduled: { type: Boolean, default: false, required: true },
    lastRunAt: { type: Date },
    nextRunAt: { type: Date },
    status: {
      type: String,
      enum: ['active', 'paused', 'error'],
      default: 'active',
      required: true,
    },
  },
  { timestamps: true }
);

savedSearchSchema.index({ ownerId: 1, status: 1 });

export const SavedSearch: Model<SavedSearchDoc> =
  mongoose.models.SavedSearch ?? mongoose.model<SavedSearchDoc>('SavedSearch', savedSearchSchema);
