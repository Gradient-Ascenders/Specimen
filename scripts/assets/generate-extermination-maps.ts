import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { EXTERMINATION_MAP_HEADER, EXTERMINATION_MAP_MAGIC, EXTERMINATION_SURFACES, EXTERMINATION_SURFACE_NAMES } from '../../src/boss/ExterminationSurfaceMaps.ts';
import { generateExterminationSurface } from '../lib/extermination-surface-generator.ts';

const header = Buffer.alloc(EXTERMINATION_MAP_HEADER); header.write(EXTERMINATION_MAP_MAGIC);
const chunks: Uint8Array[] = [header];
for (const [i, family] of EXTERMINATION_SURFACE_NAMES.entries()) {
  header.writeUInt32LE(EXTERMINATION_SURFACES[family].size, 8 + i * 4);
  chunks.push(...generateExterminationSurface(family));
}
const bundle = gzipSync(Buffer.concat(chunks), { level: 9 }); bundle[9] = 255;
const output = new URL('../../src/assets/blackout/extermination-maps.bin', import.meta.url);
if (process.argv.includes('--check')) {
  if (!bundle.equals(await readFile(output))) throw new Error('Extermination surface bundle is stale. Run node scripts/assets/generate-extermination-maps.ts.');
  console.log(`Extermination surfaces reproduce exactly (${bundle.length} bytes).`);
} else {
  await mkdir(new URL('../../src/assets/blackout/', import.meta.url), { recursive: true });
  await writeFile(output, bundle); console.log(`Wrote Extermination surfaces (${bundle.length} bytes).`);
}
