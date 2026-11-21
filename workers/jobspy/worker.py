#!/usr/bin/env python3
"""
JobSpy Worker - Isolated Python process for fetching jobs from JobSpy-supported sources.

Protocol (JSON over stdin/stdout):
- Input:  {"version": 1, "params": {...}, "requestId": "..."}
- Output: {"version": 1, "requestId": "...", "jobs": [...], "hasMore": bool, "error": null|str}
- Each line of stdout is a separate JSON message (JSONL)
- Errors are reported in the "error" field, not via stderr (stderr is for logging only)
"""

import sys
import json
import argparse
import signal
import traceback
import math
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, asdict
from datetime import datetime

try:
    from jobspy import scrape_jobs
except ImportError as e:
    print(json.dumps({
        "version": 1,
        "requestId": "init",
        "jobs": [],
        "hasMore": False,
        "error": f"JobSpy not available: {e}"
    }), flush=True)
    sys.exit(1)


# Supported JobSpy site names (maps to our source IDs)
SITE_MAP = {
    "linkedin": "linkedin",
    "indeed": "indeed",
    "glassdoor": "glassdoor",
    "zip_recruiter": "zip_recruiter",
}

# Reverse map for validation
VALID_SOURCES = set(SITE_MAP.keys())

def sanitize_for_json(value: Any) -> Any:
    """Convert NaN/Inf to None for valid JSON serialization."""
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    if isinstance(value, dict):
        return {k: sanitize_for_json(v) for k, v in value.items()}
    if isinstance(value, list):
        return [sanitize_for_json(v) for v in value]
    return value

# ISO 3166-1 alpha-3 to full country name mapping (for JobSpy)
ISO_TO_COUNTRY = {
    "USA": "usa",
    "CAN": "canada",
    "GBR": "united kingdom",
    "AUS": "australia",
    "DEU": "germany",
    "FRA": "france",
    "IND": "india",
    "BRA": "brazil",
    "MEX": "mexico",
    "ESP": "spain",
    "ITA": "italy",
    "NLD": "netherlands",
    "POL": "poland",
    "CHE": "switzerland",
    "SWE": "sweden",
    "NOR": "norway",
    "DNK": "denmark",
    "FIN": "finland",
    "AUT": "austria",
    "BEL": "belgium",
    "IRL": "ireland",
    "PRT": "portugal",
    "SGP": "singapore",
    "HKG": "hong kong",
    "JPN": "japan",
    "KOR": "south korea",
    "NZL": "new zealand",
    "ZAF": "south africa",
    "ARE": "united arab emirates",
    "ISR": "israel",
    "TUR": "turkey",
    "CHN": "china",
}


def convert_country_code(country: Optional[str]) -> Optional[str]:
    """Convert ISO 3166-1 alpha-3 code to full country name for JobSpy."""
    if not country:
        return None
    upper = country.upper()
    return ISO_TO_COUNTRY.get(upper, country.lower())


@dataclass
class JobInput:
    """Input parameters for a scrape request."""
    sources: List[str]           # e.g., ["linkedin", "indeed"]
    query: Optional[str]         # Search query/keywords
    location: Optional[str]      # Location string
    country: Optional[str]       # Country code (indeed/glassdoor)
    results_wanted: int          # Max results per source
    offset: int                  # Pagination offset
    fetch_description: bool      # Whether to fetch full descriptions
    hours_old: Optional[int]     # Posted within hours
    job_type: Optional[str]      # fulltime, parttime, contract, etc.
    remote: Optional[bool]       # Remote filter
    easy_apply: Optional[bool]   # Easy apply filter
    is_remote: Optional[bool]    # Alias for remote
    request_id: str              # Correlation ID


def validate_sources(sources: List[str]) -> List[str]:
    """Validate and filter sources to only supported ones."""
    valid = [s for s in sources if s in VALID_SOURCES]
    invalid = set(sources) - VALID_SOURCES
    if invalid:
        print(f"[worker] Warning: ignoring unsupported sources: {invalid}", file=sys.stderr)
    print(f"[worker] Validated sources: input={sources}, valid={valid}", file=sys.stderr)
    return valid


