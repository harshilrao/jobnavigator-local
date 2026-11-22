import mongoose, { Schema, type Document, type Model } from 'mongoose';
import type { JobSource } from '../jobs/job.model';

export type ScrapeSessionStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'cancelled'
  | 'completed'
  | 'failed';

export type ScrapeEventType =
  | 'started'
  | 'source_started'
  | 'job_discovered'
  | 'job_saved'
  | 'job_skipped'
  | 'progress'
  | 'error'
  | 'cancelled'
  | 'complete';

export interface ScrapeSourceCount {
  source: JobSource;
  fetched: number;
  valid: number;
  matchedFilters: number;
  duplicates: number;
  saved: number;
  skipped: number;
  failed: number;
  missingDescriptions: number;
}

export interface ScrapeSessionDoc extends Document {
  ownerId: mongoose.Types.ObjectId;
  // Immutable snapshot of the filter used to start this session.
  filterSnapshot: Record<string, unknown>;
  sources: JobSource[];
  locations: string[];
  status: ScrapeSessionStatus;
  counts: ScrapeSourceCount[];
  totalFetched: number;
  totalSaved: number;
  totalSkipped: number;
  totalFailed: number;
  // Pagination state for incremental scraping
  nextOffset: number;
  batchLimit: number;
  startedAt: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  cancelRequested: boolean;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScrapeEventDoc extends Document {
  sessionId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  type: ScrapeEventType;
  source?: JobSource;
  message?: string;
  jobId?: string;
  jobTitle?: string;
  counts?: ScrapeSourceCount[];
  progress?: number;
  elapsedMs?: number;
  eta?: string;
  timestamp: Date;
}

const scrapeSourceCountSchema = new Schema<ScrapeSourceCount>({
  source: { type: String, required: true },
  fetched: { type: Number, default: 0, required: true },
  valid: { type: Number, default: 0, required: true },
  matchedFilters: { type: Number, default: 0, required: true },
  duplicates: { type: Number, default: 0, required: true },
  saved: { type: Number, default: 0, required: true },
  skipped: { type: Number, default: 0, required: true },
  failed: { type: Number, default: 0, required: true },
  missingDescriptions: { type: Number, default: 0, required: true },
});

const scrapeSessionSchema = new Schema<ScrapeSessionDoc>(
  {
    ownerId: { type: Schema.Types.ObjectId, required: true, index: true },
    filterSnapshot: { type: Schema.Types.Mixed, required: true },
    sources: [{ type: String, required: true }],
    locations: [{ type: String }],
    status: {
      type: String,
      enum: ['queued', 'running', 'paused', 'cancelled', 'completed', 'failed'],
      default: 'queued',
      required: true,
      index: true,
    },
    counts: [scrapeSourceCountSchema],
    totalFetched: { type: Number, default: 0, required: true },
    totalSaved: { type: Number, default: 0, required: true },
    totalSkipped: { type: Number, default: 0, required: true },
    totalFailed: { type: Number, default: 0, required: true },
    // Pagination state for incremental scraping
    nextOffset: { type: Number, default: 0, required: true },
    batchLimit: { type: Number, default: 10, required: true },
    startedAt: { type: Date, required: true, default: Date.now },
    completedAt: { type: Date },
    cancelledAt: { type: Date },
    cancelRequested: { type: Boolean, default: false, required: true },
    errorMessage: { type: String },
  },
  { timestamps: true }
);

scrapeSessionSchema.index({ ownerId: 1, status: 1, createdAt: -1 });

export const ScrapeSession: Model<ScrapeSessionDoc> =
  mongoose.models.ScrapeSession ??
  mongoose.model<ScrapeSessionDoc>('ScrapeSession', scrapeSessionSchema);

const scrapeEventSchema = new Schema<ScrapeEventDoc>(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: 'ScrapeSession', required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, required: true, index: true },
    type: {
      type: String,
      enum: [
        'started',
        'source_started',
        'job_discovered',
        'job_saved',
        'job_skipped',
        'progress',
        'error',
        'cancelled',
        'complete',
      ],
      required: true,
    },
    source: { type: String },
    message: { type: String },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job' },
    jobTitle: { type: String },
    counts: [scrapeSourceCountSchema],
    progress: { type: Number },
    elapsedMs: { type: Number },
    eta: { type: String },
    timestamp: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

scrapeEventSchema.index({ sessionId: 1, timestamp: 1 });
scrapeEventSchema.index({ ownerId: 1, timestamp: -1 });

export const ScrapeEvent: Model<ScrapeEventDoc> =
  mongoose.models.ScrapeEvent ??
  mongoose.model<ScrapeEventDoc>('ScrapeEvent', scrapeEventSchema);
