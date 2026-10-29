import { spawnSync } from 'node:child_process';

// Use the Windows ZIP implementation when Unix zip/unzip are unavailable.
// Paths travel through environment variables, never interpolated shell code.
export const windowsZip = (operation, archive, directory) => {
  const scripts = {
    create: `$base = (Get-Item -LiteralPath $env:SPECIMEN_ZIP_DIRECTORY).FullName.TrimEnd([char]92, [char]47) + [IO.Path]::DirectorySeparatorChar;
      $zip = [IO.Compression.ZipFile]::Open($env:SPECIMEN_ZIP_ARCHIVE, [IO.Compression.ZipArchiveMode]::Create);
      try {
        foreach ($file in (Get-ChildItem -LiteralPath $base -File -Recurse | Sort-Object FullName)) {
          $name = $file.FullName.Substring($base.Length).Replace([char]92, [char]47);
          $entry = $zip.CreateEntry($name, [IO.Compression.CompressionLevel]::Optimal);
          $entry.LastWriteTime = [DateTimeOffset]$file.LastWriteTime;
          $source = [IO.File]::OpenRead($file.FullName);
          try {
            $destination = $entry.Open();
            try { $source.CopyTo($destination) } finally { $destination.Dispose() }
          } finally { $source.Dispose() }
        }
      } finally { $zip.Dispose() }`,
    list: '$zip = [IO.Compression.ZipFile]::OpenRead($env:SPECIMEN_ZIP_ARCHIVE); try { foreach ($entry in $zip.Entries) { $stream = $entry.Open(); try { $stream.CopyTo([IO.Stream]::Null) } finally { $stream.Dispose() }; $entry.FullName } } finally { $zip.Dispose() }',
    extract: '[IO.Compression.ZipFile]::ExtractToDirectory($env:SPECIMEN_ZIP_ARCHIVE, $env:SPECIMEN_ZIP_DIRECTORY)',
  };
  if (!Object.hasOwn(scripts, operation)) throw new Error(`Unknown ZIP operation: ${operation}`);
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.IO.Compression; Add-Type -AssemblyName System.IO.Compression.FileSystem; ${scripts[operation]}`], {
    encoding: 'utf8', timeout: 60_000, windowsHide: true,
    env: { ...process.env, SPECIMEN_ZIP_ARCHIVE: archive, SPECIMEN_ZIP_DIRECTORY: directory ?? '' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Windows ZIP ${operation} failed: ${result.stderr}`);
  return result.stdout;
};