def convert_jobspy_job(job: Dict[str, Any], source: str) -> Dict[str, Any]:
    """Convert JobSpy job dict to our standardized RawJob format."""
    # JobSpy returns: title, company, location, job_url, description, date_posted,
    # salary_min, salary_max, salary_currency, job_type, is_remote, etc.
    # Sanitize all values to handle NaN/Inf from pandas
    sanitized_job = sanitize_for_json(job)

    # Handle emails - JobSpy may return string (comma-separated) or list or NaN
    raw_emails = sanitized_job.get("emails")
    if raw_emails is None:
        emails = None
    elif isinstance(raw_emails, list):
        emails = raw_emails
    elif isinstance(raw_emails, str):
        # Split comma-separated string into list
        emails = [e.strip() for e in raw_emails.split(',') if e.strip()]
    else:
        # Any other type (e.g., float NaN handled by sanitize) -> None
        emails = None

    # Handle description: sanitize_for_json converts NaN to None, so we need to handle None explicitly
    desc = sanitized_job.get("description")
    if desc is None:
        desc = ""
    return {
        "sourceJobId": f"{source}:{sanitized_job.get('job_url', '')[-50:]}",  # Use URL suffix as ID
        "title": sanitized_job.get("title", ""),
        "company": sanitized_job.get("company", ""),
        "location": sanitized_job.get("location", ""),
        "url": sanitized_job.get("job_url", ""),
        "description": desc,
        "descriptionStatus": "complete" if desc else "missing",
        "salary": {
            "min": sanitized_job.get("salary_min"),
            "max": sanitized_job.get("salary_max"),
            "currency": sanitized_job.get("salary_currency", "USD"),
            "period": "year"
        } if sanitized_job.get("salary_min") or sanitized_job.get("salary_max") else None,
        "postedAt": sanitized_job.get("date_posted").isoformat() if sanitized_job.get("date_posted") else None,
        "source": source,
        "jobType": sanitized_job.get("job_type"),
        "isRemote": sanitized_job.get("is_remote"),
        "emails": emails,
    }


