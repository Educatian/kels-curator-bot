param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$pidFile = Join-Path $ProjectRoot 'kels-curator-bot.pid'
$logFile = Join-Path $ProjectRoot 'logs\bot.log'
$errFile = Join-Path $ProjectRoot 'logs\bot.err.log'

if (Test-Path $pidFile) {
  $botPid = Get-Content $pidFile | Select-Object -First 1
  $process = if ($botPid) { Get-Process -Id ([int]$botPid) -ErrorAction SilentlyContinue } else { $null }
  if ($process) {
    Write-Output "KELS Curator Bot running. PID: $botPid"
  } else {
    Write-Output "KELS Curator Bot PID file exists, but process is not running."
  }
} else {
  Write-Output "KELS Curator Bot is not tracked as running."
}

if (Test-Path $logFile) {
  Write-Output ""
  Write-Output "Last log lines:"
  Get-Content -LiteralPath $logFile -Tail 20
}

if (Test-Path $errFile) {
  Write-Output ""
  Write-Output "Last error log lines:"
  Get-Content -LiteralPath $errFile -Tail 20
}
