# JobNavigator Local — start / stop / restart / status
# Run from repo root in PowerShell: .\scripts\dev.ps1 -Action start|stop|restart|status
#
# Prerequisites before `start`:
#   1. npm install   (run once)
#   2. Copy .env.example to .env and set MONGODB_URI to a NEW Atlas Free cluster
#      (database named jobnavigator_local — never an existing job-automation DB).
param([string]$Action = 'start')

$apiPort = 3000
$webPort = 5173

function Find-PidByPort($port) {
  try {
    $conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    if ($conn) { return $conn.OwningProcess }
  } catch {}
  return $null
}

function Stop-Port($port) {
  $pid = Find-PidByPort $port
  if ($pid) {
    Write-Host "Stopping PID $pid on port $port..." -ForegroundColor Yellow
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue | Out-Null
  } else {
    Write-Host "Nothing listening on port $port" -ForegroundColor Gray
  }
}

switch ($Action) {
  'start' {
    Write-Host "Starting JobNavigator Local ...`n  API : $apiPort`n  Web : $webPort" -ForegroundColor Cyan
    Write-Host "Prereq: set MONGODB_URI in .env (Atlas Free). API will run and report `not_configured` until set." -ForegroundColor Yellow
    Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm run dev:api" -WindowStyle Minimized | Out-Null
    Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm run dev:web" -WindowStyle Minimized | Out-Null
    Write-Host "API health: http://localhost:$apiPort/api/health" -ForegroundColor Green
    Write-Host "Web app:    http://localhost:$webPort" -ForegroundColor Green
  }
  'stop' {
    Stop-Port $apiPort
    Stop-Port $webPort
    Write-Host "Stopped." -ForegroundColor Green
  }
  'restart' {
    Stop-Port $apiPort
    Stop-Port $webPort
    Start-Sleep -Seconds 2
    & $PSCommandPath -Action start
  }
  'status' {
    $a = Find-PidByPort $apiPort; $w = Find-PidByPort $webPort
    Write-Host "API :$apiPort  PID $a   running=$($null -ne $a)"
    Write-Host "Web :$webPort  PID $w   running=$($null -ne $w)"
  }
  default { Write-Host "Use: .\scripts\dev.ps1 -Action start|stop|restart|status" }
}
