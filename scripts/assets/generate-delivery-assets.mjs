import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

// Lossless transport only. The GLBs remain the authored source of truth.
const assets = [
  ['environments/containment-room-two/room-two-hall.glb', 'room-two.bin'],
  ['environments/containment-room-three/room-three-laboratory.glb', 'room-three.bin'],
  ['environments/containment-room-four/room-four-lift.glb', 'room-four.bin'],
  ['environments/containment-room-five/room-five-atrium.glb', 'room-five.bin'],
  ['characters/specimen/variants/lightning-only/specimen-lightning-only.glb', 'specimen.bin'],
];
const check = process.argv.includes('--check');
const directory = new URL('../../src/assets/delivery/', import.meta.url);
if (!check) await mkdir(directory, { recursive: true });
const manifest = [];
for (const [source, name] of assets) {
  const bytes = await readFile(new URL('../../assets/' + source, import.meta.url));
  const packed = gzipSync(bytes, { level: 9 });
  const destination = new URL(name, directory);
  if (check) {
    // Validate source equivalence across zlib versions, rather than relying
    // on one machine's choice of equivalent compressed blocks.
    if (!gunzipSync(await readFile(destination)).equals(bytes)) throw Error('Stale delivery asset: ' + name);
  } else await writeFile(destination, packed);
  manifest.push({ source, output: name, sourceBytes: bytes.length,
    sourceSHA256: createHash('sha256').update(bytes).digest('hex') });
  console.log(`${name}: ${bytes.length} -> ${packed.length} bytes${check ? ' verified' : ''}`);
}
const metadata = JSON.stringify(manifest, null, 2) + '\n';
if (check) {
  if (await readFile(new URL('manifest.json', directory), 'utf8') !== metadata) throw Error('Stale delivery manifest');
} else await writeFile(new URL('manifest.json', directory), metadata);
