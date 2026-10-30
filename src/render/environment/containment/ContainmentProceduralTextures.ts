import * as THREE from 'three';
import { CONTAINMENT_SIGNS, type ContainmentSignLabel } from './ContainmentSignContent.ts';
import { SIGNAGE_WIDTH, SIGNAGE_HEIGHT, SIGNAGE_PALETTE, SIGNAGE_RLE_BASE64 } from './signage.generated.ts';
export type { ContainmentSignLabel } from './ContainmentSignContent.ts';

const TEXTURE_SIZE = 64;
const SIGN_ATLAS_WIDTH = 512;

export interface ContainmentSignRegion {
  readonly uMin: number;
  readonly uMax: number;
  readonly vMin: number;
  readonly vMax: number;
}

export interface ContainmentProceduralTextures {
  readonly ceramicNormal: THREE.DataTexture;
  readonly ceramicRoughness: THREE.DataTexture;
  readonly graphiteNormal: THREE.DataTexture;
  readonly graphiteRoughness: THREE.DataTexture;
  readonly stickyNormal: THREE.DataTexture;
  readonly stickyRoughness: THREE.DataTexture;
  readonly stickyVentNormal: THREE.DataTexture;
  readonly stickyVentRoughness: THREE.DataTexture;
  readonly acidFoundationAlbedo: THREE.DataTexture;
  readonly signageAtlas: THREE.DataTexture;
  readonly signRegions: Readonly<Record<ContainmentSignLabel, ContainmentSignRegion>>;
}

type HeightSampler = (x: number, y: number, size: number) => number;
type Rgba = readonly [number, number, number, number];
type Stroke = readonly [number, number, number, number];

/** Deterministic, compact texture set authored entirely in project code. */
export function createContainmentProceduralTextures(): ContainmentProceduralTextures {
  const graphiteHeight: HeightSampler = (x, y, size) =>
    Math.sin((y / size) * Math.PI * 18) * 0.055 +
    (hashNoise(x, y, 53) - 0.5) * 0.04;

  const stickyVentHeight: HeightSampler = (x, y, size) =>
    organicCellHeight(x, y, size, 5, 5, 127) * 0.72 +
    Math.sin((x / size) * Math.PI * 8 + y * 0.12) * 0.035;

  const { ceramicNormal, ceramicRoughness } = createContainmentCeramicTextures();
  const graphiteNormal = normalTexture('containment-graphite-micro-normal', graphiteHeight, 1.15);
  const graphiteRoughness = scalarTexture(
    'containment-graphite-roughness',
    (x, y) => 126 + Math.round((hashNoise(x, y, 67) - 0.5) * 22),
  );
  const { stickyNormal, stickyRoughness } = createContainmentStickyWallTextures();
  const stickyVentNormal = normalTexture(
    'containment-sticky-vent-organic-normal',
    stickyVentHeight,
    2.25,
  );
  const stickyVentRoughness = scalarTexture(
    'containment-sticky-vent-roughness',
    (x, y) => 66 + Math.round(hashNoise(x, y, 151) * 24),
  );
  const acidFoundationAlbedo = createAcidFoundationAlbedo();
  const { texture: signageAtlas, regions: signRegions } = createSignageAtlas();

  return {
    ceramicNormal,
    ceramicRoughness,
    graphiteNormal,
    graphiteRoughness,
    stickyNormal,
    stickyRoughness,
    stickyVentNormal,
    stickyVentRoughness,
    acidFoundationAlbedo,
    signageAtlas,
    signRegions,
  };
}

export function createContainmentStickyWallTextures(): Pick<
  ContainmentProceduralTextures, 'stickyNormal' | 'stickyRoughness'
> {
  const stickyHeight: HeightSampler = (x, y, size) =>
    organicCellHeight(x, y, size, 4, 6, 91);
  const stickyNormal = normalTexture('containment-sticky-organic-normal', stickyHeight, 2.7);
  const stickyRoughness = scalarTexture(
    'containment-sticky-wet-roughness',
    (x, y, size) => 54 + Math.round((1 - stickyHeight(x, y, size)) * 38),
  );
  return { stickyNormal, stickyRoughness };
}

export function createAcidFoundationAlbedo(): THREE.DataTexture {
  const pixels = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const broad =
        Math.sin(x * 0.23 + Math.sin(y * 0.16) * 1.8) * 0.5 +
        Math.sin(y * 0.19 - x * 0.08) * 0.28;
      const fine = (hashNoise(x, y, 211) - 0.5) * 0.14;
      const foamBand = Math.max(
        0,
        1 - Math.abs(Math.sin(x * 0.14 + y * 0.09 + Math.sin(y * 0.2))) * 12,
      );
      const value = THREE.MathUtils.clamp(0.72 + broad * 0.12 + fine + foamBand * 0.13, 0.5, 1);
      const offset = (y * TEXTURE_SIZE + x) * 4;
      pixels[offset] = Math.round(178 * value);
      pixels[offset + 1] = Math.round(216 * value);
      pixels[offset + 2] = Math.round(118 * value);
      pixels[offset + 3] = 255;
    }
  }
  return dataTexture(
    'containment-acid-static-foundation-albedo',
    pixels,
    TEXTURE_SIZE,
    TEXTURE_SIZE,
    true,
    THREE.SRGBColorSpace,
  );
}

