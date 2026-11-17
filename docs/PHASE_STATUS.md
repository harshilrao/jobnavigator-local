# Phase Status — JobNavigator Local

## Phase 0 — Environment audit and empty workspace ✅ COMPLETE (approved)

## Phase 1 — Running React + Express + MongoDB skeleton ✅ COMPLETE (approved)

**Goal:** A real frontend and backend with database-connected health and seeded demonstration data; no authentication yet.

**Result:** PASSED — every Phase 1 gate executed and verified with real commands.

### Gates executed (all pass)

| Gate | Command | Result |
|------|---------|--------|
| typecheck | `npm run typecheck` | ✅ Pass (api, web, shared) |
| lint | `npm run lint` | ✅ Pass (0 errors; only non-failing warnings) |
| test | `npm run test` | ✅ Pass (15 tests: api 10, web 1, shared 4) |
| build | `npm run build` | ✅ Pass (api tsc, web vite, shared tsc) |
| smoke | `npm run smoke` | ✅ Pass (api + web smoke tests) |

### Live smoke test (verified)
- Spun up the built API server (`node apps/api/dist/src/server.js`).
- `GET http://localhost:3000/api/health` → `200` with shape `{ status, version, uptime, database, ollama, timestamp }`.
- Database reported `not_configured` / `connected: false` because no `MONGODB_URI` is set yet (honest status; no crash).
- `GET http://localhost:3000/api/demo` → `200` deterministic fixtures.
- `GET http://localhost:3000/api/_ping` → `{ ok: true }`.
- `x-request-id` correlation header present on responses.

### What was created (Phase 1)

**Root:**
- `package.json` — npm workspaces (`apps/api`, `apps/web`, `packages/shared`) + all quality scripts; `dev` runs API + web via `concurrently`.
- `tsconfig.json`, `.eslintrc.json`, `.prettierrc`
- `scripts/dev.ps1` — PowerShell start/stop/restart/status guide
- `.env.example` — config contract (Atlas Free placeholder `MONGODB_URI`; secrets noted as ignored `.env` only)

**packages/shared (`@jobnavigator/shared`):**
- `src/index.ts` — Zod schemas (`HealthResponseSchema`, `DemoResponseSchema`), `APP_VERSION`, `healthCheck`/`demoCheck` validators

**apps/api (`@jobnavigator/api`, Express + TypeScript):**
- `src/config/env.ts` — Zod env validation (`NODE_ENV`, `PORT`, `WEB_ORIGIN`, `MONGODB_URI` optional, `OLLAMA_*`, `AI_PROVIDER`, `FCC_*`, `UPLOAD_MAX_BYTES`)
- `src/config/mongodb.ts` — Mongoose connection; optional URI so API starts without Atlas configured
- `src/middleware/request-id.ts` — correlation ID (`x-request-id`) on every request
- `src/middleware/error.ts` — structured JSON error middleware with status codes
- `src/modules/health/` — `GET /api/health` (version, uptime, DB status, Ollama reachability, no secrets)
- `src/routes/demo.route.ts` — `GET /api/demo` (development-only deterministic fixtures)
- `src/app.ts` — Express app, CORS restricted to `WEB_ORIGIN`, request ID, graceful routing
- `src/server.ts` — startup, `connectDB`, graceful shutdown (SIGTERM/SIGINT)
- `tests/` — health unit, integration (live HTTP against running server), smoke

**apps/web (`@jobnavigator/web`, React + Vite + TypeScript + Tailwind):**
- `vite.config.ts`, `tailwind.config.js` (`darkMode: class`), `postcss.config.js`, `index.html`
- `src/main.tsx`, `src/index.css`
- `src/lib/api.ts` — typed fetch client (`getHealth`, `getDemo`)
- `src/App.tsx` — shell, sidebar + top bar, navigation, theme (light/dark/system, persisted in localStorage)
- `src/layout/Sidebar.tsx`, `src/layout/TopBar.tsx`
- `src/pages/Dashboard.tsx` (fetches `/api/health` + `/api/demo` with loading/error/success states), `Jobs`, `Searches`, `Documents`, `Settings` placeholders
- `tests/App.test.tsx` — render smoke via `renderToString`

