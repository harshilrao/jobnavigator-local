import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type AIProviderId = 'ollama' | 'fcc-proxy';

export type MatchReportStatus = 'pending' | 'complete' | 'failed';

export interface MatchReportDoc extends Document {
  ownerId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  resumeId: mongoose.Types.ObjectId; // OriginalDocument
  provider: AIProviderId;
  modelName: string; // provider model id (avoid clash with Document.model)
  promptVersion: string;
  matchScore: number; // 0-100 heuristic
  matchReport: Record<string, unknown>; // Zod-validated structured JSON
  resumeChecksum: string;
  jdChecksum: string;
  status: MatchReportStatus;
  errorMessage?: string;
  generatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const matchReportSchema = new Schema<MatchReportDoc>(
  {
    ownerId: { type: Schema.Types.ObjectId, required: true, index: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    resumeId: { type: Schema.Types.ObjectId, ref: 'OriginalDocument', required: true },
    provider: {
      type: String,
      enum: ['ollama', 'fcc-proxy'],
      required: true,
    },
    modelName: { type: String, required: true },
    promptVersion: { type: String, required: true },
    matchScore: { type: Number, required: true, min: 0, max: 100 },
    matchReport: { type: Schema.Types.Mixed, required: true },
    resumeChecksum: { type: String, required: true },
    jdChecksum: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'complete', 'failed'],
      default: 'pending',
      required: true,
    },
    errorMessage: { type: String },
    generatedAt: { type: Date },
  },
  { timestamps: true }
);

// One report per (owner, job, resume, model, prompt version) — idempotent re-scoring.
matchReportSchema.index(
  { ownerId: 1, jobId: 1, resumeId: 1, modelName: 1, promptVersion: 1 },
  { unique: true }
);

export const MatchReport: Model<MatchReportDoc> =
  mongoose.models.MatchReport ??
  mongoose.model<MatchReportDoc>('MatchReport', matchReportSchema);
