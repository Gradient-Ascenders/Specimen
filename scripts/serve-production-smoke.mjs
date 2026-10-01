import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { validateProductionBuild } from './lib/production-build.mjs';

const namespace = '/group-folder/';
const contentTypes = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
};
let temporaryRoot;
let root = resolve('dist');
let server;

try {
  if (process.env.SPECIMEN_SMOKE_ARCHIVE) {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'specimen-smoke-'));
    root = join(temporaryRoot, 'site');
    const result = spawnSync('unzip', [
      '-q', resolve(process.env.SPECIMEN_SMOKE_ARCHIVE), '-d', root,
    ], { encoding: 'utf8', timeout: 30_000 });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Archive extraction failed: ${result.stderr}`);
  }
  await validateProductionBuild(root);

  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (!pathname.startsWith(namespace)) {
        response.writeHead(404).end();
        return;
      }
      const path = resolve(root, pathname.slice(namespace.length) || 'index.html');
      if (!path.startsWith(`${root}${sep}`) || !(await stat(path)).isFile()) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, {
        'Content-Type': contentTypes[extname(path)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      if (request.method === 'HEAD') response.end();
      else createReadStream(path).on('error', () => response.destroy()).pipe(response);
    } catch {
      response.writeHead(404).end();
    }
  });
  server.on('error', async (error) => {
    console.error(error);
    if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
    process.exit(1);
  });
  server.listen(4173, '127.0.0.1', () => {
    console.log(`Serving ${process.env.SPECIMEN_SMOKE_ARCHIVE ?? 'dist/'} at http://127.0.0.1:4173${namespace}`);
  });
  const shutdown = async () => {
    server.close();
    server.closeAllConnections();
    if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
    process.exit(0);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
  process.exitCode = 1;
}
