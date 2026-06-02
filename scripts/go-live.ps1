param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source

Push-Location $ProjectRoot
try {
  if (-not (Test-Path '.env')) {
    throw "Missing .env. Fill DISCORD_TOKEN, DISCORD_CLIENT_ID, and DISCORD_GUILD_ID before go-live."
  }

  & $npm run doctor
  if ($LASTEXITCODE -ne 0) { throw "doctor failed." }

  & $npm run setup:check
  if ($LASTEXITCODE -ne 0) { throw "setup:check failed." }

  & $npm run register
  if ($LASTEXITCODE -ne 0) { throw "register failed." }

  & $npm run channels:verify
  if ($LASTEXITCODE -ne 0) { throw "channels:verify failed. Fix INDEX_CHANNELS or channel permissions." }

  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $ProjectRoot 'scripts\start-bot.ps1') -ProjectRoot $ProjectRoot
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $ProjectRoot 'scripts\status-bot.ps1') -ProjectRoot $ProjectRoot
}
finally {
  Pop-Location
}
