param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$PlaywrightArgs
)

$ErrorActionPreference = "Continue"

if (-not $env:PLAYWRIGHT_WEB_PORT) {
  $env:PLAYWRIGHT_WEB_PORT = "3100"
}

if (-not $PlaywrightArgs -or $PlaywrightArgs.Count -eq 0) {
  $PlaywrightArgs = @("--workers=4")
}

try {
  $arguments = @("playwright", "test") + $PlaywrightArgs
  $process = Start-Process -FilePath "npx.cmd" -ArgumentList $arguments -NoNewWindow -Wait -PassThru
  $exitCode = $process.ExitCode
} finally {
  & powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\cleanup-e2e-server.ps1"
}

if ($null -eq $exitCode) {
  $exitCode = 1
}

[System.Environment]::Exit($exitCode)