function organicCellHeight(
  x: number,
  y: number,
  size: number,
  columns: number,
  rows: number,
  seed: number,
): number {
  const gridX = (x / size) * columns;
  const gridY = (y / size) * rows;
  const baseX = Math.floor(gridX);
  const baseY = Math.floor(gridY);
  let nearest = Number.POSITIVE_INFINITY;
  let second = Number.POSITIVE_INFINITY;
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const cellX = baseX + offsetX;
      const cellY = baseY + offsetY;
      const wrappedX = modulo(cellX, columns);
      const wrappedY = modulo(cellY, rows);
      const pointX = cellX + 0.2 + hashNoise(wrappedX, wrappedY, seed) * 0.6;
      const pointY = cellY + 0.2 + hashNoise(wrappedX, wrappedY, seed + 37) * 0.6;
      const distance = Math.hypot(gridX - pointX, gridY - pointY);
      if (distance < nearest) {
        second = nearest;
        nearest = distance;
      } else if (distance < second) {
        second = distance;
      }
    }
  }
  const softCell = Math.exp(-nearest * nearest * 2.7);
  const organicRidge = THREE.MathUtils.clamp((second - nearest) * 1.7, 0, 1);
  return softCell * 0.72 + organicRidge * 0.18;
}

function normalTexture(
  name: string,
  sampleHeight: HeightSampler,
  strength: number,
): THREE.DataTexture {
  const heights = new Float32Array(TEXTURE_SIZE * TEXTURE_SIZE);
  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      heights[y * TEXTURE_SIZE + x] = sampleHeight(x, y, TEXTURE_SIZE);
    }
  }
  const pixels = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  const heightAt = (x: number, y: number): number =>
    heights[modulo(y, TEXTURE_SIZE) * TEXTURE_SIZE + modulo(x, TEXTURE_SIZE)];
  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const dx = (heightAt(x + 1, y) - heightAt(x - 1, y)) * strength;
      const dy = (heightAt(x, y + 1) - heightAt(x, y - 1)) * strength;
      // Match Vector3.normalize() with scalar arithmetic so the four normal
      // maps do not allocate one short-lived Three.js object per texel.
      const inverseLength = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const normalX = -dx * inverseLength;
      const normalY = -dy * inverseLength;
      const normalZ = inverseLength;
      const offset = (y * TEXTURE_SIZE + x) * 4;
      pixels[offset] = Math.round((normalX * 0.5 + 0.5) * 255);
      pixels[offset + 1] = Math.round((normalY * 0.5 + 0.5) * 255);
      pixels[offset + 2] = Math.round((normalZ * 0.5 + 0.5) * 255);
      pixels[offset + 3] = 255;
    }
  }
  return dataTexture(name, pixels, TEXTURE_SIZE, TEXTURE_SIZE, true);
}

function scalarTexture(
  name: string,
  sample: (x: number, y: number, size: number) => number,
): THREE.DataTexture {
  const pixels = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const value = THREE.MathUtils.clamp(Math.round(sample(x, y, TEXTURE_SIZE)), 0, 255);
      const offset = (y * TEXTURE_SIZE + x) * 4;
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
      pixels[offset + 3] = 255;
    }
  }
  return dataTexture(name, pixels, TEXTURE_SIZE, TEXTURE_SIZE, true);
}

function dataTexture(
  name: string,
  pixels: Uint8Array,
  width: number,
  height: number,
  repeats: boolean,
  colorSpace: THREE.ColorSpace = THREE.NoColorSpace,
): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    pixels,
    width,
    height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.name = name;
  texture.colorSpace = colorSpace;
  texture.wrapS = repeats ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.wrapT = repeats ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

