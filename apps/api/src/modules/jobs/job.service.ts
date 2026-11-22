import {
  Types,
  type FilterQuery,
  type SortOrder,
  type UpdateQuery,
} from 'mongoose';
import {
  Job,
  Company,
  UserJob,
  type JobDoc,
  type JobSource,
  type RemoteType,
  type Seniority,
  type EmploymentType,
  type DescriptionStatus,
  type JobQualityStatus,
  type SavedState,
  type ApplicationStage,
  type JobLocation,
  type JobSalary,
  type JobProvenance,
  type JobSourceLink,
  type UserJobDoc,
} from './job.model';
import { JobFilterSchema, type JobFilter } from '@jobnavigator/shared';
import { RawPosting } from './job.model';
import { MatchReport } from '../ai/ai.model';
import { GeneratedDocument } from '../resumes/resume.model';

/** Minimal CSV parser (handles quoted fields with embedded commas). No extra dependency. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      i++; // skip opening quote
      let field = '';
      while (i < line.length) {
        if (line[i] === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          field += line[i];
          i++;
        }
      }
      fields.push(field);
      if (i < line.length && line[i] === ',') i++;
    } else {
      const comma = line.indexOf(',', i);
      if (comma === -1) {
        fields.push(line.slice(i));
        i = line.length;
      } else {
        fields.push(line.slice(i, comma));
        i = comma + 1;
      }
    }
  }
  return fields;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    header.forEach((key, idx) => {
      row[key] = values[idx] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

function normalize(value?: string): string {
  return (value ?? '').trim().toLowerCase();
}

export interface JobView {
  id: string;
  ownerId: string;
  companyId?: string;
  companyName?: string;
  title: string;
  normalizedTitle?: string;
  description?: string;
  descriptionStatus: DescriptionStatus;
  location: JobLocation;
  salary?: JobSalary;
  remoteType: RemoteType;
  seniority?: Seniority;
  employmentType?: EmploymentType;
  departments: string[];
  sources: JobSourceLink[];
  provenance: JobProvenance;
  qualityStatus: JobQualityStatus;
  isClosed: boolean;
  savedState: SavedState;
  aiScore?: number;

  // Phase 6A: JobSpy-specific fields
  jobType?: 'fulltime' | 'parttime' | 'contract' | 'internship' | 'temporary';
  workArrangement?: 'remote' | 'hybrid' | 'onsite';
  postedAt?: Date;
  emails?: string[];
  // Extracted/derived fields from description (clearly labelled as derived)
  derivedSkills?: string[];
  derivedExperienceYears?: string;
  derivedEducation?: string;
  derivedBenefits?: string[];
  derivedRequirements?: string[];

  createdAt: Date;
  updatedAt: Date;
}

function jobToView(doc: JobDoc): JobView {
  const companyName =
    doc.companyId && typeof doc.companyId === 'object' && 'name' in doc.companyId
      ? (doc.companyId as { name: string }).name
      : undefined;
  return {
    id: doc.id,
    ownerId: doc.ownerId.toString(),
    companyId: doc.companyId?.toString(),
    companyName,
    title: doc.title,
    normalizedTitle: doc.normalizedTitle,
    description: doc.description,
    descriptionStatus: doc.descriptionStatus,
    location: doc.location,
    salary: doc.salary,
    remoteType: doc.remoteType,
    seniority: doc.seniority,
    employmentType: doc.employmentType,
    departments: doc.departments ?? [],
    sources: doc.sources ?? [],
    provenance: doc.provenance,
    qualityStatus: doc.qualityStatus,
    isClosed: doc.isClosed,
    savedState: doc.savedState,
    aiScore: doc.aiScore,

    // Phase 6A: JobSpy-specific fields
    jobType: doc.jobType,
    workArrangement: doc.workArrangement,
    postedAt: doc.postedAt,
    emails: doc.emails,
    // Extracted/derived fields from description (clearly labelled as derived)
    derivedSkills: doc.derivedSkills,
    derivedExperienceYears: doc.derivedExperienceYears,
    derivedEducation: doc.derivedEducation,
    derivedBenefits: doc.derivedBenefits,
    derivedRequirements: doc.derivedRequirements,

    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export interface JobListResult {
  jobs: JobView[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Convert a public JobFilter into a MongoDB query for a given owner. */
