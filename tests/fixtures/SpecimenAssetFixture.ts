import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { parseSpecimenAsset, SPECIMEN_ASSET_URL } from '../../src/render/specimen/SpecimenAsset.ts';

export async function loadSpecimen() {
  const bytes = gunzipSync(await readFile(new URL(SPECIMEN_ASSET_URL)));
  return parseSpecimenAsset(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}