const VECTOR_GLYPHS: Readonly<Record<string, readonly Stroke[]>> = {
  ' ': [],
  '.': [[0.5, 0.86, 0.5, 0.9]],
  ',': [[0.55, 0.82, 0.54, 0.92], [0.54, 0.92, 0.4, 1.03]],
  '!': [[0.5, 0.08, 0.5, 0.67], [0.5, 0.85, 0.5, 0.91]],
  "'": [[0.56, 0.06, 0.56, 0.26]],
  '’': [[0.6, 0.06, 0.57, 0.18], [0.57, 0.18, 0.43, 0.28]],
  '?': [[0.16, 0.24, 0.16, 0.17], [0.16, 0.17, 0.28, 0.08], [0.28, 0.08, 0.74, 0.08],
    [0.74, 0.08, 0.86, 0.2], [0.86, 0.2, 0.86, 0.34], [0.86, 0.34, 0.5, 0.58],
    [0.5, 0.58, 0.5, 0.67], [0.5, 0.85, 0.5, 0.91]],
  '-': [[0.15, 0.52, 0.85, 0.52]],
  ':': [[0.5, 0.3, 0.5, 0.34], [0.5, 0.7, 0.5, 0.74]],
  '0': [[0.2, 0.08, 0.8, 0.08], [0.8, 0.08, 0.92, 0.2], [0.92, 0.2, 0.92, 0.8], [0.92, 0.8, 0.8, 0.92], [0.8, 0.92, 0.2, 0.92], [0.2, 0.92, 0.08, 0.8], [0.08, 0.8, 0.08, 0.2], [0.08, 0.2, 0.2, 0.08], [0.2, 0.82, 0.8, 0.18]],
  '1': [[0.28, 0.24, 0.5, 0.08], [0.5, 0.08, 0.5, 0.92], [0.25, 0.92, 0.78, 0.92]],
  '2': [[0.12, 0.25, 0.28, 0.08], [0.28, 0.08, 0.72, 0.08], [0.72, 0.08, 0.9, 0.25], [0.9, 0.25, 0.12, 0.92], [0.12, 0.92, 0.9, 0.92]],
  '3': [[0.12, 0.2, 0.28, 0.08], [0.28, 0.08, 0.72, 0.08], [0.72, 0.08, 0.9, 0.24], [0.9, 0.24, 0.72, 0.5], [0.72, 0.5, 0.9, 0.7], [0.9, 0.7, 0.72, 0.92], [0.72, 0.92, 0.24, 0.92], [0.24, 0.92, 0.1, 0.8], [0.32, 0.5, 0.72, 0.5]],
  '4': [[0.72, 0.92, 0.72, 0.08], [0.72, 0.08, 0.08, 0.68], [0.08, 0.68, 0.92, 0.68]],
  '5': [[0.88, 0.08, 0.14, 0.08], [0.14, 0.08, 0.14, 0.48], [0.14, 0.48, 0.72, 0.48], [0.72, 0.48, 0.9, 0.66], [0.9, 0.66, 0.72, 0.92], [0.72, 0.92, 0.18, 0.92], [0.18, 0.92, 0.08, 0.82]],
  '6': [[0.86, 0.18, 0.7, 0.08], [0.7, 0.08, 0.28, 0.08], [0.28, 0.08, 0.1, 0.28], [0.1, 0.28, 0.1, 0.76], [0.1, 0.76, 0.28, 0.92], [0.28, 0.92, 0.72, 0.92], [0.72, 0.92, 0.9, 0.76], [0.9, 0.76, 0.9, 0.6], [0.9, 0.6, 0.72, 0.46], [0.72, 0.46, 0.1, 0.46]],
  '8': [[0.24, 0.08, 0.76, 0.08], [0.76, 0.08, 0.9, 0.22], [0.9, 0.22, 0.76, 0.5], [0.76, 0.5, 0.24, 0.5], [0.24, 0.5, 0.1, 0.22], [0.1, 0.22, 0.24, 0.08], [0.24, 0.5, 0.08, 0.72], [0.08, 0.72, 0.24, 0.92], [0.24, 0.92, 0.76, 0.92], [0.76, 0.92, 0.92, 0.72], [0.92, 0.72, 0.76, 0.5]],
  '9': [[0.88, 0.76, 0.72, 0.92], [0.72, 0.92, 0.28, 0.92], [0.28, 0.92, 0.1, 0.75], [0.1, 0.75, 0.1, 0.55], [0.1, 0.55, 0.28, 0.4], [0.28, 0.4, 0.8, 0.4], [0.8, 0.4, 0.9, 0.25], [0.9, 0.25, 0.72, 0.08], [0.72, 0.08, 0.28, 0.08]],
  A: [[0.08, 0.92, 0.5, 0.08], [0.5, 0.08, 0.92, 0.92], [0.25, 0.6, 0.75, 0.6]],
  B: [[0.1, 0.08, 0.1, 0.92], [0.1, 0.08, 0.7, 0.08], [0.7, 0.08, 0.88, 0.24], [0.88, 0.24, 0.7, 0.5], [0.7, 0.5, 0.1, 0.5], [0.7, 0.5, 0.9, 0.68], [0.9, 0.68, 0.72, 0.92], [0.72, 0.92, 0.1, 0.92]],
  C: [[0.88, 0.18, 0.72, 0.08], [0.72, 0.08, 0.24, 0.08], [0.24, 0.08, 0.08, 0.24], [0.08, 0.24, 0.08, 0.76], [0.08, 0.76, 0.24, 0.92], [0.24, 0.92, 0.72, 0.92], [0.72, 0.92, 0.88, 0.82]],
  D: [[0.1, 0.08, 0.1, 0.92], [0.1, 0.08, 0.66, 0.08], [0.66, 0.08, 0.9, 0.3], [0.9, 0.3, 0.9, 0.7], [0.9, 0.7, 0.66, 0.92], [0.66, 0.92, 0.1, 0.92]],
  E: [[0.88, 0.08, 0.1, 0.08], [0.1, 0.08, 0.1, 0.92], [0.1, 0.5, 0.72, 0.5], [0.1, 0.92, 0.88, 0.92]],
  F: [[0.88, 0.08, 0.1, 0.08], [0.1, 0.08, 0.1, 0.92], [0.1, 0.5, 0.72, 0.5]],
  G: [[0.88, 0.18, 0.72, 0.08], [0.72, 0.08, 0.24, 0.08], [0.24, 0.08, 0.08, 0.24], [0.08, 0.24, 0.08, 0.76], [0.08, 0.76, 0.24, 0.92], [0.24, 0.92, 0.76, 0.92], [0.76, 0.92, 0.9, 0.78], [0.9, 0.78, 0.9, 0.55], [0.9, 0.55, 0.55, 0.55]],
  H: [[0.1, 0.08, 0.1, 0.92], [0.9, 0.08, 0.9, 0.92], [0.1, 0.5, 0.9, 0.5]],
  I: [[0.18, 0.08, 0.82, 0.08], [0.5, 0.08, 0.5, 0.92], [0.18, 0.92, 0.82, 0.92]],
  J: [[0.24, 0.08, 0.9, 0.08], [0.72, 0.08, 0.72, 0.74], [0.72, 0.74, 0.54, 0.92],
    [0.54, 0.92, 0.24, 0.92], [0.24, 0.92, 0.08, 0.76], [0.08, 0.76, 0.08, 0.65]],
  K: [[0.1, 0.08, 0.1, 0.92], [0.9, 0.08, 0.1, 0.58], [0.35, 0.46, 0.92, 0.92]],
  L: [[0.1, 0.08, 0.1, 0.92], [0.1, 0.92, 0.88, 0.92]],
  M: [[0.08, 0.92, 0.08, 0.08], [0.08, 0.08, 0.5, 0.5], [0.5, 0.5, 0.92, 0.08], [0.92, 0.08, 0.92, 0.92]],
  N: [[0.1, 0.92, 0.1, 0.08], [0.1, 0.08, 0.9, 0.92], [0.9, 0.92, 0.9, 0.08]],
  O: [[0.24, 0.08, 0.76, 0.08], [0.76, 0.08, 0.92, 0.24], [0.92, 0.24, 0.92, 0.76], [0.92, 0.76, 0.76, 0.92], [0.76, 0.92, 0.24, 0.92], [0.24, 0.92, 0.08, 0.76], [0.08, 0.76, 0.08, 0.24], [0.08, 0.24, 0.24, 0.08]],
  P: [[0.1, 0.92, 0.1, 0.08], [0.1, 0.08, 0.72, 0.08], [0.72, 0.08, 0.9, 0.25], [0.9, 0.25, 0.72, 0.5], [0.72, 0.5, 0.1, 0.5]],
  Q: [[0.24, 0.08, 0.76, 0.08], [0.76, 0.08, 0.92, 0.24], [0.92, 0.24, 0.92, 0.76], [0.92, 0.76, 0.76, 0.92], [0.76, 0.92, 0.24, 0.92], [0.24, 0.92, 0.08, 0.76], [0.08, 0.76, 0.08, 0.24], [0.08, 0.24, 0.24, 0.08], [0.58, 0.64, 0.96, 1]],
  R: [[0.1, 0.92, 0.1, 0.08], [0.1, 0.08, 0.72, 0.08], [0.72, 0.08, 0.9, 0.25], [0.9, 0.25, 0.72, 0.5], [0.72, 0.5, 0.1, 0.5], [0.58, 0.5, 0.92, 0.92]],
  S: [[0.88, 0.18, 0.72, 0.08], [0.72, 0.08, 0.24, 0.08], [0.24, 0.08, 0.08, 0.28], [0.08, 0.28, 0.24, 0.5], [0.24, 0.5, 0.74, 0.5], [0.74, 0.5, 0.92, 0.7], [0.92, 0.7, 0.76, 0.92], [0.76, 0.92, 0.2, 0.92], [0.2, 0.92, 0.08, 0.82]],
  T: [[0.06, 0.08, 0.94, 0.08], [0.5, 0.08, 0.5, 0.92]],
  U: [[0.08, 0.08, 0.08, 0.74], [0.08, 0.74, 0.26, 0.92], [0.26, 0.92, 0.74, 0.92], [0.74, 0.92, 0.92, 0.74], [0.92, 0.74, 0.92, 0.08]],
  V: [[0.08, 0.08, 0.5, 0.92], [0.5, 0.92, 0.92, 0.08]],
  W: [[0.06, 0.08, 0.22, 0.92], [0.22, 0.92, 0.5, 0.5], [0.5, 0.5, 0.78, 0.92], [0.78, 0.92, 0.94, 0.08]],
  X: [[0.08, 0.08, 0.92, 0.92], [0.92, 0.08, 0.08, 0.92]],
  Y: [[0.08, 0.08, 0.5, 0.5], [0.92, 0.08, 0.5, 0.5], [0.5, 0.5, 0.5, 0.92]],
  Z: [[0.08, 0.08, 0.92, 0.08], [0.92, 0.08, 0.08, 0.92], [0.08, 0.92, 0.92, 0.92]],
};