export function buildJobQuery(
  ownerId: string,
  filter: JobFilter,
): FilterQuery<JobDoc> {
  const query: FilterQuery<JobDoc> = { ownerId: new Types.ObjectId(ownerId) };

  if (filter.q) {
    query.title = { $regex: filter.q, $options: 'i' };
  }
  if (filter.savedState) {
    query.savedState = filter.savedState;
  }
  if (filter.remoteType) {
    query.remoteType = filter.remoteType;
  }
  if (filter.seniority) {
    query.seniority = filter.seniority;
  }
  if (filter.employmentType) {
    query.employmentType = filter.employmentType;
  }
  if (filter.descriptionStatus) {
    query.descriptionStatus = filter.descriptionStatus;
  }
  if (filter.qualityStatus) {
    query.qualityStatus = filter.qualityStatus;
  }
  if (filter.isClosed !== undefined) {
    query.isClosed = filter.isClosed;
  }
  if (filter.sources?.length) {
    query['provenance.source'] = { $in: filter.sources };
  }
  // Salary overlap: job's range intersects the user's desired range.
  if (filter.minSalary !== undefined) {
    query['salary.max'] = { $gte: filter.minSalary };
  }
  if (filter.maxSalary !== undefined) {
    query['salary.min'] = { $lte: filter.maxSalary };
  }

  return query;
}

export async function listJobs(
  ownerId: string,
  rawFilter: unknown,
): Promise<JobListResult> {
  const parsed = JobFilterSchema.parse(rawFilter);
  const query = buildJobQuery(ownerId, parsed);

  const sort: Record<string, SortOrder> = {};
  sort[parsed.sort] = parsed.order;

  const [jobs, total] = await Promise.all([
    Job.find(query)
      .populate('companyId', 'name normalizedName')
      .sort(sort)
      .skip((parsed.page - 1) * parsed.limit)
      .limit(parsed.limit)
      .exec(),
    Job.countDocuments(query).exec(),
  ]);

  return {
    jobs: jobs.map(jobToView),
    total,
    page: parsed.page,
    limit: parsed.limit,
    totalPages: Math.ceil(total / parsed.limit),
  };
}

export async function getJob(
  ownerId: string,
  jobId: string,
): Promise<JobView | null> {
  if (!Types.ObjectId.isValid(jobId)) return null;
  const doc = await Job.findOne({
    _id: jobId,
    ownerId: new Types.ObjectId(ownerId),
  })
    .populate('companyId', 'name normalizedName')
    .exec();
  if (!doc) return null;
  return jobToView(doc);
}

export interface NewJobInput {
  title: string;
  company?: string;
  description?: string;
  descriptionStatus?: DescriptionStatus;
  location?: JobLocation;
  salary?: JobSalary;
  remoteType?: RemoteType;
  seniority?: Seniority;
  employmentType?: EmploymentType;
  departments?: string[];
  source?: JobSource;
  sourceJobId?: string;
  canonicalUrl?: string;
  originalUrl?: string;
}

async function resolveCompany(
  name?: string,
): Promise<Types.ObjectId | undefined> {
  if (!name) return undefined;
  const normalized = normalize(name);
  let company = await Company.findOne({ normalizedName: normalized }).exec();
  if (!company) {
    company = await Company.create({
      name: name.trim(),
      normalizedName: normalized,
      domains: [],
      atsIds: [],
    });
  }
  return company._id;
}

export async function addJob(
  ownerId: string,
  input: NewJobInput,
): Promise<JobDoc> {
  const companyId = await resolveCompany(input.company);
  const source: JobSource = input.source ?? 'manual';
  const now = new Date();
  const provenance: JobProvenance = {
    source,
    sourceJobId: input.sourceJobId,
    canonicalUrl: input.canonicalUrl,
    originalUrl: input.originalUrl,
    retrievedAt: now,
    retrievalMethod: 'manual',
  };

  const doc = await Job.create({
    ownerId: new Types.ObjectId(ownerId),
    companyId,
    title: input.title.trim(),
    normalizedTitle: normalize(input.title),
    description: input.description,
    descriptionStatus: input.descriptionStatus ?? 'missing',
    location: input.location ?? { remoteType: 'unspecified' },
    salary: input.salary,
    remoteType: input.remoteType ?? 'unspecified',
    seniority: input.seniority,
    employmentType: input.employmentType,
    departments: input.departments ?? [],
    sources: [],
    provenance,
    qualityStatus: 'good',
    isClosed: false,
    savedState: 'none',
  });
  return doc;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  total: number;
  errors: string[];
}

