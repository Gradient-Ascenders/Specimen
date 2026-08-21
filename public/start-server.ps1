param(
  [ValidateRange(1, 65535)]
  [int]$Port = 4173
)

$ErrorActionPreference = 'Stop'
$siteDirectory = $PSScriptRoot
$siteUrl = "http://127.0.0.1:$Port/"

$pythonLauncher = Get-Command py -ErrorAction SilentlyContinue
$pythonArguments = @('-3')

if (-not $pythonLauncher) {
  $pythonLauncher = Get-Command python3 -ErrorAction SilentlyContinue
  $pythonArguments = @()
}

if (-not $pythonLauncher) {
  $pythonLauncher = Get-Command python -ErrorAction SilentlyContinue
  $pythonArguments = @()
}

if (-not $pythonLauncher) {
  throw 'Python 3 is required to serve Specimen locally.'
}

$pythonArguments += @(
  '-m',
  'http.server',
  "$Port",
  '--bind',
  '127.0.0.1'
)

Write-Host "Starting Specimen at $siteUrl"
Write-Host 'Press Ctrl+C to stop the server.'

$serverProcess = Start-Process `
  -FilePath $pythonLauncher.Source `
  -ArgumentList $pythonArguments `
  -WorkingDirectory $siteDirectory `
  -NoNewWindow `
  -PassThru

try {
  Start-Sleep -Milliseconds 750
  $serverProcess.Refresh()
  if ($serverProcess.HasExited) {
    throw "The local server exited with code $($serverProcess.ExitCode)."
  }

  if ($env:SPECIMEN_NO_BROWSER -ne '1') {
    Start-Process $siteUrl
  }
  Wait-Process -Id $serverProcess.Id
}
finally {
  $serverProcess.Refresh()
  if (-not $serverProcess.HasExited) {
    Stop-Process -Id $serverProcess.Id
  }
}