function createSignageAtlas(): {
  readonly texture: THREE.DataTexture;
  readonly regions: Readonly<Record<ContainmentSignLabel, ContainmentSignRegion>>;
} {
  // Baked from the same bundled Michroma font as the title. Decode once per
  // resource owner; no browser font readiness, canvas, or per-frame allocation.
  const encoded = atob(SIGNAGE_RLE_BASE64);
  const pixels = new Uint8Array(SIGNAGE_WIDTH * SIGNAGE_HEIGHT * 4);
  let offset = 0;
  for (let i = 0; i < encoded.length; i += 3) {
    const count = encoded.charCodeAt(i) | (encoded.charCodeAt(i + 1) << 8);
    const [r, g, b] = SIGNAGE_PALETTE[encoded.charCodeAt(i + 2)];
    for (let end = offset + count * 4; offset < end; offset += 4) {
      pixels[offset] = r; pixels[offset + 1] = g; pixels[offset + 2] = b; pixels[offset + 3] = 255;
    }
  }
  const texture = dataTexture('containment-michroma-signage-atlas', pixels,
    SIGNAGE_WIDTH, SIGNAGE_HEIGHT, false, THREE.SRGBColorSpace);
  // Three.js clamps this to the device maximum. Mipmaps keep distant signs stable.
  texture.anisotropy = 8;
  const regions = Object.fromEntries(
    CONTAINMENT_SIGNS.map(([key], row) => [
      key,
      {
        uMin: 0,
        uMax: 1,
        vMin: row / CONTAINMENT_SIGNS.length,
        vMax: (row + 1) / CONTAINMENT_SIGNS.length,
      },
    ]),
  ) as Record<ContainmentSignLabel, ContainmentSignRegion>;
  return { texture, regions };
}

