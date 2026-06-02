param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$pidFile = Join-Path $ProjectRoot 'kels-curator-bot.pid'

if (-not (Test-Path $pidFile)) {
  Write-Output "No PID file found. KELS Curator Bot is not tracked as running."
  exit 0
}

$botPid = Get-Content $pidFile | Select-Object -First 1
if ($botPid -and (Get-Process -Id ([int]$botPid) -ErrorAction SilentlyContinue)) {
  Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq [int]$botPid } | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
  Stop-Process -Id ([int]$botPid)
  Write-Output "Stopped KELS Curator Bot PID $botPid."
} else {
  Write-Output "PID file existed, but process was not running."
}

Remove-Item -LiteralPath $pidFile -Force
