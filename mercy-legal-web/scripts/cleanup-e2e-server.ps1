param(
  [int]$Port = $(if ($env:PLAYWRIGHT_WEB_PORT) { [int]$env:PLAYWRIGHT_WEB_PORT } else { 3100 })
)

$ErrorActionPreference = "Stop"

if ($Port -lt 1 -or $Port -gt 65535) {
  Write-Host "Skipping E2E cleanup: invalid port $Port"
  exit 0
}

$connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $connections) {
  Write-Host "No E2E server listening on port $Port."
  exit 0
}

$owningPids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($pidValue in $owningPids) {
  if (-not $pidValue) {
    continue
  }

  $process = $null
  try {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $pidValue" -ErrorAction Stop
  } catch {
    Write-Host "Leaving PID $pidValue untouched; command line could not be inspected."
    continue
  }
  if (-not $process) {
    continue
  }

  $commandLine = [string]$process.CommandLine
  $isMercyWeb = $commandLine -like "*mercy-legal-web*" -or $commandLine -like "*next*"
  $usesPort = $commandLine -like "*$Port*"

  if ($isMercyWeb -and $usesPort) {
    Write-Host "Stopping E2E Next.js server PID $pidValue on port $Port."
    Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue
  } else {
    Write-Host "Leaving PID $pidValue untouched; it does not look like the Mercy E2E Next.js server."
  }
}
