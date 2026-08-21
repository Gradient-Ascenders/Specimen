import { spawnSync } from 'node:child_process';
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  utimes,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildDirectory = join(projectRoot, 'dist');
const artifactDirectory = join(projectRoot, 'artifacts');
const archivePath = join(artifactDirectory, 'specimen-production.zip');
const archiveTimestamp = new Date('1980-01-01T00:00:00.000Z');
const forbiddenRoots = new Set([
  '.git',
  'dist',
  'node_modules',
  'scripts',
  'src',
]);
const forbiddenFiles = new Set([
  'README.md',
  'package.json',
  'package-lock.json',
  'start-production-server.ps1',
  'start-production-server.sh',
  'start-server.ps1',
  'start-server.sh',
  'tsconfig.json',
  'vite.config.ts',
]);

const toArchivePath = (path) => path.split(sep).join('/');

const collectFiles = async (root, current = root) => {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(root, absolutePath)));
    } else if (entry.isFile()) {
      files.push(toArchivePath(relative(root, absolutePath)));
    } else {
      throw new Error(`Unsupported build entry: ${absolutePath}`);
    }
  }

  return files.sort();
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
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

const validateBuild = async (files) => {
  if (!files.includes('index.html')) {
    throw new Error('dist/index.html is required at the build root.');
  }

  for (const file of files) {
    const [root] = file.split('/');
    if (forbiddenRoots.has(root) || forbiddenFiles.has(file)) {
      throw new Error(`Development-only path found in production build: ${file}`);
    }
  }

  const indexHtml = await readFile(join(buildDirectory, 'index.html'), 'utf8');
  const references = Array.from(
    indexHtml.matchAll(/(?:src|href)=["']([^"']+)["']/g),
    (match) => match[1],
  );
  const rootRelativeReference = references.find((path) => path.startsWith('/'));
  if (rootRelativeReference) {
    throw new Error(
      `Built index.html contains a root-relative reference: ${rootRelativeReference}`,
    );
  }

  const localReferences = references
    .filter((path) => path.startsWith('./'))
    .map((path) => path.slice(2).split(/[?#]/, 1)[0]);

  if (!localReferences.some((path) => path.endsWith('.js'))) {
    throw new Error('Built index.html does not reference a production JavaScript file.');
  }

  if (!localReferences.some((path) => path.endsWith('.css'))) {
    throw new Error('Built index.html does not reference a production stylesheet.');
  }

  for (const referencedPath of localReferences) {
    if (!files.includes(referencedPath)) {
      throw new Error(`Built index.html references a missing file: ${referencedPath}`);
    }
  }
};

const main = async () => {
  await access(buildDirectory, constants.R_OK);

  const buildFiles = await collectFiles(buildDirectory);
  await validateBuild(buildFiles);

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

    run('zip', ['-X', '-q', temporaryArchive, '-@'], {
      cwd: stagingDirectory,
      env: { ...process.env, TZ: 'UTC' },
      input: `${buildFiles.join('\n')}\n`,
    });

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