export const CONTAINMENT_IDENTIFICATION_COLOURS = Object.freeze({
  unknown: 0x70b9f1, low: 0x75d595, critical: 0xee706b,
});

/** Small, static identification plate using the same vector lettering as room signs. */
export function createContainmentSpecimenLabelTexture(specimen: string, threat: string): THREE.DataTexture {
  const width = SIGN_ATLAS_WIDTH, height = 192;
  const pixels = new Uint8Array(width * height * 4);
  const { lines, hex } = paintSpecimenIdentification(pixels, specimen, threat);
  const texture = dataTexture('containment-specimen-identification-plate', pixels, width, height,
    false, THREE.SRGBColorSpace);
  texture.userData.labelLines = lines;
  texture.userData.statusColour = hex;
  return texture;
}

function paintSpecimenIdentification(pixels: Uint8Array, specimen: string, threat: string, showStatusMarks = true) {
  const width = SIGN_ATLAS_WIDTH, height = 192;
  const lines = [`SPECIMEN: ${specimen.toUpperCase()}`, `DANGER THREAT: ${threat.toUpperCase()}`];
  for (const character of lines.join('')) {
    if (!VECTOR_GLYPHS[character]) throw new Error(`Unsupported specimen label character: ${character}`);
  }
  const border: Rgba = [57, 88, 94, 255], background: Rgba = [12, 24, 29, 255];
  const primary: Rgba = [222, 239, 235, 255];
  const hex = threat.toUpperCase() === 'UNKNOWN' ? CONTAINMENT_IDENTIFICATION_COLOURS.unknown
    : threat.toUpperCase() === 'LOW' ? CONTAINMENT_IDENTIFICATION_COLOURS.low
    : threat.toUpperCase() === 'CRITICAL' ? CONTAINMENT_IDENTIFICATION_COLOURS.critical : 0xe3b566;
  const accent: Rgba = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255, 255];
  fillRect(pixels, 0, 0, width, height, border);
  fillRect(pixels, 3, 3, width - 6, height - 6, background);
  if (showStatusMarks) fillRect(pixels, 14, 20, 4, height - 40, accent);
  fillRect(pixels, 36, 99, 440, 1, border);
  if (showStatusMarks) fillRect(pixels, 476, 30, 7, 7, accent);
  drawVectorTextFit(pixels, lines[0], 36, 30, 430, 44, primary, 4.2);
  drawVectorTextFit(pixels, lines[1], 36, 124, 444, 25, accent, 2.5);
  return { lines, hex };
}

/** Pixel rectangles in the small, Room 5-owned security atlas (top-down rows). */
export const CONTAINMENT_SECURITY_REGIONS = Object.freeze({
  identification: [0, 0, 512, 192],
  hazard: [0, 192, 512, 192],
  warningIcon: [0, 192, 128, 128],
  release: [0, 384, 512, 64],
  caution: [0, 448, 512, 64],
} as const);

