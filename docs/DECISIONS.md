# Architecture Decisions — JobNavigator Local

## Phase 0 decisions

| Decision | Rationale | Status |
|----------|-----------|--------|
| Node.js v26.13.0 accepted though plan targets Node 24 LTS | v26 is installed; v24 LTS install would be system software requiring user permission. Will verify compatibility in Phase 1. | Proposed |
| MongoDB not yet installed | No `mongod`/`mongosh` on PATH. User must choose Community Edition local install or Atlas Free. | Pending user choice |
| Port 8082 already in use (401) | Likely FCC proxy. Keep FCC proxy disabled by default per build plan. | Noted |
| Ollama is default AI provider | `qwen2.5:3b` already downloaded and API reachable. | Confirmed |
| fcc-claude is dev assistant only | Version 2.1.323, Claude Code CLI. Never spawn from HTTP requests. | Confirmed |

## Phase 1 decisions

| Decision | Rationale | Status |
|----------|-----------|--------|
| npm workspaces with `file:` ref for shared | This npm build rejects the `workspace:` protocol; `@jobnavigator/shared` uses `file:../packages/shared` (symlinked by workspaces) | Confirmed |
| Mongoose for MongoDB | Plan stack; connection is optional via `MONGODB_URI` so the API starts and reports `not_configured` before an Atlas URI is supplied | Confirmed |
| CORS restricted to `WEB_ORIGIN` (localhost:5173) | Only the local web origin may call the API; more origins added in later phases | Confirmed |
| `GET /api/demo` is development-only | Mounted only when `NODE_ENV === development`; harmless deterministic fixtures, no persisted data | Confirmed |
| Database status reported honestly | With no `MONGODB_URI`, `/api/health` reports `not_configured` / `connected: false` instead of crashing | Confirmed |
| Native `fetch` + `AbortController` for Ollama reachability | Non-blocking, short timeout; AI never blocks the UI | Confirmed |

## Phase 2 decisions

| Decision | Rationale | Status |
|----------|-----------|--------|
| JWT access (15m) + refresh (7d) tokens; bcryptjs SALT_ROUNDS=10 | Short access TTL limits theft window; standard-cost password hashing | Confirmed |
| Refresh token rotation + revocation; theft detection revokes all a user's tokens | Limits damage from a stolen refresh token | Confirmed |
| GridFS immutable original storage with MD5 checksum + version archival | Original resume/cover-letter bytes never mutated; version replacement appends a new GridFS file | Confirmed |
| PDF/DOCX-only upload via multer `fileFilter` + `UPLOAD_MAX_BYTES` (10 MB) | Limits upload surface and size per plan security rules | Confirmed |
| Text extraction via pdf-parse / mammoth using `createRequire` | Avoids the ESM/CJS `pdfParse is not a function` failure; extraction never crashes upload | Confirmed |
| Tests connect to MongoDB only when `MONGODB_URI` is set, otherwise skip | Keeps `npm run test` green without an Atlas URI; runs against a real DB when configured | Confirmed |
