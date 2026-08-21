param(
  [ValidateRange(1, 65535)]
  [int]$Port = 4173,

  [string]$ArchivePath
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

if (-not $ArchivePath) {
  $ArchivePath = Join-Path $projectRoot 'artifacts/specimen-production.zip'
}

if (-not (Test-Path -LiteralPath $ArchivePath -PathType Leaf)) {
  throw "Production archive not found: $ArchivePath. Run 'npm run archive' first."
}

$resolvedArchivePath = (Resolve-Path -LiteralPath $ArchivePath).Path
$temporaryRoot = Join-Path `
  ([System.IO.Path]::GetTempPath()) `
  ("specimen-production-{0}" -f [guid]::NewGuid().ToString('N'))
$siteDirectory = Join-Path $temporaryRoot 'site'
$groupDirectory = Join-Path $siteDirectory 'group-folder'
$siteUrl = "http://127.0.0.1:$Port/group-folder/"
$serverProcess = $null

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

try {
  New-Item -ItemType Directory -Path $groupDirectory -Force | Out-Null
  Expand-Archive -LiteralPath $resolvedArchivePath -DestinationPath $groupDirectory

  $indexPath = Join-Path $groupDirectory 'index.html'
  if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) {
    throw 'The production archive does not contain index.html at its root.'
  }

  $pythonArguments += @(
    '-m',
    'http.server',
    "$Port",
    '--bind',
    '127.0.0.1'
  )

  Write-Host "Serving production archive: $resolvedArchivePath"
  Write-Host "Starting Specimen at $siteUrl"
  Write-Host 'Press Ctrl+C to stop the server.'

  $serverProcess = Start-Process `
    -FilePath $pythonLauncher.Source `
    -ArgumentList $pythonArguments `
    -WorkingDirectory $siteDirectory `
    -NoNewWindow `
    -PassThru

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
  if ($serverProcess) {
    $serverProcess.Refresh()
    if (-not $serverProcess.HasExited) {
      Stop-Process -Id $serverProcess.Id
    }
  }
  Remove-Item -LiteralPath $temporaryRoot -Recurse -Force -ErrorAction SilentlyContinue
}