/** Import jobs from CSV text, JSON text, or a URL (returns JSON/CSV). */
export async function importJobs(
  ownerId: string,
  format: 'csv' | 'json' | 'url',
  data: string,
): Promise<ImportResult> {
  let rows: Record<string, unknown>[];

  if (format === 'url') {
    const fetched = await fetch(data);
    const text = await fetched.text();
    const contentType = fetched.headers.get('content-type') ?? '';
    if (contentType.includes('json') || data.endsWith('.json')) {
      rows = JSON.parse(text);
    } else {
      rows = parseCsv(text).map((r) => Object.fromEntries(Object.entries(r)));
    }
  } else if (format === 'json') {
    rows = JSON.parse(data);
  } else {
    rows = parseCsv(data).map((r) => Object.fromEntries(Object.entries(r)));
  }

  if (!Array.isArray(rows)) {
    throw new Error('Import data must be an array of job records');
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const title = String(row['title'] ?? row['Title'] ?? '').trim();
      if (!title) {
        skipped++;
        errors.push('Row without a title was skipped');
        continue;
      }

      const sourceJobId = String(
        row['sourceJobId'] ?? row['Source Job Id'] ?? row['id'] ?? '',
      ).trim() || undefined;
      const source: JobSource = (String(
        row['source'] ?? row['Source'] ?? 'manual',
      ).trim() as JobSource) || 'manual';
      const companyName = String(
        row['company'] ?? row['Company'] ?? '',
      ).trim() || undefined;

      // Dedup: same source + sourceJobId already exists -> skip.
      if (sourceJobId) {
        const exists = await Job.findOne({
          'provenance.source': source,
          'provenance.sourceJobId': sourceJobId,
        }).exec();
        if (exists) {
          skipped++;
          continue;
        }
      }

      const location: JobLocation = {
        city: String(row['city'] ?? row['City'] ?? '').trim() || undefined,
        region: String(row['region'] ?? row['Region'] ?? '').trim() || undefined,
        country: String(row['country'] ?? row['Country'] ?? '').trim() || undefined,
        remoteType: (String(
          row['remoteType'] ?? row['Remote Type'] ?? 'unspecified',
        ).trim() as RemoteType) || 'unspecified',
      };
      if (!location.city && !location.region && !location.country) {
        location.city = undefined;
        location.region = undefined;
        location.country = undefined;
      }

      const companyId = await resolveCompany(companyName);

      const doc = await Job.create({
        ownerId: new Types.ObjectId(ownerId),
        companyId,
        title,
        normalizedTitle: normalize(title),
        description: String(row['description'] ?? row['Description'] ?? '').trim() ||
          undefined,
        descriptionStatus: 'missing',
        location,
        salary: undefined,
        remoteType: location.remoteType,
        seniority: undefined,
        employmentType: undefined,
        departments: [],
        sources: [],
        provenance: {
          source,
          sourceJobId,
          canonicalUrl: undefined,
          originalUrl: undefined,
          retrievedAt: new Date(),
          retrievalMethod:
            format === 'url' ? 'url-fetch' : format === 'csv' ? 'csv' : 'json',
        },
        qualityStatus: 'limited',
        isClosed: false,
        savedState: 'none',
      });
      imported++;
    } catch (err) {
      skipped++;
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { imported, skipped, total: rows.length, errors };
}

export interface UserJobUpdate {
  savedState?: SavedState;
  notes?: string;
  stage?: ApplicationStage;
}

/** Upsert the user's saved-state/note/stage for a job. */
export async function setUserJob(
  ownerId: string,
  jobId: string,
  update: UserJobUpdate,
): Promise<UserJobDoc | null> {
  if (!Types.ObjectId.isValid(jobId)) return null;
  const jobExists = await Job.exists({
    _id: jobId,
    ownerId: new Types.ObjectId(ownerId),
  });
  if (!jobExists) return null;

  const setFields: UpdateQuery<UserJobDoc> = {};
  if (update.savedState !== undefined) setFields.savedState = update.savedState;
  if (update.notes !== undefined) setFields.notes = update.notes;
  if (update.stage !== undefined) setFields.stage = update.stage;

  const userJob = await UserJob.findOneAndUpdate(
    { ownerId: new Types.ObjectId(ownerId), jobId: new Types.ObjectId(jobId) },
    { $set: setFields },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).exec();

  // Keep Job.savedState in sync with the user's saved state so filtering by
  // savedState on the Job collection reflects the user's choice.
  if (update.savedState !== undefined) {
    await Job.updateOne(
      { _id: jobId, ownerId: new Types.ObjectId(ownerId) },
      { $set: { savedState: update.savedState } },
    ).exec();
  }

  return userJob;
}

export async function getUserJob(
  ownerId: string,
  jobId: string,
): Promise<UserJobDoc | null> {
  if (!Types.ObjectId.isValid(jobId)) return null;
  return UserJob.findOne({
    ownerId: new Types.ObjectId(ownerId),
    jobId: new Types.ObjectId(jobId),
  }).exec();
}

/** Delete a job (only if owned by the user). Also removes the UserJob link and related references. */
export async function deleteJob(
  ownerId: string,
  jobId: string,
): Promise<boolean> {
  if (!Types.ObjectId.isValid(jobId)) return false;
  const jobObjectId = new Types.ObjectId(jobId);
  const ownerObjectId = new Types.ObjectId(ownerId);

  const result = await Job.deleteOne({
    _id: jobObjectId,
    ownerId: ownerObjectId,
  }).exec();

  if (result.deletedCount > 0) {
    // Clean up related references
    await Promise.all([
      // Remove user's saved state/note/stage for this job
      UserJob.deleteOne({
        ownerId: ownerObjectId,
        jobId: jobObjectId,
      }).exec(),
      // Remove match reports for this job (owner-scoped)
      MatchReport.deleteMany({
        ownerId: ownerObjectId,
        jobId: jobObjectId,
      }).exec(),
      // Remove generated documents (tailored resumes/cover letters) for this job
      GeneratedDocument.deleteMany({
        ownerId: ownerObjectId,
        jobId: jobObjectId,
      }).exec(),
      // Unlink raw postings that pointed to this normalized job
      RawPosting.updateMany(
        { normalizedJobId: jobObjectId },
        { $unset: { normalizedJobId: 1 } },
      ).exec(),
    ]);
    return true;
  }
  return false;
}

/** Delete ALL jobs for a user. Returns count of deleted jobs. */
export async function deleteAllJobs(
  ownerId: string,
): Promise<number> {
  const ownerObjectId = new Types.ObjectId(ownerId);

  const jobIds = await Job.find({ ownerId: ownerObjectId })
    .select('_id')
    .lean()
    .exec();

  const ids = jobIds.map(j => j._id);

  if (ids.length === 0) return 0;

  const result = await Job.deleteMany({
    _id: { $in: ids },
    ownerId: ownerObjectId,
  }).exec();

  if (result.deletedCount > 0) {
    // Clean up all related references for all deleted jobs
    await Promise.all([
      // Remove all user's saved state/notes/stages for these jobs
      UserJob.deleteMany({
        ownerId: ownerObjectId,
        jobId: { $in: ids },
      }).exec(),
      // Remove all match reports for these jobs
      MatchReport.deleteMany({
        ownerId: ownerObjectId,
        jobId: { $in: ids },
      }).exec(),
      // Remove all generated documents for these jobs
      GeneratedDocument.deleteMany({
        ownerId: ownerObjectId,
        jobId: { $in: ids },
      }).exec(),
      // Unlink all raw postings that pointed to any of these normalized jobs
      RawPosting.updateMany(
        { normalizedJobId: { $in: ids } },
        { $unset: { normalizedJobId: 1 } },
      ).exec(),
    ]);
  }

  return result.deletedCount;
}
