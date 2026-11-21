# JobNavigator Local — Phase 6A, divided into controlled subphases

**For:** `fcc-claude` (primary developer); optionally `fcc-codex` for independent review after a phase passes.

**Project:** The **existing** `jobnavigator-local` React + Vite + TypeScript, Express + TypeScript, MongoDB/Mongoose application, with Ollama `qwen2.5:3b` already integrated for match reports.

**Read first in the repository:** `CLAUDE.md`, `docs/BUILD_PLAN.md`, `docs/PHASE_STATUS.md`, `docs/DECISIONS.md` (if present), and this file. The source design is `docs/PHASE_6A_JOBSPY_CLAUDE_INSTRUCTIONS.md`. If the original Phase 6A file is also present, treat this phased document as the execution schedule and the original as the detailed feature requirements. Resolve contradictions conservatively and report them before changing behavior.

**Status warning:** The supplied `PHASE_STATUS.md` lists **Phase 6 as IN PROGRESS**. Inspect the actual repository; do not assume Phase 6 is done. This work is a bounded **6A extension**, not Phase 7. Do not overwrite unfinished resume work.

## Master operating rules — apply to ALL subphases

1. **Execute just ONE approved subphase at a time.** Start with `APPROVE PHASE 6A.0`. Do not implement the next phase until I send exactly `APPROVE PHASE 6A.N`. If a test fails, stay in the current subphase and fix it first. Never automatically continue.
2. **Preserve the application.** No new app, rewrite, framework swap, database reset, collection wipe, or changes to my older `job-automation` repository. Do not break existing ATS adapters, authentication, SSE, saved jobs, original resumes, Ollama scoring, or resume tailoring.
3. **All advanced scraping filters belong only on the existing Scrape page** (`apps/web/src/pages/Scrape.tsx`). The existing Jobs page (`apps/web/src/pages/Jobs.tsx`) remains the searchable stored-job inventory and detail/AI viewer. Keep the existing lightweight Jobs search and sort, but do **not** add a second full scrape-filter panel there. Share filter types and validated filter snapshots across layers.
4. **Strict user-driven batches:** one Start Scrape or Load 10 More action authorizes at most **10 candidate results across ALL selected sources combined**. No automatic next batch, no queued next-page request, no prefetch buffer, no background top-up to 10 saved jobs, and no auto-resume triggered by reconnect. There may be fewer than 10 saved jobs because of duplicates, missing results, filters, or errors.
5. **Truthful JobSpy limitations:** `results_wanted` can be per-provider and the library may fetch more internally than the exposed result count. Inspect the pinned JobSpy implementation; do not promise zero network overfetch if it cannot be achieved. Clearly document provider-level network behavior, and disable/mark limited any provider for which a firm bound is required but unachievable. No evasive scraping, CAPTCHA bypass, login workarounds, paywall circumvention, or forbidden site access.
6. **Real data only:** Never substitute dummy job descriptions/company/skills for live jobs. Preserve the actual source fields, provenance and missing/partial/blocked statuses. Scraped text is untrusted; validate/sanitize it and never treat it as application instructions. If a full JD cannot be accessed lawfully, explain and offer **Open Original** or manual import.
7. **Cross-page live results:** Once a job is genuinely persisted, surface it on the Scrape page's **Live Job Postings** panel and on the Jobs inventory without a manual refresh. The scrape worker/server session must continue if I switch pages. Do not fabricate events while a blocking JobSpy call is still running.
8. **Windows 11 + PowerShell** is the target. Use a small Python 3.10+ virtual environment for the isolated JobSpy worker only. Node's backend remains Node/TypeScript. No Docker, WSL, Redis, or paid APIs are needed. Document the exception to the original no-Python plan in `docs/DECISIONS.md`.
9. **Security:** Authenticate session, job and deletion routes; enforce owner isolation. Use `child_process.spawn` without shell interpolation, validate JSON with Zod, bound runtime/output, stop subprocesses reliably, and keep secrets and resume PII out of logs.
10. **For every phase, run the applicable commands (not just claim they pass):** `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, `npm run smoke`; plus Python tests once the worker exists. If a gate cannot run, explain why and mark **NOT VERIFIED**—never quietly skip it. Add targeted regression coverage.
11. **At every STOP:** update `docs/PHASE_STATUS.md` with the subphase and real evidence; provide files changed, PowerShell commands, actual test outcomes, URLs, manual clicks to verify, limitations, next-phase dependencies, and the exact `STOP — awaiting APPROVE PHASE 6A.N` message. No git push, production deployment, auto-application, deletion, or destructive migrations without separate approval.
12. **Provider selection is absolute:** Only selected, currently supported sources are allowed to run. Never silently fall back to a different board, expand cities, change country, or generate missing data. Clearly mark supported, limited, unavailable, and manual-only sources.

---

## PHASE 6A.0 — Repository audit, safe design and baselines

**Goal:** Understand existing Phase 4–6 capabilities before editing, and make a safe implementation plan.

**Tasks**

- Confirm working directory, `git status`, dependencies, `.env.example` (do not print actual secrets), Node/Python availability, service health, and existing data separation (`jobnavigator_local`, not the old database).
- Inspect `apps/web/src/pages/Scrape.tsx`, `Jobs.tsx`, scrape routes/services/models, SSE handling, shared filter Zod schemas, jobs dedup/storage, Ollama score actions and Phase 6 resume modules.
- Check which parts are implemented versus only listed in `PHASE_STATUS.md`; identify missing/overlapping features and risks.
- Draw the end-to-end design: Scrape filters -> validated immutable session snapshot -> deterministic provider quotas -> Python worker -> Zod validation -> cautious dedup -> MongoDB -> authenticated session SSE -> Scrape + Jobs -> current Ollama flow.
- Choose exact file locations, worker protocol, API adjustments, update strategy, cancellation model and per-source cursor strategy. Preserve existing ATS adapter behavior.
- Record decisions and caveat about internal JobSpy overfetch in `docs/DECISIONS.md`. No speculative coding or dependencies yet.

**Pass gate:** A repository-specific implementation plan, file list, known conflicts, baseline typecheck/lint/test/build/smoke evidence, and a manual verification checklist. Do not call incomplete Phase 6 “finished.”

**Prompt to paste into Claude**

```text
APPROVE PHASE 6A.0. Read CLAUDE.md, docs/BUILD_PLAN.md, docs/PHASE_STATUS.md, docs/PHASE_6A_JOBSPY_STEP_BY_STEP.md and the original Phase 6A specification if present. Audit the actual repository and run existing quality gates. Produce a concrete, safe implementation design without adding scraping features yet. Update phase notes and STOP — awaiting APPROVE PHASE 6A.1.
```

---

## PHASE 6A.1 — Isolated Python JobSpy worker and Node bridge

**Goal:** Fetch validated JobSpy results through a small supervised worker without modifying the React UX yet.

**Tasks**

- Verify the current/pinned `python-jobspy` API and platform support. Pin an actually installed/tested version in e.g. `workers/jobspy/requirements.txt`; use `.venv` ignored by git and PowerShell-friendly install/run scripts.
- Implement a narrow Python worker accepting versioned JSON input and producing versioned JSON or JSONL output. Map source IDs exactly: `linkedin`, `indeed`, `glassdoor`, `zip_recruiter`. Validate role, location, `country_indeed`, `results_wanted`, `offset`, `fetch_description`, and supported flags rather than guessing parameter names.
- Implement a Node/TypeScript bridge that launches the owned Python process via `spawn` (no shell string), validates output with Zod, caps stdout/stderr, observes abort/timeouts, and maps errors into existing API error shapes. Do not expose an unprotected worker endpoint.
- Test fake worker output, invalid JSON, worker failure, timeout, cancellation/child exit, platform mappings and a permitted real provider smoke *if feasible*. Clearly label fixtures vs live results. Do not rely on live sites for deterministic tests.
- Inspect/record actual provider overfetch, blocking DataFrame behavior, and any inability to guarantee zero extra network requests.

**Pass gate:** Worker and Node bridge tests pass; errors are honest; no change to scraping filters, user batch engine or jobs UI yet; existing ATS and Ollama functionality still builds.

**Prompt**

```text
APPROVE PHASE 6A.1. Implement only the isolated JobSpy Python worker and a validated, cancellable Node.js bridge as specified in the phased plan. Pin and verify dependencies, run Python + npm gates, document JobSpy internal network limitations, preserve the existing API/UI, then STOP — awaiting APPROVE PHASE 6A.2.
```

---

## PHASE 6A.2 — One unified filter panel in the EXISTING Scrape page

**Goal:** Let me select the platforms and all job criteria before a new scrape; do not build pagination yet.

**Tasks**

- Extend the *existing* `Scrape.tsx` filter panel, not Jobs, with multi-select LinkedIn/Indeed/Glassdoor/ZipRecruiter plus existing permitted ATS adapters; show per-source supported/limited/unavailable state.
- Add position/title, keywords and exclusion terms, company where supported; city, province/state, country (Canada/USA); years bands (`0–1`, `1–2`, `2–3`, `3–5`, `5+`); seniority, onsite/hybrid/remote, employment type and posting age/date range. Offer radius only if reliable and supported.
- Extend/reuse `packages/shared/src/filter.ts` and Zod validation; map country and native source filters accurately; mark unsupported criteria as **local post-filters** and inferred experience as inferred, not employer-verified.
- Share one immutable filter snapshot between UI and session API, consistent with existing stored-job query behavior; never silently add sources, roles, cities, or countries.
- Keep existing stored-job search/sort/pagination in Jobs, but do not duplicate the Scrape filter panel there.
- Add UI tests for filter visibility/selection, source IDs, Canada/US mappings, invalid input and unchanged provider selection. Controls not implemented until later subphases must be visibly disabled or labelled, not falsely functional.

**Pass gate:** All full filters appear **in Scrape only** and produce a validated snapshot; Jobs retains only its existing lightweight inventory search; tests pass. No new batch requests yet.

**Prompt**

```text
APPROVE PHASE 6A.2. Implement only the shared validated scrape filters in the EXISTING apps/web/src/pages/Scrape.tsx. Include all four boards, role, location, experience, work arrangement and date filters, preserve ATS adapters, and do not duplicate full filters in Jobs. Do not start pagination or live tables yet. Run gates and STOP — awaiting APPROVE PHASE 6A.3.
```

---

## PHASE 6A.3 — Strict click-to-fetch batches, per-source cursors and persistence

**Goal:** One explicit click fetches at most 10 **candidate** jobs in aggregate; Load 10 More is the only way to authorize another batch.

**Tasks**

- Extend authenticated scrape-session APIs, models and runner rather than building a disconnected JobSpy system. Persist immutable filters, selected source list, source quotas, cursors/offsets, batch number, request id, status, errors and counts.
- Implement **Start Scrape (10)** and **Load 10 More** actions in Scrape. One action allocates up to 10 candidates across ALL selected providers, not 10 per provider. Choose/document fair deterministic allocation. Persist per-source offsets by consumed candidate results, including candidates filtered or deduplicated. Do not automatically top up to 10 unique saved records.
- Make batch requests idempotent with request IDs, server-side in-flight locking, and disabled buttons. Double-clicks, refreshed pages, SSE reconnects and retries must never launch another batch without a new explicit user action.
- Never schedule/queue/cache/prefetch a following batch. No use of next-page effects. Keep earlier saved job records in MongoDB. If the source returns fewer jobs or a site is unavailable, show the truth and stop the batch.
- Integrate worker results through original job normalization/dedup and persistence; never make `description` mandatory. Enforce permission and owner isolation.
- Test 10 max candidate results *across all sources*, source allocations, source-only selection, missing JD, duplicates, second batch cursor progression, restart/reconnect, and lack of network activity between batch clicks. Network overfetch *inside JobSpy itself* must be documented explicitly, not falsely asserted impossible.

**Pass gate:** Start one batch -> at most 10 candidates processed -> batch ends and **no further application-initiated source fetching** -> next batch only after Load 10 More. Saved results survive restart. Existing source adapters remain unaffected.

**Prompt**

```text
APPROVE PHASE 6A.3. Integrate JobSpy into existing authenticated scrape sessions. Implement Start Scrape (10), Load 10 More, aggregate 10-candidate max, per-source offsets, persisted batch state, double-click idempotency and absolutely no automatic next batch or top-up. Test with deterministic fixtures and clearly disclose any underlying JobSpy network overfetch. Run gates and STOP — awaiting APPROVE PHASE 6A.4.
```

---

## PHASE 6A.4 — Real cancellation, truthful progress and batch ETA

**Goal:** Cancel the active work correctly and show accurate activity/progress.

**Tasks**

- Wire **Cancel Scrape**, **Refresh Status**, in-flight state and coherent status messages in the existing Scrape page. Build on existing authenticated `POST /api/scrape/sessions/:id/cancel` and event stream.
- Use durable cancellation flag + Node AbortController; terminate owned Python worker/process tree on Windows; stop remaining selected providers; prevent late database writes. Handle race conditions around cancellation acknowledgement and stale sessions after app restart.
- Emit source/activity events from truthfully observed work (`started`, `source_started`, `job_discovered` when returned, `job_saved`, `job_skipped`, `progress`, `error`, `cancelled`, `complete`); don't invent per-job results while JobSpy's blocking call is running.
- Show selected platform, job/location, elapsed time, `X/10` processed, saved, skipped, duplicate, missing-description and failed counts. Estimate **remaining time for current batch only** from observed timings; otherwise display **Calculating…** or **ETA unavailable**.
- Add fixture-backed tests for cancel during blocked worker, process termination, no late writes, timeout, partial failure, accurate status and ETA unknown state.

**Pass gate:** Cancel stops the session and owned worker, no more jobs are committed after cancellation acknowledgement, no next batch starts, progress counts are consistent, ETA is never fabricated.

**Prompt**

```text
APPROVE PHASE 6A.4. Implement and test cooperative cancellation, Windows Python child termination, durable session state, truthful SSE events, progress/elapsed time and evidence-based ETA for the CURRENT 10-job batch. No late database writes after acknowledged cancel and no automatic retries or next batch. Run gates and STOP — awaiting APPROVE PHASE 6A.5.
```

---

## PHASE 6A.5 — Live Job Postings in Scrape AND Jobs, synchronized across navigation

**Goal:** Every newly persisted posting appears automatically in both existing pages, without a manual page refresh or duplicate session.

**Tasks**

- Add **Live Job Postings** below filters on `Scrape.tsx`: title, employer, location, source, posted date, description status, and observed status (saving/saved/skipped/failed as available), plus **View Full Details** and **Open Original**.
- Wire existing authenticated SSE/session events to update rows as they become genuinely available and persist to MongoDB; reconcile against session history on reconnect and avoid duplicate rows.
- In `Jobs.tsx`, subscribe via shared app-level session/store or global event bridge; invalidate/refetch existing Jobs query and show newly saved jobs **during** an active session, even after navigating away from Scrape. Preserve sort/page/filter semantics. If a filter hides a new job, explain why and provide **Show newly scraped jobs**.
- Keep scraping process lifecycle on the backend, never inside a page component. Navigation/unmount must not cancel/restart a session or launch another batch. Keep all detailed scrape filters in Scrape only.
- Test the user journey: start in Scrape -> observe persisted postings -> open Jobs while processing -> see new rows without reload -> view a job -> return to Scrape -> same active session/status -> SSE reconnect without gaps or duplicates.

**Pass gate:** Cross-page real-time synchronization and navigation tests pass. Every displayed live posting is a real stored job; no invented preview row or fake “stream” when the library hasn't returned records yet.

**Prompt**

```text
APPROVE PHASE 6A.5. Keep all filters in Scrape. Add its Live Job Postings table and make persisted scraped jobs immediately appear in BOTH Scrape and Jobs via existing SSE/session state, including when I switch pages mid-scrape. Reconcile after reconnect; do not start another fetch on navigation or component mount. Run regression tests and STOP — awaiting APPROVE PHASE 6A.6.
```

---

## PHASE 6A.6 — Full genuine job details, provenance and data-quality handling

**Goal:** Replace the dummy-data feel with complete sections populated exclusively by fields that were actually obtained.

**Tasks**

- Preserve raw/source snapshot and normalize actual JobSpy fields when present: source job ID, listing + employer links, company name/URL/logo/industry/size, title, city/province/country, onsite/hybrid/remote, work type, posting date, salary/currency/interval, description, responsibilities, qualifications, skills, years/experience, education, benefits and provenance.
- Run permitted description-fetch paths **within** the user-authorized batch only; no separate hidden fetch to fill in missing JD later. If unavailable, persist `descriptionStatus=complete|partial|missing|blocked` where supported, and display `Not provided by source` for absent fields.
- Extract requirements from real description text with clearly labelled **derived** provenance and supporting excerpts. Never claim derived qualifications are employer verified; never hallucinate fields. Preserve cautious source-ID/URL dedup, and don't merge different same-title/same-employer jobs without strong IDs.
- Update existing in-app job modal/detail to show the full cached genuine data, safe rendering, data-quality status and Open Original fallback. Reuse the view from Scrape's Live table and Jobs table.
- Verify all fields with fixtures including: detailed posting, minimal posting, blocked/missing description, salary absent, duplicate and genuinely distinct same-title roles. Clearly document source-specific coverage; provider data may differ.

**Pass gate:** Clicking any saved job exposes all available real fields and honest blanks; no required-description validation crash; cached data survives restart; Open Original is available where appropriate.

**Prompt**

```text
APPROVE PHASE 6A.6. Complete the normalized real job fields and reusable View Full Details UI for Jobs and Scrape. Preserve raw provenance; use only observed JobSpy/source data; clearly label JD-derived skills/requirements and show Not provided by source for unavailable values. Do not invent dummy fields or add hidden detail scraping. Run gates and STOP — awaiting APPROVE PHASE 6A.7.
```

---

## PHASE 6A.7 — Delete a job safely from the Jobs page and MongoDB

**Goal:** I can permanently remove a job record that I own from the applicable inventory, with transparent impact on related records.

**Tasks**

- Add **Delete** action on Jobs table row and job detail. Ask for confirmation naming title/company and showing consequences for UserJob status, match reports, generated documents, and application links. Allow cancel with no mutation.
- Add authenticated DELETE route / service (choose location consistent with existing `/api/jobs/:id`); enforce user ownership. For shared global `Job`, if another owner has a reference, remove only this user's association and clearly say the global job is retained—**do not delete other users' data**. For an unshared deletable record, remove the correct MongoDB inventory record and related references safely.
- Preserve original uploaded resumes and other users' content; preserve or safely handle dependent application/audit data rather than orphaning it. Use MongoDB transaction when supported; document/test fallback otherwise.
- Immediately remove the affected user-visible row from Scrape and Jobs via invalidation/event update, and verify database state after a reload and app restart.
- Add auth, non-owner, shared reference, duplicate delete, relational-integrity, and cancel-confirmation tests. Optional bulk delete is *out of scope* until individually approved.

**Pass gate:** A confirmed authorized delete changes the database as explained; canceled deletion changes nothing; no unrelated data is removed.

**Prompt**

```text
APPROVE PHASE 6A.7. Implement per-job Delete on the existing Jobs page with explicit confirmation, owner authorization, real MongoDB deletion when safe, reference-aware cleanup, and immediate sync to Scrape and Jobs. Never delete another user's records or original resumes. Test reload/restart and all failure paths, run gates and STOP — awaiting APPROVE PHASE 6A.8.
```

---

## PHASE 6A.8 — Reuse Ollama reports and end-to-end regression acceptance

**Goal:** Score a genuinely stored posting using the **existing** Phase 5 report without replacing the scoring system; verify the entire finished workflow.

**Tasks**

- Verify `Score with Ollama` operates from each scraped job detail via the existing route/service, using the user's selected stored original resume and the real persisted JD. Do not auto-score all scraped jobs.
- Retain existing report content: **Fit Summary**, **Required Skills** (with evidence/status), **Cautions**, **Suggested Improvements**, and any existing heuristic match score/rubric. Preserve model `qwen2.5:3b` and provider settings.
- If JD is missing or blocked, explain that a grounded match report is unavailable, and provide original-link/manual-import options. Never invent missing JD or unsupported resume credentials. Invalidate/check cached scores when a JD checksum changes.
- Run full verification: filter only selected providers; Ontario location; 10-candidate aggregate cap; no next fetch until Load 10 More; second batch advances correctly; Cancel halts worker/writes; truthful ETA; live postings visible on both Scrape and Jobs while navigating; complete detail fields; deletion and access control; resume + JD -> Ollama report; persistence and SSE reconnection.
- Run `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, `npm run smoke`, Python tests and an optional permission-compliant provider smoke if available. Label fixtures vs genuine external results. Record source limitations, particularly JobSpy internal overfetch and JD availability. Update `PHASE_STATUS.md`, `DECISIONS.md`, `.env.example`, local Windows setup/troubleshooting docs.
- Produce final click-by-click acceptance instructions and evidence. Do not start Phase 7.

