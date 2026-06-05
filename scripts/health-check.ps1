# Health-check / self-heal for the KELS Curator Bot.
# Healthy = PID alive AND heartbeat (data/heartbeat.txt) is fresh. A logged-in but
# hung bot has a stale heartbeat, so this catches zombies as well as dead processes.
# Run periodically (every ~5 min) and at logon via install-healthcheck.ps1.
param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [int]$HeartbeatMaxMinutes = 6
)

$pidFile   = Join-Path $ProjectRoot 'kels-curator-bot.pid'
$heartbeat = Join-Path $ProjectRoot 'data\heartbeat.txt'
$logDir    = Join-Path $ProjectRoot 'logs'
$logFile   = Join-Path $logDir 'health.log'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-HealthLog([string]$msg) {
  "$([DateTime]::Now.ToString('s'))  $msg" | Out-File -FilePath $logFile -Append -Encoding utf8
}

# 1. Process alive?
$alive = $false
if (Test-Path $pidFile) {
  $botPid = (Get-Content $pidFile -Raw).Trim()
  if ($botPid -and (Get-Process -Id ([int]$botPid) -ErrorAction SilentlyContinue)) { $alive = $true }
}

# 2. Heartbeat fresh?
$fresh = $false
if (Test-Path $heartbeat) {
  try {
    $ts = [DateTime]::Parse((Get-Content $heartbeat -Raw).Trim())
    if (((Get-Date) - $ts).TotalMinutes -lt $HeartbeatMaxMinutes) { $fresh = $true }
  } catch { }
}

if ($alive -and $fresh) { exit 0 }  # healthy, nothing to do

Write-HealthLog "UNHEALTHY (alive=$alive fresh=$fresh) -> restarting"
try { & (Join-Path $PSScriptRoot 'stop-bot.ps1') | Out-Null } catch { Write-HealthLog "stop error: $($_.Exception.Message)" }
Start-Sleep -Seconds 2
try {
  & (Join-Path $PSScriptRoot 'start-bot.ps1') | Out-Null
  Write-HealthLog "restart issued"
} catch {
  Write-HealthLog "start error: $($_.Exception.Message)"
}