def scrape_source(source: str, params: JobInput) -> List[Dict[str, Any]]:
    """Scrape a single source using JobSpy."""
    try:
        # Convert country code for JobSpy (expects full name, not ISO code)
        country = convert_country_code(params.country)

        # Map our params to JobSpy params
        jobspy_params = {
            "site_name": [source],
            "search_term": params.query or "",
            "location": params.location or "",
            "results_wanted": params.results_wanted,
            "offset": params.offset,
            "hours_old": params.hours_old,
            "job_type": params.job_type,
            "is_remote": params.remote or params.is_remote,
            "easy_apply": params.easy_apply,
            "country_indeed": country if source in ("indeed", "glassdoor") else None,
            "fetch_description": params.fetch_description,
        }
        # Remove None values
        jobspy_params = {k: v for k, v in jobspy_params.items() if v is not None}

        print(f"[worker] Scraping {source} with params: {jobspy_params}", file=sys.stderr)

        print(f"[worker] Calling jobspy.scrape_jobs for {source}...", file=sys.stderr)

        # Handle zip_recruiter datetime parsing bug separately
        if source == "zip_recruiter":
            try:
                jobs_df = scrape_jobs(**jobspy_params)
            except Exception as e:
                # JobSpy zip_recruiter has a bug with datetime parsing (epoch timestamps)
                # Log and return empty rather than crash
                print(f"[worker] zip_recruiter error (known bug): {e}", file=sys.stderr)
                jobs_df = None
        else:
            jobs_df = scrape_jobs(**jobspy_params)

        print(f"[worker] jobspy.scrape_jobs returned for {source}", file=sys.stderr)

        if jobs_df is None or jobs_df.empty:
            print(f"[worker] {source}: no results", file=sys.stderr)
            return []

        # Convert DataFrame to list of dicts
        jobs = jobs_df.to_dict(orient="records")
        print(f"[worker] {source}: fetched {len(jobs)} raw jobs", file=sys.stderr)

        # Log first job raw data for debugging
        if jobs:
            first_job = jobs[0]
            print(f"[worker] {source} first job keys: {list(first_job.keys())}", file=sys.stderr)
            print(f"[worker] {source} first job sample: title={first_job.get('title')}, company={first_job.get('company')}, location={first_job.get('location')}, job_url={first_job.get('job_url')}, date_posted={first_job.get('date_posted')}", file=sys.stderr)

        # Convert to our format
        converted = [convert_jobspy_job(job, source) for job in jobs]
        print(f"[worker] {source}: converted {len(converted)} jobs", file=sys.stderr)
        if converted:
            print(f"[worker] {source} first converted: sourceJobId={converted[0].get('sourceJobId')}, title={converted[0].get('title')}, company={converted[0].get('company')}", file=sys.stderr)

        return converted

    except Exception as e:
        print(f"[worker] Error scraping {source}: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return []


def process_request(input_data: str) -> dict:
    """Process a single JSONL request and return the response dict."""
    try:
        request = json.loads(input_data)

        print(f"[worker] Received request: {json.dumps(request, default=str)}", file=sys.stderr)

        # Validate version
        if request.get("version") != 1:
            return {
                "version": 1,
                "requestId": request.get("requestId", "unknown"),
                "jobs": [],
                "hasMore": False,
                "error": f"Unsupported protocol version: {request.get('version')}"
            }

        params_data = request.get("params", {})
        request_id = request.get("requestId", "unknown")

        # Build input object
        params = JobInput(
            sources=validate_sources(params_data.get("sources", [])),
            query=params_data.get("query"),
            location=params_data.get("location"),
            country=params_data.get("country"),
            results_wanted=params_data.get("resultsWanted", 10),
            offset=params_data.get("offset", 0),
            fetch_description=params_data.get("fetchDescription", True),
            hours_old=params_data.get("hoursOld"),
            job_type=params_data.get("jobType"),
            remote=params_data.get("remote"),
            easy_apply=params_data.get("easyApply"),
            is_remote=params_data.get("isRemote"),
            request_id=request_id,
        )

        print(f"[worker] Parsed params: {params}", file=sys.stderr)

        if not params.sources:
            return {
                "version": 1,
                "requestId": request_id,
                "jobs": [],
                "hasMore": False,
                "error": "No valid sources provided"
            }

        # Scrape each source
        all_jobs = []
        for source in params.sources:
            jobs = scrape_source(source, params)
            all_jobs.extend(jobs)

        print(f"[worker] Total jobs fetched across all sources: {len(all_jobs)}", file=sys.stderr)

        # Apply aggregate limit (10 candidates max across all sources per Phase 6A rules)
        # Note: JobSpy may fetch more internally; we enforce the limit here
        limited_jobs = all_jobs[:params.results_wanted]
        has_more = len(all_jobs) > params.results_wanted

        print(f"[worker] After limit: {len(limited_jobs)} jobs, hasMore={has_more}", file=sys.stderr)

        # Output result
        result = {
            "version": 1,
            "requestId": request_id,
            "jobs": limited_jobs,
            "hasMore": has_more,
            "error": None
        }
        print(f"[worker] Sending result: {len(limited_jobs)} jobs", file=sys.stderr)
        return result

    except json.JSONDecodeError as e:
        return {
            "version": 1,
            "requestId": "unknown",
            "jobs": [],
            "hasMore": False,
            "error": f"Invalid JSON input: {e}"
        }
    except Exception as e:
        traceback.print_exc(file=sys.stderr)
        return {
            "version": 1,
            "requestId": request.get("requestId", "unknown") if 'request' in locals() else "unknown",
            "jobs": [],
            "hasMore": False,
            "error": f"Worker error: {e}"
        }


def main():
    parser = argparse.ArgumentParser(description="JobSpy Worker")
    parser.add_argument("--version", action="version", version="1.0.0")
    args = parser.parse_args()

    # Read JSONL input from stdin line by line (long-running process)
    print("[worker] Starting JobSpy worker, reading JSONL from stdin...", file=sys.stderr)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        print(f"[worker] Processing line: {line[:100]}...", file=sys.stderr)
        result = process_request(line)
        print(json.dumps(result), flush=True)


if __name__ == "__main__":
    main()