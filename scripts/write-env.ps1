param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$envPath = Join-Path $ProjectRoot '.env'

function Read-Required([string]$Label) {
  do {
    $value = Read-Host $Label
  } while ([string]::IsNullOrWhiteSpace($value))
  return $value.Trim()
}

function Read-SecretText([string]$Label) {
  $secure = Read-Host $Label -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

$token = Read-SecretText 'DISCORD_TOKEN'
$clientId = Read-Required 'DISCORD_CLIENT_ID'
$guildId = Read-Required 'DISCORD_GUILD_ID'

$content = @"
DISCORD_TOKEN=$token
DISCORD_CLIENT_ID=$clientId
DISCORD_GUILD_ID=$guildId
DIGEST_CHANNEL_ID=
DIGEST_CRON_HOUR_LOCAL=9
DIGEST_TIME_ZONE=America/Los_Angeles
INDEX_CHANNELS=job_academic,job_practitioner,cfp-rfp,seminar-resource,academic-resources,study_workshop_bootcamp,conferencepresentations,newsletter,announcement
DATA_DIR=./data
AUTO_BACKFILL_ON_READY=true
AUTO_BACKFILL_LIMIT=50
"@

Set-Content -LiteralPath $envPath -Value $content -Encoding utf8
Write-Output "Wrote .env to $envPath"
Write-Output "Token was stored locally and was not printed."
