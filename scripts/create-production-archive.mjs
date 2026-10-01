import { spawnSync } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  utimes,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProductionBuild } from './lib/production-build.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildDirectory = join(projectRoot, 'dist');
const artifactDirectory = join(projectRoot, 'artifacts');
const archivePath = join(artifactDirectory, 'specimen-production.zip');
const archiveTimestamp = new Date('1980-01-01T00:00:00.000Z');

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 60_000,
    ...options,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} failed with exit code ${result.status}:\n${result.stderr}`,
    );
  }

  return result.stdout;
};

const main = async () => {
  const buildFiles = await validateProductionBuild(buildDirectory);

  const temporaryRoot = await mkdtemp(join(tmpdir(), 'specimen-archive-'));
  const stagingDirectory = join(temporaryRoot, 'site');
  const temporaryArchive = join(temporaryRoot, basename(archivePath));
  const destinationTemporaryArchive = join(
    artifactDirectory,
    `.${basename(archivePath)}.${process.pid}.tmp`,
  );

  try {
    for (const file of buildFiles) {
      const source = join(buildDirectory, file);
      const destination = join(stagingDirectory, file);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(source, destination);
      await utimes(destination, archiveTimestamp, archiveTimestamp);
    }

    // Use argv rather than stdin: a missing stdin EOF can stall zip -@.
    run('zip', ['-X', '-q', '-nw', temporaryArchive, '--', ...buildFiles], {
      cwd: stagingDirectory,
      env: { ...process.env, TZ: 'UTC' },
    });
    run('unzip', ['-t', temporaryArchive]);

    const archivedFiles = run('unzip', ['-Z1', temporaryArchive])
      .trim()
      .split('\n')
      .filter(Boolean)
      .sort();

    if (JSON.stringify(archivedFiles) !== JSON.stringify(buildFiles)) {
      throw new Error(
        `Archive entries do not match dist/.\nExpected: ${buildFiles.join(', ')}\nActual: ${archivedFiles.join(', ')}`,
      );
    }

    await mkdir(artifactDirectory, { recursive: true });
    await copyFile(temporaryArchive, destinationTemporaryArchive);
    await rm(archivePath, { force: true });
    await rename(destinationTemporaryArchive, archivePath);

    const archiveSize = (await stat(archivePath)).size;
    const archiveSha256 = createHash('sha256')
      .update(await readFile(archivePath))
      .digest('hex');
    console.log(`Created ${relative(projectRoot, archivePath)} (${archiveSize} bytes)`);
    console.log(`SHA-256: ${archiveSha256}`);
    console.log('Validated archive root:');
    for (const file of archivedFiles) console.log(`  ${file}`);
  } finally {
    await rm(destinationTemporaryArchive, { force: true });
    await rm(temporaryRoot, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
