import { readGzipResponse } from '../render/environment/ReadGzipResponse.ts';

export const EXTERMINATION_SURFACES = {
  wall: { size: 1024, tile: [1, 1], color: [198, 204, 199], roughness: .67, seed: 41 },
  floor: { size: 1024, tile: [1, 1], color: [139, 151, 151], roughness: .82, seed: 73 },
  steel: { size: 512, tile: [.5, .5], color: [100, 113, 119], roughness: .48, seed: 113 },
  grate: { size: 512, tile: [1, 1], color: [67, 80, 85], roughness: .74, seed: 151 },
  shaft: { size: 512, tile: [8, 12], color: [57, 72, 76], roughness: .87, seed: 197 },
} as const;
export type ExterminationSurface = keyof typeof EXTERMINATION_SURFACES;
export const EXTERMINATION_MAP_MAGIC = 'SPECEX01';
export const EXTERMINATION_SURFACE_NAMES = Object.keys(EXTERMINATION_SURFACES) as ExterminationSurface[];
export const EXTERMINATION_MAP_HEADER = 8 + EXTERMINATION_SURFACE_NAMES.length * 4;
export interface ExterminationMapData {
  readonly maps: Readonly<Record<ExterminationSurface, readonly [Uint8Array, Uint8Array, Uint8Array]>>;
}

/** Lossless offline-authored albedo, roughness and tangent normals. Zero-copy views. */
export function readExterminationMaps(buffer: ArrayBuffer): ExterminationMapData {
  const bytes = new Uint8Array(buffer), header = new DataView(buffer);
  if (bytes.length < EXTERMINATION_MAP_HEADER || EXTERMINATION_MAP_MAGIC.split('').some((c, i) => bytes[i] !== c.charCodeAt(0))) {
    throw new Error('Invalid Extermination surface bundle.');
  }
  const maps = {} as Record<ExterminationSurface, readonly [Uint8Array, Uint8Array, Uint8Array]>;
  let offset = EXTERMINATION_MAP_HEADER;
  for (const [i, family] of EXTERMINATION_SURFACE_NAMES.entries()) {
    const size = EXTERMINATION_SURFACES[family].size, length = size * size * 4;
    if (header.getUint32(8 + i * 4, true) !== size || offset + 3 * length > bytes.length) throw new Error(`Invalid Extermination maps: ${family}.`);
    maps[family] = [new Uint8Array(buffer, offset, length), new Uint8Array(buffer, offset + length, length), new Uint8Array(buffer, offset + 2 * length, length)];
    offset += 3 * length;
  }
  if (offset !== bytes.length) throw new Error('Trailing Extermination surface data.');
  return { maps };
}

export async function loadExterminationMaps(url: URL, signal: AbortSignal): Promise<ExterminationMapData> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Could not load Extermination surfaces: HTTP ${response.status}.`);
  return readExterminationMaps(await readGzipResponse(response, signal));
}
