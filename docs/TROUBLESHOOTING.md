# Troubleshooting — JobNavigator Local

## Phase 0 known issues and fixes

### MongoDB not installed

**Symptom:** `mongod`, `mongo`, `mongosh` not found; port 27017 not listening.

**Fix options (user choice):**
1. Install MongoDB Community Edition locally (Windows MSI), start `mongod` with `dbpath` pointing to a local data directory, then verify `mongodb://127.0.0.1:27017/jobnavigator_local` connects.
2. Create a MongoDB Atlas Free cluster, set `MONGODB_URI` in `.env` to the Atlas connection string, and never use an existing database implicitly.

Do not assume a cloud provider; decide before Phase 1.

### Node.js v26 vs planned v24 LTS

**Symptom:** Build plan targets Node 24 LTS; machine has v26.13.0.

**Fix:** v26 should be compatible with the planned stack. If a package fails in Phase 1, record the exact error here and consider `nvm` or downgrading only with user permission.

### Port 8082 in use (401 Unauthorized)

**Symptom:** `Get-NetTCPConnection` shows port 8082 listening; `Invoke-RestMethod http://127.0.0.1:8082/v1/models` returns 401.

**Fix:** Likely an FCC proxy already running. Keep `FCC_PROXY_ENABLED=false` in `.env`; the proxy is optional and disabled by default. Do not launch a second service on 8082.

### Ollama on port 11434 already running

**Symptom:** Port 11434 occupied by Ollama PID 21612.

**Fix:** Do not run `ollama serve` again. Use the existing instance. Confirm `qwen2.5:3b` is listed via `ollama list` before Phase 5.
