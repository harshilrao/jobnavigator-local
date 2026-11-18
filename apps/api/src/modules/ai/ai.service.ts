import { Types } from 'mongoose';
import { Job } from '../jobs/job.model';
import { OriginalDocument } from '../documents/document.model';
import { MatchReport, type MatchReportDoc } from './ai.model';
import { getEnv } from '../../config/env';
import {
  createProvider,
  type AIProvider,
  type AIProviderId,
  buildScoringMessages,
  textChecksum,
  type MatchReportOutput,
  MatchReportSchema,
  PROMPT_VERSION,
} from './ai.provider';

/** Cache TTL in ms — re-score only if resume or JD changed. */
const CACHE_VERSION = 'v1';

/**
 * Score a job against a resume using the configured AI provider.
 * Returns the MatchReportDoc (cached when inputs unchanged).
 */
export async function scoreJob(
  ownerId: string,
  jobId: string,
  resumeId: string,
  providerId: AIProviderId = 'ollama'
): Promise<MatchReportDoc> {
  if (!Types.ObjectId.isValid(jobId)) throw new Error('Invalid job ID');
  if (!Types.ObjectId.isValid(resumeId)) throw new Error('Invalid resume ID');

  const job = await Job.findOne({ _id: jobId, ownerId }).exec();
  if (!job) throw new Error('Job not found');

  const resume = await OriginalDocument.findOne({
    _id: resumeId,
    ownerId,
    deletedAt: { $exists: false },
    documentType: 'resume',
  }).exec();
  if (!resume) throw new Error('Resume not found');

  if (resume.textExtractionStatus !== 'complete' || !resume.extractedText) {
    throw new Error('Resume text is not available. Upload a resume with extractable text first.');
  }

  if (
    job.descriptionStatus !== 'complete' &&
    job.descriptionStatus !== 'partial'
  ) {
    throw new Error(
      `Job description is ${job.descriptionStatus}. Cannot score without a job description.`
    );
  }

  const jdText = job.description ?? '';
  const resumeText = resume.extractedText;

  const resumeChecksum = textChecksum(resumeText);
  const jdChecksum = textChecksum(jdText);

  // Try cache first: same owner, job, resume, model, prompt version, same checksums.
  const provider = createProvider(providerId);
  const modelName = provider.modelName;

  const cached = await MatchReport.findOne({
    ownerId,
    jobId,
    resumeId,
    modelName,
    promptVersion: `${PROMPT_VERSION}:${CACHE_VERSION}`,
    resumeChecksum,
    jdChecksum,
    status: 'complete',
  }).exec();

  if (cached) return cached;

  // Upsert by unique key: find-or-create a pending report so re-scoring works
  // even when a previous attempt left a pending/failed document behind.
  // Match on the unique index key (ownerId, jobId, resumeId, modelName,
  // promptVersion) — NOT checksums, since they may differ between attempts.
  const report = await MatchReport.findOneAndUpdate(
    {
      ownerId,
      jobId,
      resumeId,
      modelName,
      promptVersion: `${PROMPT_VERSION}:${CACHE_VERSION}`,
    },
    {
      $setOnInsert: {
        ownerId: new Types.ObjectId(ownerId),
        jobId: new Types.ObjectId(jobId),
        resumeId: new Types.ObjectId(resumeId),
        provider: providerId,
        modelName,
        promptVersion: `${PROMPT_VERSION}:${CACHE_VERSION}`,
        matchScore: 0,
        matchReport: {},
        status: 'pending',
      },
      $set: { resumeChecksum, jdChecksum },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).exec();

  try {
    const messages = buildScoringMessages(resumeText, jdText);
    const parsed: MatchReportOutput = await provider.structuredChat(
      messages,
      MatchReportSchema,
      { temperature: 0.2, maxTokens: 1500 }
    );

    report.matchScore = parsed.matchScore;
    report.matchReport = parsed;
    report.status = 'complete';
    report.generatedAt = new Date();
    await report.save();

    // Denormalize aiScore onto the Job for quick listing.
    await Job.findByIdAndUpdate(
      jobId,
      {
        aiScore: parsed.matchScore,
        aiScoreProvider: providerId,
        aiScoredAt: new Date(),
      },
      { new: true }
    ).exec();

    return report;
  } catch (err) {
    report.status = 'failed';
    report.errorMessage =
      err instanceof Error ? err.message : 'Failed to generate match report';
    await report.save();
    throw err;
  }
}

/** Get all match reports for a job (owner-scoped), newest first. */
export async function getJobMatches(
  ownerId: string,
  jobId: string
): Promise<MatchReportDoc[]> {
  if (!Types.ObjectId.isValid(jobId)) return [];
  return MatchReport.find({
    ownerId: new Types.ObjectId(ownerId),
    jobId: new Types.ObjectId(jobId),
  })
    .sort({ generatedAt: -1, createdAt: -1 })
    .exec();
}

/** Get a single match report (owner-scoped). */
export async function getMatchReport(
  ownerId: string,
  reportId: string
): Promise<MatchReportDoc | null> {
  if (!Types.ObjectId.isValid(reportId)) return null;
  return MatchReport.findOne({
    _id: reportId,
    ownerId: new Types.ObjectId(ownerId),
  }).exec();
}

/** List available providers with health status. */
export async function listProviders(): Promise<
  Array<{
    id: AIProviderId;
    name: string;
    enabled: boolean;
    reachable: boolean;
    latencyMs?: number;
    models: string[];
    error?: string;
  }>
> {
  const providers: AIProvider[] = [createProvider('ollama'), createProvider('fcc-proxy')];
  const results = await Promise.all(
    providers.map(async (p) => {
      const health = await p.healthCheck();
      let models: string[] = [];
      if (health.reachable) {
        try {
          models = await p.listModels();
        } catch {
          models = [];
        }
      }
      return {
        id: p.id,
        name: p.name,
        enabled: p.id === 'ollama' ? true : isFccProxyEnabled(),
        reachable: health.reachable,
        latencyMs: health.latencyMs,
        models,
        error: health.error,
      };
    })
  );
  return results;
}

/** Provider health check (single). */
export async function getProviderHealth(
  providerId: AIProviderId
): Promise<{ reachable: boolean; latencyMs?: number; error?: string; models: string[] }> {
  const provider = createProvider(providerId);
  const health = await provider.healthCheck();
  let models: string[] = [];
  if (health.reachable) {
    try {
      models = await provider.listModels();
    } catch {
      models = [];
    }
  }
  return { ...health, models };
}

function isFccProxyEnabled(): boolean {
  return getEnv().FCC_PROXY_ENABLED === true;
}