**Pass gate:** Current app remains intact; a genuine/fixture job with a verified JD generates the established Ollama match report; full regression evidence passes or honest blockers are documented. Final report explicitly states unverified live source behavior.

**Prompt**

```text
APPROVE PHASE 6A.8. Connect real persisted JobSpy postings to the EXISTING Ollama qwen2.5:3b match-report UI without redesigning Phase 5/6. Verify Fit Summary, Required Skills, Cautions, Suggested Improvements, truthful missing-JD handling, and checksum invalidation. Execute full end-to-end tests of all Phase 6A requirements, document exact results/limitations and STOP — Phase 6A complete, awaiting my approval before any Phase 7 work.
```

---

## How to run these instructions with Free Claude Code (Windows PowerShell)

1. Place this file at `docs/PHASE_6A_JOBSPY_STEP_BY_STEP.md` within the existing `jobnavigator-local` project. Keep the original `docs/PHASE_6A_JOBSPY_CLAUDE_INSTRUCTIONS.md` as reference if available.
2. From PowerShell, open the project and start your installed coding agent:

   ```powershell
   cd C:\Users\harsh\jobnavigator-local
   fcc-claude
   ```

3. First send ONLY the **Phase 6A.0** prompt above. Inspect results and test evidence. When satisfied, send **Phase 6A.1** prompt, etc., one at a time. Do not paste all approval prompts at once.
4. If Claude reports a bug or a gate fails, tell it: `Fix the failures in the CURRENT phase only, rerun the failing and regression gates, and STOP. Do not proceed.`
5. Optionally run `fcc-codex` as a **read-only reviewer** after a passing phase, asking for test gaps and risks only. Do not have two agents edit the same files at once.

## Acceptance matrix (must be demonstrated by the end)

| User goal | Implemented in | Evidence required |
|---|---|---|
| Four selected job boards, plus existing ATS options | 6A.1–6A.2 | Provider mapping, status and filter tests |
| All advanced filters reside in existing Scrape page | 6A.2 | UI checks; no duplicate filter panel in Jobs |
| Only 10 candidates across selected sources per click | 6A.3 | Quota+cursor tests and observed invocation count |
| No next-page background fetching | 6A.3 | No worker/provider calls after batch until user clicks again; report internal JobSpy overfetch |
| Cancel, status, elapsed time and realistic ETA | 6A.4 | Process termination, no late writes, truthfully unknown ETA |
| Live rows in Scrape and Jobs simultaneously | 6A.5 | Navigate during scrape; see same persisted jobs without reload |
| Full real details instead of dummy placeholders | 6A.6 | Job detail fixtures with present/missing fields and provenance |
| Delete from database, not merely hide a row | 6A.7 | DB deletion/owner isolation tests and restart check |
| Existing Ollama match reports on real jobs | 6A.8 | Fit Summary, Required Skills, Cautions, Suggested Improvements for verified JD |

**Do not begin Phase 7 unless I separately approve it.**
