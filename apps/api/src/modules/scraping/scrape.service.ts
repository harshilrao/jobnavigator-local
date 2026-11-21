import {
  Types,
  type FilterQuery,
} from 'mongoose';
import {
  Job,
  Company,
  type JobSource,
  type JobLocation,
  type JobProvenance,
} from '../jobs/job.model';
import {
  ScrapeSession,
  type ScrapeSessionDoc,
  type ScrapeSourceCount,
  ScrapeEvent,
  type ScrapeEventDoc,
  type ScrapeEventType,
} from './scrape.model';
import {
  createAdapter,
  isSourceSupported,
  listAdapters,
  type ScrapeSource,
  type ScrapeSourceDescriptor,
} from './adapters';
import { type JobFilter } from '@jobnavigator/shared';

/**
 * Maximum jobs to save per source per session. Prevents runaway imports.
 */
const MAX_JOBS_PER_SOURCE = 50;

/** Resolve company name to Company document (create if needed). */
async function resolveCompany(
  name?: string,
): Promise<Types.ObjectId | undefined> {
  if (!name) return undefined;
  const normalized = name.trim().toLowerCase();
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

/**
 * Convert a raw job from an adapter into a Job document, applying dedup
 * against existing provenance.source + provenance.sourceJobId.
 */
async function upsertJobFromRawImpl(
  ownerId: string,
  raw: {
    sourceJobId?: string;
    title?: string;
    description?: string;
    descriptionStatus?: string;
    location?: JobLocation;
    salary?: { min?: number; max?: number; currency?: string; period?: string };
    url?: string;
    company?: string;
    postedAt?: Date;
  },
  source: JobSource,
  _sessionId: string,
): Promise<{ saved: boolean; jobId?: string; skippedReason?: string }> {
  if (!raw.title) {
    return { saved: false, skippedReason: 'no title' };
  }

  // Dedup: same source + sourceJobId already exists for this owner.
  if (raw.sourceJobId) {
    const existing = await Job.findOne({
      'provenance.source': source,
      'provenance.sourceJobId': raw.sourceJobId,
      ownerId: new Types.ObjectId(ownerId),
    }).exec();
    if (existing) {
      return { saved: false, skippedReason: 'duplicate' };
    }
  }

  const now = new Date();
  const provenance: JobProvenance = {
    source,
    sourceJobId: raw.sourceJobId,
    canonicalUrl: raw.url,
    originalUrl: raw.url,
    retrievedAt: now,
    retrievalMethod: 'scrape',
  };

  // Resolve company (create if needed)
  const companyId = await resolveCompany(raw.company);

  try {
    const doc = await Job.create({
      ownerId: new Types.ObjectId(ownerId),
      companyId,
      title: raw.title.trim(),
      normalizedTitle: (raw.title ?? '').trim().toLowerCase(),
      description: raw.description,
      descriptionStatus: (raw.descriptionStatus ?? 'missing') as
        | 'complete'
        | 'partial'
        | 'missing'
        | 'blocked'
        | 'closed',
      location: raw.location ?? { remoteType: 'unspecified' },
      salary: raw.salary,
      remoteType: raw.location?.remoteType ?? 'unspecified',
      departments: [],
      sources: raw.url
        ? [
            {
              source,
              url: raw.url,
              sourceJobId: raw.sourceJobId,
              retrievedAt: now,
            },
          ]
        : [],
      provenance,
      qualityStatus: 'limited',
      isClosed: false,
      savedState: 'none',
    });

    return { saved: true, jobId: doc.id };
  } catch (err) {
    // MongoDB duplicate key (code 11000) on the provenance source+sourceJobId
    // index means another owner already saved this job — treat as duplicate.
    if (err instanceof Error && (err as { code?: number }).code === 11000) {
      return { saved: false, skippedReason: 'duplicate' };
    }
    throw err;
  }
}

/**
 * Emit a scrape event and persist it to MongoDB. Also broadcast to SSE
 * subscribers via the session's event channel.
 */
async function emitEvent(
  sessionId: string,
  ownerId: string,
  type: ScrapeEventType,
  opts: {
    source?: JobSource;
    message?: string;
    jobId?: string;
    jobTitle?: string;
    counts?: ScrapeSourceCount[];
    progress?: number;
  } = {},
): Promise<ScrapeEventDoc | null> {
  try {
    const event = await ScrapeEvent.create({
      sessionId: new Types.ObjectId(sessionId),
      ownerId: new Types.ObjectId(ownerId),
      type,
      source: opts.source,
      message: opts.message,
      jobId: opts.jobId ? new Types.ObjectId(opts.jobId) : undefined,
      jobTitle: opts.jobTitle,
      counts: opts.counts,
      progress: opts.progress,
      timestamp: new Date(),
    });

    // Broadcast to SSE subscribers.
    const callbacks = eventChannels.get(sessionId);
    if (callbacks) {
      const payload: Record<string, unknown> = {
        type,
        timestamp: event.timestamp,
      };
      if (opts.source) payload.source = opts.source;
      if (opts.message) payload.message = opts.message;
      if (opts.jobId) payload.jobId = opts.jobId;
      if (opts.jobTitle) payload.jobTitle = opts.jobTitle;
      if (opts.counts) payload.counts = opts.counts;
      if (opts.progress !== undefined) payload.progress = opts.progress;
      for (const cb of callbacks) {
        try { cb(payload); } catch { /* ignore subscriber errors */ }
      }
    }

    return event;
  } catch {
    return null;
  }
}

/**
 * In-memory SSE channels keyed by sessionId. Each channel is an array of
 * push callbacks. Clients reconnect by fetching persisted events from MongoDB.
 */
const eventChannels = new Map<string, Array<(data: unknown) => void>>();

function subscribeToSession(sessionId: string, callback: (data: unknown) => void): () => void {
  let callbacks = eventChannels.get(sessionId);
  if (!callbacks) {
    callbacks = [];
    eventChannels.set(sessionId, callbacks);
  }
  callbacks.push(callback);
  return () => {
    const cbs = eventChannels.get(sessionId);
    if (cbs) {
      const idx = cbs.indexOf(callback);
      if (idx >= 0) cbs.splice(idx, 1);
    }
  };
}

/**
 * Initialize per-source count entries.
 */
function initSourceCounts(sources: JobSource[]): ScrapeSourceCount[] {
  return sources.map((s) => ({
    source: s,
    fetched: 0,
    valid: 0,
    matchedFilters: 0,
    duplicates: 0,
    saved: 0,
    skipped: 0,
    failed: 0,
    missingDescriptions: 0,
  }));
}

function findSourceCount(
  counts: ScrapeSourceCount[],
  source: JobSource,
): ScrapeSourceCount | undefined {
  return counts.find((c) => c.source === source);
}

/**
 * Re-check cancellation from the database. The in-memory session object goes
 * stale as soon as another request cancels the session, so we must re-read
 * cancelRequested on every loop iteration.
 */
async function isCancelled(sessionId: string, ownerId: string): Promise<boolean> {
  const s = await ScrapeSession.findOne({ _id: sessionId, ownerId })
    .select('cancelRequested')
    .exec();
  return s?.cancelRequested ?? false;
}

/**
 * Create a scrape session from a validated filter snapshot. The filter is
 * immutable once the session starts — changes to the user's filter do not
 * affect an in-progress session.
 */
export async function createScrapeSession(
  ownerId: string,
  filter: JobFilter,
  sources: JobSource[],
  locations: string[],
): Promise<ScrapeSessionDoc> {
  const validSources = sources.filter((s) => isSourceSupported(s));
  if (validSources.length === 0) {
    throw new Error('No supported sources selected');
  }

  // Use filter.limit as batch size (default 10), capped at 50 per source
  const batchLimit = Math.min(filter.limit ?? 10, 50);

  const session = await ScrapeSession.create({
    ownerId: new Types.ObjectId(ownerId),
    filterSnapshot: { ...filter },
    sources: validSources,
    locations,
    status: 'queued',
    counts: initSourceCounts(validSources),
    totalFetched: 0,
    totalSaved: 0,
    totalSkipped: 0,
    totalFailed: 0,
    // Pagination: start at offset 0, fetch batchLimit per resume
    nextOffset: 0,
    batchLimit,
    startedAt: new Date(),
    cancelRequested: false,
  });

  await emitEvent(session.id, ownerId, 'started', {
    message: `Scrape session created with ${validSources.length} source(s)`,
    progress: 0,
  });

  return session;
}

/**
 * Get a scrape session by ID (owner-scoped).
 */
export async function getScrapeSession(
  ownerId: string,
  sessionId: string,
): Promise<ScrapeSessionDoc | null> {
  if (!Types.ObjectId.isValid(sessionId)) return null;
  return ScrapeSession.findOne({
    _id: sessionId,
    ownerId: new Types.ObjectId(ownerId),
  }).exec();
}

/**
 * Cancel a running scrape session. Sets cancelRequested so the service loop
 * stops on the next check.
 */
export async function cancelScrapeSession(
  ownerId: string,
  sessionId: string,
): Promise<ScrapeSessionDoc | null> {
  const session = await getScrapeSession(ownerId, sessionId);
  if (!session) return null;
  if (session.status === 'completed' || session.status === 'failed' || session.status === 'cancelled') {
    return session;
  }
  session.cancelRequested = true;
  if (session.status === 'running') {
    session.status = 'cancelled';
    session.completedAt = new Date();
  } else if (session.status === 'queued') {
    session.status = 'cancelled';
    session.completedAt = new Date();
  }
  await session.save();

  await emitEvent(session.id, ownerId, 'cancelled', {
    message: 'Scrape session cancelled',
    progress: 100,
  });

  return session;
}

/**
 * List scrape sessions for an owner, newest first.
 */
export async function listScrapeSessions(
  ownerId: string,
  limit = 20,
): Promise<ScrapeSessionDoc[]> {
  return ScrapeSession.find({
    ownerId: new Types.ObjectId(ownerId),
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .exec();
}

/**
 * Get persisted events for a session (for SSE reconnect).
 */
export async function getScrapeEvents(
  sessionId: string,
  ownerId: string,
  after?: Date,
): Promise<ScrapeEventDoc[]> {
  const query: FilterQuery<ScrapeEventDoc> = {
    sessionId: new Types.ObjectId(sessionId),
    ownerId: new Types.ObjectId(ownerId),
  };
  if (after) {
    query.timestamp = { $gt: after };
  }
  return ScrapeEvent.find(query).sort({ timestamp: 1 }).exec();
}

/**
 * Run a scrape session for ONE BATCH (incremental pagination).
 *
 * For each source:
 *   1. Mark source_started
 *   2. Create adapter instance
 *   3. fetchJobs with session.nextOffset and session.batchLimit
 *   4. Process jobs, apply filter, dedup, save
 *   5. Track if any source hasMore
 *
 * After all sources:
 *   - If any source hasMore: update nextOffset += batchLimit, status = 'paused'
 *   - If no source hasMore: status = 'completed'
 *   - If cancelled: status = 'cancelled'
 *
 * Cooperative cancellation: checks session.cancelRequested between jobs and sources.
 */
export async function runScrapeSession(
  sessionId: string,
  ownerId: string,
  userConfiguredSources: Record<JobSource, { identifier: string; baseUrl?: string }>,
): Promise<void> {
  console.log('[Scrape Service] runScrapeSession started:', { sessionId, ownerId, userConfiguredSources });

  // Atomically transition status from 'queued' OR 'paused' to 'running'.
  // This allows resuming a paused session.
  // First check if startedAt needs to be set (only on first run from 'queued')
  const existingDoc = await ScrapeSession.findOne({ _id: sessionId, ownerId }).select('startedAt').exec();
  const needsStartedAt = existingDoc && !existingDoc.startedAt;

  const session = await ScrapeSession.findOneAndUpdate(
    {
      _id: sessionId,
      ownerId: new Types.ObjectId(ownerId),
      status: { $in: ['queued', 'paused'] },
    },
    {
      status: 'running',
      // startedAt only set on first run (queued -> running)
      ...(needsStartedAt ? { startedAt: new Date() } : {}),
    },
    { new: true },
  ).exec();

  if (!session) {
    const existing = await ScrapeSession.findOne({
      _id: sessionId,
      ownerId: new Types.ObjectId(ownerId),
    }).exec();
    if (!existing) {
      throw new Error('Session not found');
    }
    throw new Error(`Session is ${existing.status}, cannot run`);
  }

  const currentOffset = session.nextOffset ?? 0;
  const batchLimit = session.batchLimit ?? 10;

  console.log('[Scrape Service] Resuming session at offset:', { currentOffset, batchLimit });

  let totalFetched = 0;
  let totalSaved = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let anySourceHasMore = false;

  try {
    for (const source of session.sources) {
      if (await isCancelled(session.id, ownerId)) break;

      console.log('[Scrape Service] Processing source:', { source, sessionId: session.id, offset: currentOffset, limit: batchLimit });

      const sourceCount = findSourceCount(session.counts, source)!;

      await emitEvent(session.id, ownerId, 'source_started', {
        source,
        message: `Starting ${source} (offset ${currentOffset})`,
        progress: 0,
      });

      const cfg = userConfiguredSources[source];
      const adapter = createAdapter(source as ScrapeSource, cfg?.identifier ?? 'configure-in-settings', cfg?.baseUrl);
      if (!adapter) {
        await emitEvent(session.id, ownerId, 'error', {
          source,
          message: `No adapter available for ${source}`,
        });
        continue;
      }

      console.log('[Scrape Service] Adapter created for source:', { source, adapterSourceId: adapter.sourceId, configured: adapter.configured });

      const filter = session.filterSnapshot as JobFilter;
      const signal = new AbortController().signal;

      // Check cancellation before each source
      if (await isCancelled(session.id, ownerId)) break;

      try {
        console.log('[Scrape Service] Calling adapter.fetchJobs...', { offset: currentOffset, limit: batchLimit });
        const result = await adapter.fetchJobs({
          query: filter.q,
          company: undefined,
          location: filter.locations?.[0],
          limit: batchLimit,
          offset: currentOffset,
          signal,
          filter: filter as unknown as Record<string, unknown>,
        });
        console.log('[Scrape Service] adapter.fetchJobs returned:', {
          source,
          jobCount: result.jobs.length,
          hasMore: result.hasMore,
        });

        if (result.hasMore) {
          anySourceHasMore = true;
        }

        if (await isCancelled(session.id, ownerId)) break;

        sourceCount.fetched += result.jobs.length;
        totalFetched += result.jobs.length;

        for (const rawJob of result.jobs) {
          if (await isCancelled(session.id, ownerId)) break;

          // Apply shared filter client-side (title/company/location matching).
          if (filter.q) {
            const q = filter.q.toLowerCase();
            if (
              !rawJob.title.toLowerCase().includes(q) &&
              !(rawJob.company ?? '').toLowerCase().includes(q) &&
              !(rawJob.location ?? '').toLowerCase().includes(q)
            ) {
              continue;
            }
          }

          sourceCount.valid += 1;
          sourceCount.matchedFilters += 1;

          // Check description status.
          if (
            rawJob.descriptionStatus === 'missing' ||
            rawJob.descriptionStatus === 'blocked'
          ) {
            sourceCount.missingDescriptions += 1;
          }

          const saved = await upsertJobFromRawImpl(ownerId, {
            ...rawJob,
            location: rawJob.location
              ? { city: rawJob.location, remoteType: 'unspecified' }
              : undefined,
          }, source, session.id);

          if (saved.saved) {
            sourceCount.saved += 1;
            totalSaved += 1;
            await emitEvent(session.id, ownerId, 'job_saved', {
              source,
              jobId: saved.jobId,
              jobTitle: rawJob.title,
              message: `Saved: ${rawJob.title}`,
              progress: Math.round((totalSaved / batchLimit) * 100),
            });
          } else if (saved.skippedReason === 'duplicate') {
            sourceCount.duplicates += 1;
            totalSkipped += 1;
            await emitEvent(session.id, ownerId, 'job_skipped', {
              source,
              jobTitle: rawJob.title,
              message: `Skipped (duplicate): ${rawJob.title}`,
            });
          } else {
            sourceCount.skipped += 1;
            totalSkipped += 1;
          }
        }
      } catch (err) {
        sourceCount.failed += 1;
        totalFailed += 1;
        await emitEvent(session.id, ownerId, 'error', {
          source,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Update session with new totals and pagination state
    session.totalFetched += totalFetched;
    session.totalSaved += totalSaved;
    session.totalSkipped += totalSkipped;
    session.totalFailed += totalFailed;

    if (session.cancelRequested) {
      session.status = 'cancelled';
      session.completedAt = new Date();
    } else if (anySourceHasMore) {
      // More jobs available - pause and advance offset for next batch
      session.status = 'paused';
      session.nextOffset = currentOffset + batchLimit;
    } else {
      // No more jobs from any source - complete the session
      session.status = 'completed';
      session.completedAt = new Date();
    }
    await session.save();

    const finalStatus = session.status === 'cancelled' ? 'cancelled' : (session.status === 'paused' ? 'progress' : 'complete');
    await emitEvent(session.id, ownerId, finalStatus, {
      message: `Batch ${session.status}: ${totalSaved} saved, ${totalFailed} failed${session.status === 'paused' ? `, next offset: ${session.nextOffset}` : ''}`,
      progress: session.status === 'paused' ? 50 : 100,
      counts: session.counts,
    });
  } catch (err) {
    session.status = 'failed';
    session.errorMessage = err instanceof Error ? err.message : String(err);
    session.completedAt = new Date();
    await session.save();

    await emitEvent(session.id, ownerId, 'error', {
      message: err instanceof Error ? err.message : String(err),
    });

    throw err;
  }
}

/**
 * Subscribe to SSE events for a session. Returns an unsubscribe function.
 * On subscribe, sends any persisted events since `after` (for reconnect).
 */
export function subscribeToScrapeSession(
  sessionId: string,
  ownerId: string,
  callback: (data: unknown) => void,
  after?: Date,
): (() => void) | null {
  // Send persisted events first (for reconnect support).
  void getScrapeEvents(sessionId, ownerId, after).then((events) => {
    for (const ev of events) {
      callback({
        type: ev.type,
        source: ev.source,
        message: ev.message,
        jobId: ev.jobId,
        jobTitle: ev.jobTitle,
        counts: ev.counts,
        progress: ev.progress,
        timestamp: ev.timestamp,
      });
    }
  });

  return subscribeToSession(sessionId, callback);
}

/**
 * List available adapter descriptors for the UI.
 */
export function getAvailableAdapters(): ScrapeSourceDescriptor[] {
  return listAdapters();
}
