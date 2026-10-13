import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { BLACKOUT_MATERIAL_FAMILIES, BLACKOUT_MAINTENANCE_FINISHES } from '../src/render/environment/blackout/BlackoutMaintenanceFinish.ts';
import { BLACKOUT_MAP_MAGIC, BLACKOUT_MAP_HEADER_BYTES } from '../src/render/environment/blackout/BlackoutMaintenanceMapData.ts';
import { generateBlackoutMaintenanceMaps } from './lib/blackout-maintenance-generator.ts';

const header = Buffer.alloc(BLACKOUT_MAP_HEADER_BYTES);
header.write(BLACKOUT_MAP_MAGIC);
const chunks: Uint8Array[] = [header];
for (const [index, family] of BLACKOUT_MATERIAL_FAMILIES.entries()) {
  header.writeUInt32LE(BLACKOUT_MAINTENANCE_FINISHES[family].resolution ?? 256, 8 + index * 4);
  chunks.push(...generateBlackoutMaintenanceMaps(family));
}
const bundle = gzipSync(Buffer.concat(chunks), { level: 9 });
// Portable gzip OS marker: Node otherwise writes different bytes on Windows/Linux.
bundle[9] = 255;
const output = new URL('../src/assets/blackout/maintenance-maps.bin', import.meta.url);
if (process.argv.includes('--check')) {
  if (!bundle.equals(await readFile(output))) throw new Error('Blackout map bundle is stale. Run npm run generate:blackout-maps.');
  console.log(`Blackout maps reproduce exactly (${bundle.length} bytes).`);
} else {
  await mkdir(new URL('../src/assets/blackout/', import.meta.url), { recursive: true });
  await writeFile(output, bundle);
  console.log(`Wrote lossless Blackout map bundle (${bundle.length} bytes).`);
}
