# JobSpy Worker

Isolated Python worker for fetching jobs from JobSpy-supported sources (LinkedIn, Indeed, Glassdoor, ZipRecruiter).

## Architecture

```
Node.js API (Express)
    │
    ├── spawns (child_process.spawn)
    │
    ▼
Python Worker (workers/jobspy/worker.py)
    │
    ├── JSON input via stdin (one request per line)
    │
    ├── JobSpy library
    │
    └── JSONL output via stdout (one response per line)
```

## Protocol

**Request** (stdin, one JSON object):
```json
{
  "version": 1,
  "requestId": "req-123",
  "params": {
    "sources": ["linkedin", "indeed"],
    "query": "software engineer",
    "location": "New York",
    "country": "USA",
    "resultsWanted": 10,
    "offset": 0,
    "fetchDescription": true,
    "hoursOld": 168,
    "jobType": "fulltime",
    "remote": true,
    "easyApply": false
  }
}
```

**Response** (stdout, one JSONL line):
```json
{
  "version": 1,
  "requestId": "req-123",
  "jobs": [
    {
      "sourceJobId": "linkedin:abc123",
      "title": "Software Engineer",
      "company": "Acme Corp",
      "location": "New York, NY",
      "url": "https://linkedin.com/jobs/view/...",
      "description": "Full job description...",
      "descriptionStatus": "complete",
      "salary": {"min": 100000, "max": 150000, "currency": "USD", "period": "year"},
      "postedAt": "2024-01-15T10:30:00Z",
      "source": "linkedin",
      "jobType": "fulltime",
      "isRemote": false,
      "emails": null
    }
  ],
  "hasMore": true,
  "error": null
}
```

## Setup

```powershell
# From repository root
.\workers\jobspy\setup.ps1
```

This creates `.venv/` and installs:
- `python-jobspy==1.4.1`
- `pydantic==2.8.2`
- `pydantic-settings==2.16.3`

## Testing

```powershell
# Quick test (requires internet)
$python = .\workers\jobspy\.venv\Scripts\python.exe
$python .\workers\jobspy\worker.py <<< '{"version":1,"requestId":"test","params":{"sources":["linkedin"],"query":"software engineer","location":"New York","resultsWanted":3}}'
```

## Integration

The Node.js bridge (`apps/api/src/modules/scraping/jobspy-bridge.ts`) handles:
- Spawning the Python process with the correct venv Python
- Sending requests and parsing JSONL responses
- Timeouts (60s default)
- Cancellation via AbortSignal
- Zod validation of responses
- Graceful process termination

## Limitations & Caveats

1. **JobSpy may internally overfetch**: The library's `results_wanted` parameter is not always a hard network limit. Document this honestly.
2. **Rate limiting**: Public job boards may block/rate-limit aggressive scraping. The worker uses polite delays (5s between requests).
3. **No authentication**: JobSpy uses public scraping; no API keys. May hit captchas or blocks.
4. **Windows process tree**: On cancel, the Node bridge uses `taskkill /T` to terminate the entire Python process tree.
5. **Description fetching**: `fetch_description=true` makes an additional request per job; significantly slower.

## Source Capabilities

| Source | Query | Company | Location | Description | Auth |
|--------|-------|---------|----------|-------------|------|
| LinkedIn | ✅ | ❌ | ✅ | ✅ (slow) | None |
| Indeed | ✅ | ❌ | ✅ | ✅ | None |
| Glassdoor | ✅ | ❌ | ✅ | ✅ | None |
| ZipRecruiter | ✅ | ❌ | ✅ | ✅ | None |

## Configuration

No configuration required. The worker uses public scraping only.
User settings in the UI (Settings > Scrape) are for ATS adapters only, not JobSpy.