/** Static identification, hazard pictogram and caution tape share one 1 MiB texture. */
export function createContainmentSecurityAtlas(specimen: string): THREE.DataTexture {
  const pixels = new Uint8Array(512 * 512 * 4);
  const { lines, hex } = paintSpecimenIdentification(pixels, specimen, 'CRITICAL', false);
  const dark: Rgba = [14, 20, 23, 255], amber: Rgba = [235, 178, 68, 255];
  const red: Rgba = [238, 112, 107, 255], white: Rgba = [224, 233, 231, 255];
  fillRect(pixels, 0, 192, 512, 256, dark);
  // Recognisable, high-contrast warning triangle. No external font/image request.
  for (const [x1, y1, x2, y2] of [[64, 206, 12, 302], [12, 302, 116, 302], [116, 302, 64, 206]]) {
    drawAntialiasedSegment(pixels, x1, y1, x2, y2, 7, amber);
  }
  drawAntialiasedSegment(pixels, 64, 241, 64, 269, 8, amber);
  fillRect(pixels, 60, 281, 8, 8, amber);
  const hazardLines = ['CORROSIVE', 'BIOLOGICAL HAZARD', 'DO NOT OPEN'];
  drawVectorTextFit(pixels, hazardLines[0], 144, 212, 346, 31, amber, 3);
  drawVectorTextFit(pixels, hazardLines[1], 144, 263, 346, 22, white, 2);
  drawVectorTextFit(pixels, hazardLines[2], 37, 337, 438, 23, red, 2.5);
  drawVectorTextFit(pixels, 'REMOTE RELEASE ONLY', 35, 407, 450, 23, white, 2.4);
  for (let y = 448; y < 512; y++) for (let x = 0; x < 512; x++) {
    const colour = (Math.floor((x + y - 448) / 36) % 2 === 0) ? amber : dark;
    const offset = (y * 512 + x) * 4;
    pixels.set(colour, offset);
  }
  const texture = dataTexture('room-5-goop-critical-security-atlas', pixels, 512, 512,
    false, THREE.SRGBColorSpace);
  // Independent atlas tiles must not blend together in generated lower mip levels.
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.userData.labelLines = lines;
  texture.userData.statusColour = hex;
  texture.userData.hazardLines = hazardLines;
  return texture;
}

/** One static atlas for the opening's experiment doors, using our vector font. */
export function createContainmentExperimentDirectoryTexture(
  entries: readonly { readonly code: string; readonly specimen: string; readonly threat: string; readonly colour: number }[],
): THREE.DataTexture {
  if (entries.length < 1 || entries.length > 8) throw new RangeError('The experiment directory supports one to eight entries.');
  const width = SIGN_ATLAS_WIDTH, rowHeight = 128;
  const height = 2 ** Math.ceil(Math.log2(entries.length * rowHeight));
  const pixels = new Uint8Array(width * height * 4);
  const background: Rgba = [10, 20, 25, 255], border: Rgba = [47, 72, 80, 255];
  const primary: Rgba = [224, 237, 236, 255], secondary: Rgba = [126, 157, 166, 255];
  const lines = entries.map(entry => [entry.code.toUpperCase(), `EXPERIMENT: ${entry.specimen.toUpperCase()}`,
    `DANGER: ${entry.threat.toUpperCase()}`]);
  lines.forEach((row, index) => {
    for (const character of row.join('')) {
      if (!VECTOR_GLYPHS[character]) throw new Error(`Unsupported experiment label character: ${character}`);
    }
    const y = index * rowHeight, hex = entries[index].colour;
    const accent: Rgba = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255, 255];
    fillRect(pixels, 0, y, width, rowHeight, border);
    fillRect(pixels, 3, y + 3, width - 6, rowHeight - 6, background);
    fillRect(pixels, 13, y + 14, 4, rowHeight - 28, accent);
    drawVectorTextFit(pixels, row[0], 32, y + 13, 440, 15, secondary, 1.9);
    drawVectorTextFit(pixels, row[1], 32, y + 40, 452, 27, primary, 3.1);
    drawVectorTextFit(pixels, row[2], 32, y + 89, 452, 21, accent, 2.3);
  });
  const texture = dataTexture('opening-experiment-directory-atlas', pixels, width, height, false, THREE.SRGBColorSpace);
  texture.userData.directoryLines = lines;
  texture.userData.rowHeight = rowHeight;
  return texture;
}

/** One reusable, unlit screen; no canvas, font requests or per-letter textures. */
export function createContainmentMonitorTexture(): THREE.DataTexture {
  const texture = dataTexture('room-1-observation-monitor-screen', new Uint8Array(512 * 256 * 4),
    512, 256, false, THREE.SRGBColorSpace);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  paintContainmentMonitorTexture(texture, '', false);
  return texture;
}

