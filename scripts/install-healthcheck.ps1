# Register a per-user Scheduled Task that keeps the KELS Curator Bot alive:
#   - at logon (boot/auto-start)
#   - every 5 minutes (self-heal via health-check.ps1)
# No admin elevation needed for a current-user task. Re-run to update (-Force).
# Uninstall: Unregister-ScheduledTask -TaskName 'KELSBotHealthCheck' -Confirm:$false
param(
  [string]$TaskName = 'KELSBotHealthCheck'
)

$script = Join-Path $PSScriptRoot 'health-check.ps1'
if (-not (Test-Path $script)) { throw "Missing health-check.ps1 at $script" }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NonInteractive -NoProfile -ExecutionPolicy Bypass -File `"$script`""

$trigAtLogon = New-ScheduledTaskTrigger -AtLogOn
$trigRepeat  = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes 5) `
  -RepetitionDuration (New-TimeSpan -Days 3650)

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 9) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action `
  -Trigger @($trigAtLogon, $trigRepeat) -Settings $settings -Force | Out-Null

Write-Output "Registered scheduled task '$TaskName' (at logon + every 5 min)."
Write-Output "Health log: $((Resolve-Path (Join-Path $PSScriptRoot '..')).Path)\logs\health.log"
