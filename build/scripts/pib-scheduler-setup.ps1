# =============================================================================
# MICRO 18 — Windows Task Scheduler Setup for PIB Daily Fetch
# =============================================================================
# Creates a Windows scheduled task to run pib-daily-fetch.js daily at 06:00 AM.
#
# Run this script ONCE with Administrator privileges:
#   Right-click PowerShell → Run as Administrator
#   cd d:\bilal-digital-solutions\samjho
#   .\build\scripts\pib-scheduler-setup.ps1
#
# To remove the task:
#   Unregister-ScheduledTask -TaskName "SamjhoPIBDailyFetch" -Confirm:$false
#
# To check task status:
#   Get-ScheduledTask -TaskName "SamjhoPIBDailyFetch" | Format-List
# =============================================================================

$TaskName = "SamjhoPIBDailyFetch"
$ScriptPath = Join-Path $PSScriptRoot "pib-daily-fetch.js"
$NodePath = (Get-Command node -ErrorAction SilentlyContinue).Source

if (-not $NodePath) {
    Write-Host "ERROR: node.exe not found in PATH." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $ScriptPath)) {
    Write-Host "ERROR: Script not found at $ScriptPath" -ForegroundColor Red
    exit 1
}

# Remove existing task if present
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Removing existing task: $TaskName" -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

# Create action: run node with the daily fetch script
$Action = New-ScheduledTaskAction -Execute $NodePath -Argument "`"$ScriptPath`"" -WorkingDirectory (Split-Path $ScriptPath -Parent)

# Create trigger: daily at 06:00 AM
$Trigger = New-ScheduledTaskTrigger -Daily -At "06:00"

# Create settings
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RunOnlyIfNetworkAvailable

# Register the task
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Samjho India: Daily PIB Press Release fetch, categorization, and inbox storage. Runs once per day at 06:00 AM." -Force

Write-Host ""
Write-Host "=== Scheduled Task Created ===" -ForegroundColor Green
Write-Host "Task Name:  $TaskName"
Write-Host "Schedule:   Daily at 06:00 AM"
Write-Host "Script:     $ScriptPath"
Write-Host "Node:       $NodePath"
Write-Host ""
Write-Host "To verify: Get-ScheduledTask -TaskName '$TaskName' | Format-List"
Write-Host "To remove: Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
Write-Host "To run now: Start-ScheduledTask -TaskName '$TaskName'"
Write-Host ""
