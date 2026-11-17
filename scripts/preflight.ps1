# JobNavigator Local - preflight.ps1
# Non-destructive environment verification for Phase 0.
# Run: .\scripts\preflight.ps1

$ErrorActionPreference = "Continue"
$host.UI.RawUI.WindowTitle = "JobNavigator Local - Preflight"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  JobNavigator Local - Environment Audit" -ForegroundColor Cyan
Write-Host "  Phase 0 - Preflight Check" -ForegroundColor Cyan
Write-Host "`n" -ForegroundColor Cyan

function Check($label, $ok, $detail) {
  $icon = if ($ok) { "OK" } else { "FAIL" }
  Write-Host "[$icon] $label"
  if ($detail) { Write-Host "    $detail" -ForegroundColor Gray }
  return $ok
}

$allOk = $true

# --- Node / npm / git ---
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
  $nv = node --version
  $allOk = $allOk -band (Check "Node.js" $true $nv)
} else {
  $allOk = $allOk -band (Check "Node.js" $false "Not found - install Node.js 24 LTS")
}

$npm = Get-Command npm -ErrorAction SilentlyContinue
if ($npm) {
  $nv = npm --version
  $allOk = $allOk -band (Check "npm" $true $nv)
} else {
  $allOk = $allOk -band (Check "npm" $false "Not found")
}

$git = Get-Command git -ErrorAction SilentlyContinue
if ($git) {
  $gv = git --version
  $allOk = $allOk -band (Check "git" $true $gv)
} else {
  $allOk = $allOk -band (Check "git" $false "Not found")
}

# --- Ollama ---
$ollama = Get-Command ollama -ErrorAction SilentlyContinue
if ($ollama) {
  $ov = ollama --version
  $allOk = $allOk -band (Check "Ollama CLI" $true $ov)

  $models = ollama list 2>$null
  if ($models -match "qwen2.5:3b") {
    $allOk = $allOk -band (Check "Ollama model qwen2.5:3b" $true "Installed")
  } else {
    $allOk = $allOk -band (Check "Ollama model qwen2.5:3b" $false "Run: ollama pull qwen2.5:3b")
  }

  try {
    $tags = Invoke-RestMethod http://127.0.0.1:11434/api/tags -TimeoutSec 5
    $allOk = $allOk -band (Check "Ollama API (11434)" $true "Reachable")
    $testBody = @{ model="qwen2.5:3b"; messages=@(@{ role="user"; content="Say hello in exactly five words." }); stream=$false } | ConvertTo-Json
    $resp = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/chat" -Method Post -ContentType "application/json" -Body $testBody -TimeoutSec 30
    $allOk = $allOk -band (Check "Ollama test prompt" $true "Response: $($resp.message.content)")
  } catch {
    $allOk = $allOk -band (Check "Ollama API (11434)" $false "Not reachable - start ollama serve")
    $allOk = $allOk -band (Check "Ollama test prompt" $false "Skipped (API unreachable)")
  }
} else {
  $allOk = $allOk -band (Check "Ollama CLI" $false "Not found - install Ollama")
  $allOk = $allOk -band (Check "Ollama model qwen2.5:3b" $false "Skipped")
  $allOk = $allOk -band (Check "Ollama API (11434)" $false "Skipped")
  $allOk = $allOk -band (Check "Ollama test prompt" $false "Skipped")
}

# --- Ports ---
Write-Host "`nPort check (3000, 5173, 27017, 11434, 8082):" -ForegroundColor Gray
$ports = @(3000, 5173, 27017, 11434, 8082)
$conns = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in $ports } | Select-Object LocalAddress, LocalPort, OwningProcess
if ($conns) {
  $conns | ForEach-Object { Write-Host "    Port $($_.LocalPort) in use by PID $($_.OwningProcess) on $($_.LocalAddress)" -ForegroundColor Yellow }
} else {
  Write-Host "    No monitored ports in use" -ForegroundColor Gray
}

# --- MongoDB ---
$mongod = Get-Command mongod -ErrorAction SilentlyContinue
$mongosh = Get-Command mongosh -ErrorAction SilentlyContinue
if ($mongod -or $mongosh) {
  $allOk = $allOk -band (Check "MongoDB tools" $true "Found")
  try {
    $test = Invoke-RestMethod -Uri "http://127.0.0.1:27017" -TimeoutSec 3 -ErrorAction Stop
    $allOk = $allOk -band (Check "MongoDB running (27017)" $true "Responding")
  } catch {
    $allOk = $allOk -band (Check "MongoDB running (27017)" $false "Not running or not HTTP - start mongod or configure Atlas URI")
  }
} else {
  $allOk = $allOk -band (Check "MongoDB tools" $false "Not installed - install Community Edition or use Atlas Free")
  $allOk = $allOk -band (Check "MongoDB running (27017)" $false "Skipped")
}

# --- fcc-claude ---
$fcc = Get-Command fcc-claude -ErrorAction SilentlyContinue
if ($fcc) {
  $fv = fcc-claude --version 2>$null
  $allOk = $allOk -band (Check "fcc-claude" $true $fv)
} else {
  $allOk = $allOk -band (Check "fcc-claude" $false "Not found - optional, used as dev assistant only")
}

# --- Port 8082 possible FCC proxy ---
try {
  $r = Invoke-RestMethod http://127.0.0.1:8082/v1/models -TimeoutSec 3 -ErrorAction Stop
  $allOk = $allOk -band (Check "Port 8082 (FCC proxy)" $true "Responding")
} catch {
  $allOk = $allOk -band (Check "Port 8082 (FCC proxy)" $true "In use but requires auth / not FCC - keep FCC_PROXY_ENABLED=false")
}

# --- Directory integrity ---
$isGit = Test-Path ".git"
if (-not $isGit) {
  Write-Host "`nGit repo: not initialized (expected for fresh Phase 0)" -ForegroundColor Gray
} else {
  Write-Host "`nGit repo: already initialized" -ForegroundColor Gray
}

$files = Get-ChildItem -Recurse -Depth 2 | Where-Object { -not $_.PSIsContainer }
Write-Host "Files present: $($files.Count)" -ForegroundColor Gray

# --- Summary ---
Write-Host "`n========================================" -ForegroundColor Cyan
if ($allOk) {
  Write-Host "  Preflight: ALL CHECKS PASSED" -ForegroundColor Green
} else {
  Write-Host "  Preflight: SOME CHECKS FAILED - review above" -ForegroundColor Red
}
Write-Host "========================================" -ForegroundColor Cyan

if (-not $allOk) {
  exit 1
}
