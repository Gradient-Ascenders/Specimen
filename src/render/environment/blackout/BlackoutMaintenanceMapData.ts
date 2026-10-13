import { BLACKOUT_MATERIAL_FAMILIES, BLACKOUT_MAINTENANCE_FINISHES, type BlackoutMaterialFamily } from './BlackoutMaintenanceFinish.ts';

/** Versioned, lossless RGBA8 bundle. DataTexture orientation is unchanged. */
export const BLACKOUT_MAP_MAGIC = 'SPCBM001';
export const BLACKOUT_MAP_HEADER_BYTES = 8 + BLACKOUT_MATERIAL_FAMILIES.length * 4;
export interface BlackoutMaintenanceMapData {
  readonly maps: Readonly<Record<BlackoutMaterialFamily, readonly [Uint8Array, Uint8Array, Uint8Array]>>;
}

/** O(families), zero-copy views: no per-pixel work or image decoding. */
export function readBlackoutMaintenanceMapData(buffer: ArrayBuffer): BlackoutMaintenanceMapData {
  if (buffer.byteLength < BLACKOUT_MAP_HEADER_BYTES) throw new Error('Truncated Blackout map bundle.');
  const bytes = new Uint8Array(buffer), header = new DataView(buffer);
  for (let i = 0; i < BLACKOUT_MAP_MAGIC.length; i++) {
    if (bytes[i] !== BLACKOUT_MAP_MAGIC.charCodeAt(i)) throw new Error('Unsupported Blackout map bundle version.');
  }
  const maps = {} as Record<BlackoutMaterialFamily, readonly [Uint8Array, Uint8Array, Uint8Array]>;
  let offset = BLACKOUT_MAP_HEADER_BYTES;
  for (const [index, family] of BLACKOUT_MATERIAL_FAMILIES.entries()) {
    const size = BLACKOUT_MAINTENANCE_FINISHES[family].resolution ?? 256;
    if (header.getUint32(8 + index * 4, true) !== size) throw new Error(`Invalid Blackout map size: ${family}.`);
    const length = size * size * 4;
    if (offset + length * 3 > buffer.byteLength) throw new Error(`Truncated Blackout maps: ${family}.`);
    maps[family] = [new Uint8Array(buffer, offset, length), new Uint8Array(buffer, offset + length, length), new Uint8Array(buffer, offset + length * 2, length)];
    offset += length * 3;
  }
  if (offset !== buffer.byteLength) throw new Error('Unexpected trailing Blackout map data.');
  return { maps };
}

/** Native asynchronous decompression finishes before any Room 1 construction.
 * .bin deliberately avoids static hosts treating this file as HTTP gzip encoding.
 * No global cache or GPU allocations: the returned data belongs to one runtime. */
export async function loadBlackoutMaintenanceMapData(url: URL, signal?: AbortSignal): Promise<BlackoutMaintenanceMapData> {
  try {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser does not support native texture decompression.');
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} loading ${url.pathname}`);
    if (!response.body) throw new Error('Empty Blackout map response.');
    const stream = response.body.pipeThrough(new DecompressionStream('gzip'), { signal });
    const buffer = await new Response(stream).arrayBuffer();
    signal?.throwIfAborted();
    return readBlackoutMaintenanceMapData(buffer);
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not prepare Room 1 texture maps: ${detail}`, { cause: error });
  }
}
