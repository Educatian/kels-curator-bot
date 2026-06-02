param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$logDir = Join-Path $ProjectRoot 'logs'
$dataDir = Join-Path $ProjectRoot 'data'
$pidFile = Join-Path $ProjectRoot 'kels-curator-bot.pid'
$logFile = Join-Path $logDir 'bot.log'
$errFile = Join-Path $logDir 'bot.err.log'

New-Item -ItemType Directory -Force -Path $logDir, $dataDir | Out-Null

if (-not (Test-Path (Join-Path $ProjectRoot '.env'))) {
  throw "Missing .env. Copy .env.example to .env and fill Discord credentials first."
}

if (Test-Path $pidFile) {
  $existingPid = Get-Content $pidFile | Select-Object -First 1
  if ($existingPid -and (Get-Process -Id ([int]$existingPid) -ErrorAction SilentlyContinue)) {
    Write-Output "KELS Curator Bot already appears to be running with PID $existingPid."
    exit 0
  }
}

$node = (Get-Command node.exe -ErrorAction Stop).Source
$process = Start-Process -FilePath $node `
  -ArgumentList @('src/index.js') `
  -WorkingDirectory $ProjectRoot `
  -RedirectStandardOutput $logFile `
  -RedirectStandardError $errFile `
  -WindowStyle Hidden `
  -PassThru

Set-Content -LiteralPath $pidFile -Value $process.Id
Write-Output "Started KELS Curator Bot with PID $($process.Id)."
Write-Output "Log: $logFile"
Write-Output "Error log: $errFile"