export const MONITOR_TEXT_COLOURS = Object.freeze({
  green: [112, 232, 151, 255], red: [245, 112, 112, 255],
} as const);
export type MonitorTextColour = keyof typeof MONITOR_TEXT_COLOURS;

export function paintContainmentMonitorTexture(texture: THREE.DataTexture, text: string, typing: boolean,
  colour: MonitorTextColour = 'green'): void {
  const pixels = texture.image.data as Uint8Array;
  const background: Rgba = [7, 17, 23, 255], accent: Rgba = [101, 166, 182, 255];
  fillRect(pixels, 0, 0, 512, 256, background);
  // Restrained baked scanlines and a recessed border, not a fullscreen effect.
  for (let y = 2; y < 256; y += 4) fillRect(pixels, 0, y, 512, 1, [8, 20, 27, 255]);
  fillRect(pixels, 12, 12, 488, 2, [28, 58, 69, 255]);
  fillRect(pixels, 12, 242, 488, 2, [28, 58, 69, 255]);
  fillRect(pixels, 12, 14, 2, 228, [28, 58, 69, 255]);
  fillRect(pixels, 498, 14, 2, 228, [28, 58, 69, 255]);
  drawVectorTextFit(pixels, 'OBSERVATION : SP-01', 28, 25, 430, 15, accent, 1.7);
  fillRect(pixels, 28, 55, 456, 1, [34, 64, 75, 255]);
  fillRect(pixels, 475, 28, 6, 6, [111, 194, 165, 255]);
  const lines = text.split('\n'), textColour = MONITOR_TEXT_COLOURS[colour];
  lines.forEach((line, index) => {
    drawVectorTextFit(pixels, line, 28, 84 + index * 42, 446, 30, textColour, 2.4);
  });
  if (typing) {
    const last = lines.length - 1;
    fillRect(pixels, Math.round(28 + lines[last].length * 30 * .76), 112 + last * 42, 15, 3, textColour);
  }
  drawVectorTextFit(pixels, 'CONTAINMENT LINK', 28, 221, 360, 10, [70, 112, 125, 255], 1.1);
  texture.needsUpdate = true;
}

/** Small transparent control label, using the same font without another download. */
export function createFacilityLabelTexture(text:string):THREE.DataTexture{
  const pixels=new Uint8Array(256*64*4),height=40;
  const natural=Math.max(1,text.length*.76-.14)*height;
  drawVectorTextFit(pixels,text,Math.max(8,(256-natural)/2),12,240,height,[255,255,255,255],2.4,256);
  const texture=dataTexture('facility-control-label',pixels,256,64,false,THREE.SRGBColorSpace);
  texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;return texture;
}

/** Compact world-space speech balloon, sharing the monitor's vector lettering. */
export function createContainmentSpeechTexture(): THREE.DataTexture {
  const texture = dataTexture('room-5-goop-speech', new Uint8Array(512 * 256 * 4),
    512, 256, false, THREE.SRGBColorSpace);
  texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter;
  paintContainmentSpeechTexture(texture, '', false, 0);
  return texture;
}

export function paintContainmentSpeechTexture(texture: THREE.DataTexture, text: string,
  typing: boolean, sectionIndex: number, sectionCount = 4, speaker: 'goop' | 'volt' = 'goop'): void {
  const pixels = texture.image.data as Uint8Array;
  const volt = speaker === 'volt';
  const accent: Rgba = volt ? [255, 225, 107, 255] : [179, 230, 116, 255];
  const border: Rgba = volt ? [155, 119, 45, 255] : [74, 125, 86, 255];
  const background: Rgba = volt ? [24, 21, 12, 248] : [8, 23, 24, 248];
  const primary: Rgba = volt ? [255, 249, 221, 255] : [231, 245, 225, 255];
  pixels.fill(0);
  // Tail and chamfered outline are pixels in the same texture, not extra draws.
  for (let y = 205; y < 247; y++) {
    const half = Math.ceil((247 - y) * .5);
    fillRect(pixels, 256 - half, y, half * 2, 1, border);
    if (half > 3) fillRect(pixels, 259 - half, y, half * 2 - 6, 1, background);
  }
  for (let y = 12; y < 210; y++) {
    const cut = Math.max(0, 27 - y, y - 194);
    fillRect(pixels, 12 + cut, y, 488 - cut * 2, 1, border);
    if (y >= 15 && y < 207) {
      const innerCut = Math.max(0, 30 - y, y - 191);
      fillRect(pixels, 15 + innerCut, y, 482 - innerCut * 2, 1, background);
    }
  }
  fillRect(pixels, 242, 204, 28, 9, background);
  fillRect(pixels, 28, 29, 4, 28, accent);
  drawVectorTextFit(pixels, volt ? 'VOLT' : 'GOOP', 44, 29, 220, 23, accent, 2.2);
  drawVectorTextFit(pixels, volt ? 'SP-03' : 'SP-02', 376, 34, 100, 13,
    volt ? border : [117, 155, 136, 255], 1.5);
  if (volt) {
    for (let y = 0; y < 24; y++) {
      const x = y < 12 ? 299 - y : 310 - y;
      fillRect(pixels, x, 28 + y, 9, 1, accent);
    }
    fillRect(pixels, 288, 39, 22, 3, accent);
  }
  fillRect(pixels, 28, 69, 456, 1, border);
  const lines = text.split('\n');
  lines.forEach((line, index) => drawVectorTextFit(pixels, line, 30, 89 + index * 43, 448, 31, primary, 2.5));
  if (typing) {
    const last = lines.length - 1;
    fillRect(pixels, Math.round(30 + lines[last].length * 31 * .76), 120 + last * 43, 13, 3, accent);
  }
  const count=Math.max(1,Math.min(8,sectionCount));
  for (let index = 0; index < count; index++) {
    fillRect(pixels, 398 - (count-4)*21 + index * 21, 187, 14, 4, index <= sectionIndex ? accent : border);
  }
  texture.needsUpdate = true;
}