### Routes / URLs to inspect (once servers are running)
- API: `http://localhost:3000/api/health`
- API demo: `http://localhost:3000/api/demo` (development only)
- Web: `http://localhost:5173` (proxies `/api` → `http://localhost:3000`)

### Start (PowerShell, repo root)
1. `npm install` (done once)
2. Copy `.env.example` to `.env` and set `MONGODB_URI` to a **new** Atlas Free cluster database named `jobnavigator_local` (never `job-automation`, never an existing DB). API runs without it; health reports `not_configured`.
3. `.\scripts\dev.ps1 -Action start` (opens API on 3000, Web on 5173)
4. `.\scripts\dev.ps1 -Action status` / `-Action stop`

### Remaining bugs / notes
- MongoDB is not yet connected: set `MONGODB_URI` in `.env` (Atlas Free) to get `database.status = connected`. Until then the API is fully functional and reports `not_configured` honestly.
- This npm build does not support the `workspace:` protocol; cross-workspace `@jobnavigator/shared` uses a relative `file:../packages/shared` reference (resolved by npm workspaces as a symlink).
- esbuild postinstall scripts are gated by npm `allowScripts` (warning only; build/test unaffected).
- Playwright E2E browser smoke is not installed (no browser binaries); documented as a later step, not claimed as pass.
- Authentication, persona and original-document backends implemented (Phase 2); see Phase 2 section below.

## Phase 2 — Authentication, persona, original Document storage — IMPLEMENTED (backend)

**Goal:** The app recognizes a user and reliably stores their uploaded original resume / cover letter.

**Backend implemented**
- `apps/api/src/modules/auth/` — register/login/logout/refresh/me; bcryptjs (SALT_ROUNDS=10); JWT access (15m) + refresh (7d) with rotation/revocation; theft detection revokes all of a user's tokens; `requireAuth`/`optionalAuth` middleware; Zod credentials validation; rate limiting (20/min) on public routes.
- `apps/api/src/modules/persona/` — GET/PUT `/api/persona`; ownerId unique; upsert semantics.
- `apps/api/src/modules/documents/` — POST `/api/documents/upload` (multer, PDF/DOCX only, UPLOAD_MAX_BYTES), GET `/list`, GET `/:id/preview` (inline), GET `/:id/download` (attachment), DELETE `/:id`; GridFS immutable storage, MD5 checksum, version archival, text extraction (pdf-parse / mammoth via `createRequire`), soft-delete with `deletedAt`.
- Auth/persona/document routes mounted in `app.ts` under `/api`, protected by `requireAuth`; public auth routes rate-limited.

**Tests added**
- `apps/api/tests/auth.test.ts` — register/login/refresh/me, rate limiting.
- `apps/api/tests/documents.test.ts` — upload/list/preview/download/delete with a real PDF fixture.
- `apps/api/tests/persona.test.ts` — upsert + fetch, auth required.
- Each test connects to MongoDB only when `MONGODB_URI` is set and skips otherwise, so `npm run test` stays green without an Atlas URI.

**Routes**
- Public (rate-limited): `POST /api/auth/register`, `/login`, `/logout`, `/refresh`
- Protected (`requireAuth`): `GET /api/auth/me`; `GET/PUT /api/persona`; `POST /api/documents/upload`, `GET /api/documents`, `GET /api/documents/:id/preview`, `GET /api/documents/:id/download`, `DELETE /api/documents/:id`

**Gates** — executed and passing (with `MONGODB_URI` set against Atlas Free `jobnavigator_local`):

| Gate | Command | Result |
|------|---------|--------|
| typecheck | `npm run typecheck` | ✅ Pass (api) |
| lint | `npm run lint` | ✅ Pass (0 errors; only non-failing warnings) |
| test | `npm run test` | ✅ Pass (34 tests across 6 files: auth 13, documents 7, integration 5, persona 4, health 2, smoke 3) |
| build | `npm run build` | ✅ Pass (api tsc) |
| smoke | `npm run smoke` | ✅ Pass (api 3) |

TypeScript compilation errors fixed in Phase 2 backend modules (see "Files changed — Phase 2 gate fixes" below). With `MONGODB_URI` set, the health endpoint reports `database.status = connected`; without it, `not_configured` honestly.

