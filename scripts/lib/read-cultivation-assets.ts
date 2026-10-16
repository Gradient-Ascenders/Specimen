import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { readCultivationBakedAssets } from '../../src/render/environment/cultivation/CultivationBakedAssets.ts';

const bytes = gunzipSync(await readFile(new URL('../../src/assets/cultivation/authored-assets.bin', import.meta.url)));
export const cultivationAssets = readCultivationBakedAssets(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
