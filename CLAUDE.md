# JobNavigator Local — CLAUDE.md

**Project:** JobNavigator Local — self-hosted job-search and application management app.
**Stack:** Node.js 24 LTS, React + Vite + TypeScript + Tailwind CSS, Node.js + Express + TypeScript, MongoDB + Mongoose, Zod, Ollama (default runtime AI), optional Free Claude Code proxy behind disabled flag.
**Ports:** Web 5173, API 3000, MongoDB 27017, Ollama 11434, optional FCC proxy 8082.
**Database:** `mongodb://127.0.0.1:27017/jobnavigator_local` (new isolated database, never an existing one).

## Working rules (from docs/BUILD_PLAN.md)

- Phase 0 complete: environment audited, docs scaffolding created. Awaiting `APPROVE PHASE 1`.
- Never touch, delete, rename, migrate or import from any existing `job-automation` project or old MongoDB databases.
- Target Windows 11 + PowerShell; native npm commands only. No Bash, WSL, Docker, Python, Linux utilities, or Redis for the MVP.
- npm-workspaces monorepo with `apps/api`, `apps/web`, `packages/shared`, `docs`, `tests`. Share only schemas/types from `packages/shared`.
- Keep cost $0 by default: local MongoDB or Atlas Free (user-selected), local Ollama, no paid APIs.
- Ollama is the default runtime AI provider (`qwen2.5:3b`). FCC proxy is disabled by default; never spawn `fcc-claude` from HTTP requests.
- Do not guess secrets. `.env.example` has no real keys; actual secrets only in ignored `.env` files.
- Never print tokens or resume PII in logs or commit them.

## Quality commands (root)

- `npm install`
- `npm run dev` (start API + web; print URLs)
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run smoke` (short non-destructive verification)

## Current phase

See `docs/PHASE_STATUS.md`.