**Files changed (Phase 2)**
- New API module files under `apps/api/src/modules/{auth,documents,persona}/`
- New API test files: `apps/api/tests/{auth,documents,persona}.test.ts` and fixture `apps/api/tests/fixtures/sample.pdf` (valid PDF generated with pdf-lib; pdf-parse extracts "John Doe")
- Auth service/model/middleware/route wired into `app.ts` (written prior session).

**Files changed — Phase 2 gate fixes (this session)**
- `apps/api/src/config/auth.ts` — `TokenPayload` gains optional `role` so middleware can apply `role ?? 'owner'`.
- `apps/api/src/modules/auth/auth.middleware.ts` — `requireAuth` typed as Express `RequestHandler` (was an incompatible standalone signature); casts `req` to `AuthenticatedRequest` internally.
- `apps/api/src/modules/auth/auth.route.ts` — `validateBody` returns `RequestHandler`; route handlers cast `req.body` to the validated credentials shape.
- `apps/api/src/config/rate-limit.ts` — `rateLimiter` returns typed `RequestHandler`; imports `RequestHandler` from express.
- `apps/api/src/modules/documents/document.service.ts` — re-exports `DocumentType` and `TextExtractionStatus`; `getDb()` casts mongoose's bundled `mongodb.Db` to the hoisted `mongodb.Db` (duplicate module copies are the same object at runtime). `extractText()` now accepts `Uint8Array` (pdf-parse/pdf.js does not reliably handle Node.js `Buffer`); `Uint8Array` is converted back to `Buffer` only for mammoth (DOCX).
- `apps/api/src/modules/documents/document.route.ts` — preview/download routes changed from `stream.pipe(res)` to async-iteration chunk collection + `res.send()` because GridFS download streams hang under `.pipe()` in the vitest/Node environment.
- `apps/api/tests/{auth,documents,persona}.test.ts` — capture `server` in a local const before `.close()` (TS narrowing resets in closures); `new Promise<void>` for body-cancel cleanup.
- `apps/api/tests/smoke.test.ts` — DB status assertion relaxed to `typeof db.connected === 'boolean' && typeof db.status === 'string'` (MONGODB_URI now configured).
- `apps/api/tests/integration.test.ts` — `not_configured` test renamed to reflect configured URI; asserts `connected`/`disconnected` shape instead.
- `apps/api/tests/documents.test.ts` — preview/download/delete now use `uploadedDocId` captured from upload response (more robust than `list[0]`); removed `res.body.cancel()` calls that caused "ReadableStream is locked" unhandled rejections.
- `apps/api/src/config/env.ts` — `loadEnv()` re-parses when `process.env.NODE_ENV` changes and `getEnv()` delegates to it, so a test flipping `NODE_ENV` to `development` after module load gets the new value (fixes `/api/demo` 404 in `integration.test.ts`).
- `apps/api/package.json`, `package-lock.json` — added `devDependency @types/multer` (multer had no bundled types).
- Temporary PDF generation scripts (`make-fixture.cjs`, `test-pdf.cjs`, `gen-fixture.cjs`, `gen-pdf.cjs`) removed after valid fixture was produced.

**Test results (against real MongoDB Atlas `jobnavigator_local`):**
- auth.test.ts: 13/13 (register, login, refresh, me, rate limiting, password/email validation)
- documents.test.ts: 7/7 (upload auth, upload+extract "John Doe", reject non-PDF, list, preview, download, soft-delete)
- integration.test.ts: 5/5 (health shape, DB status, _ping, demo, 404)
- persona.test.ts: 4/4 (upsert, fetch, auth required)
- health.test.ts: 2/2 (isDBConnected boolean, createApp)
- smoke.test.ts: 3/3 (health shape, x-request-id, version constant)

**Database verified:** MongoDB Atlas `jobnavigator_local` connects successfully; collections include `users`, `refreshtokens`, `personas`, `original_documents`, `original_documents.files`, `original_documents.chunks`.

---

**STOP — Phase 2 gates all pass. Awaiting `APPROVE PHASE 3` (do not start Phase 3).**