function drawVectorTextFit(
  pixels: Uint8Array,
  text: string,
  startX: number,
  startY: number,
  maxWidth: number,
  requestedHeight: number,
  colour: Rgba,
  requestedStroke: number,
  pixelWidth = SIGN_ATLAS_WIDTH,
): void {
  const naturalWidth = Math.max(1, text.length * 0.76 - 0.14);
  const height = Math.min(requestedHeight, maxWidth / naturalWidth);
  const glyphWidth = height * 0.62;
  const advance = height * 0.76;
  const strokeWidth = requestedStroke * (height / requestedHeight);
  [...text].forEach((character, index) => {
    const x = startX + index * advance;
    for (const [x1, y1, x2, y2] of VECTOR_GLYPHS[character] ?? []) {
      drawAntialiasedSegment(
        pixels,
        x + x1 * glyphWidth,
        startY + y1 * height,
        x + x2 * glyphWidth,
        startY + y2 * height,
        strokeWidth,
        colour,
        pixelWidth,
      );
    }
  });
}

function drawAntialiasedSegment(
  pixels: Uint8Array,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  colour: Rgba,
  pixelWidth = SIGN_ATLAS_WIDTH,
): void {
  const pixelHeight = pixels.length / (pixelWidth * 4);
  const radius = width * 0.5;
  const minX = Math.floor(Math.min(x1, x2) - radius - 1);
  const maxX = Math.ceil(Math.max(x1, x2) + radius + 1);
  const minY = Math.floor(Math.min(y1, y2) - radius - 1);
  const maxY = Math.ceil(Math.max(y1, y2) + radius + 1);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (x < 0 || x >= pixelWidth || y < 0 || y >= pixelHeight) continue;
      const projection = lengthSquared === 0
        ? 0
        : THREE.MathUtils.clamp(((x - x1) * dx + (y - y1) * dy) / lengthSquared, 0, 1);
      const nearestX = x1 + projection * dx;
      const nearestY = y1 + projection * dy;
      const distance = Math.hypot(x + 0.5 - nearestX, y + 0.5 - nearestY);
      const coverage = THREE.MathUtils.clamp(radius + 0.8 - distance, 0, 1);
      if (coverage <= 0) continue;
      const offset = (y * pixelWidth + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        pixels[offset + channel] = Math.round(
          THREE.MathUtils.lerp(pixels[offset + channel], colour[channel], coverage),
        );
      }
      pixels[offset + 3] = 255;
    }
  }
}

function fillRect(
  pixels: Uint8Array,
  x: number,
  y: number,
  width: number,
  height: number,
  colour: Rgba,
): void {
  const pixelHeight = pixels.length / (SIGN_ATLAS_WIDTH * 4);
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      if (px < 0 || px >= SIGN_ATLAS_WIDTH || py < 0 || py >= pixelHeight) continue;
      const offset = (py * SIGN_ATLAS_WIDTH + px) * 4;
      pixels[offset] = colour[0];
      pixels[offset + 1] = colour[1];
      pixels[offset + 2] = colour[2];
      pixels[offset + 3] = colour[3];
    }
  }
}

function hashNoise(x: number, y: number, seed: number): number {
  let value = Math.imul(x + seed, 374761393) + Math.imul(y - seed, 668265263);
  value = (value ^ (value >>> 13)) * 1274126177;
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

/** Shared Level 1 composite tread microdetail. */
export function createContainmentCeramicTextures() {
  const ceramicHeight: HeightSampler = (x, y) =>
    (hashNoise(x, y, 17) - 0.5) * 0.045 +
    Math.sin((x + y * 0.37) * 0.23) * 0.008;
  const ceramicNormal = normalTexture('containment-ceramic-micro-normal', ceramicHeight, 0.65);
  const ceramicRoughness = scalarTexture(
    'containment-ceramic-roughness',
    (x, y) => 158 + Math.round((hashNoise(x, y, 31) - 0.5) * 10),
  );
  return { ceramicNormal, ceramicRoughness };
}
