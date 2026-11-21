<#
.SYNOPSIS
    Sets up the JobSpy Python worker virtual environment and installs dependencies.
.DESCRIPTION
    Creates a Python 3.10+ virtual environment in workers/jobspy/.venv and installs
    the pinned dependencies from requirements.txt (python-jobspy, pydantic).
.NOTES
    Run from the repository root: .\workers\jobspy\setup.ps1
#>

param()

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$workerDir = $scriptDir
$venvDir = Join-Path $workerDir '.venv'
$isWindows = $PSVersionTable.Platform -like '*Win*'
$pythonExe = if ($isWindows) { Join-Path $venvDir 'Scripts\python.exe' } else { Join-Path $venvDir 'bin/python' }
$pipExe = if ($isWindows) { Join-Path $venvDir 'Scripts\pip.exe' } else { Join-Path $venvDir 'bin/pip' }
$requirements = Join-Path $workerDir 'requirements.txt'

Write-Host "=== JobSpy Worker Setup ===" -ForegroundColor Green
Write-Host "Worker directory: $workerDir"
Write-Host "Venv directory: $venvDir"

# Check Python version
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    if (-not (Get-Command python3 -ErrorAction SilentlyContinue)) {
        Write-Error "Python 3.10+ not found in PATH. Please install Python first."
        exit 1
    }
    $pythonCmd = 'python3'
} else {
    $pythonCmd = 'python'
}

$versionOutput = & $pythonCmd --version 2>&1
Write-Host "Found: $versionOutput"

# Create venv if not exists
if (-not (Test-Path $venvDir)) {
    Write-Host "Creating virtual environment..." -ForegroundColor Yellow
    & $pythonCmd -m venv $venvDir
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to create virtual environment"
        exit 1
    }
} else {
    Write-Host "Virtual environment already exists" -ForegroundColor Gray
}

# Upgrade pip
Write-Host "Upgrading pip..." -ForegroundColor Yellow
& $pipExe install --upgrade pip
if ($LASTEXITCODE -ne 0) {
    Write-Warning "pip upgrade failed (non-fatal)"
}

# Install requirements
Write-Host "Installing requirements from $requirements..." -ForegroundColor Yellow
& $pipExe install -r $requirements
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install requirements"
    exit 1
}

# Verify jobspy is importable
Write-Host "Verifying JobSpy installation..." -ForegroundColor Yellow
& $pythonExe -c "from jobspy import scrape_jobs; print('JobSpy OK')"
if ($LASTEXITCODE -ne 0) {
    Write-Error "JobSpy import test failed"
    exit 1
}

# Test worker script syntax
Write-Host "Checking worker script syntax..." -ForegroundColor Yellow
& $pythonExe -m py_compile (Join-Path $workerDir 'worker.py')
if ($LASTEXITCODE -ne 0) {
    Write-Error "Worker script syntax check failed"
    exit 1
}

Write-Host "`n=== Setup Complete ===" -ForegroundColor Green
Write-Host "Worker ready at: $workerDir\worker.py"
Write-Host "Python executable: $pythonExe"
Write-Host ""
Write-Host "To test manually:"
Write-Host "  $pythonExe $workerDir\worker.py <<< '{\"version\":1,\"requestId\":\"test\",\"params\":{\"sources\":[\"linkedin\"],\"query\":\"software engineer\",\"location\":\"New York\",\"resultsWanted\":5}}'"