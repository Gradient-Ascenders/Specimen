import * as THREE from 'three';

const TEXTURE_SIZE = 64;
const SIGN_ATLAS_WIDTH = 512;
// Keep every vector sign on the approved 64 px row while extending the shared
// atlas for Room 4. Earlier-room signage therefore retains its exact density.
const SIGN_ATLAS_HEIGHT = 960;

export type ContainmentSignLabel =
  | 'bay'
  | 'specimen'
  | 'locked'
  | 'vent'
  | 'chamber'
  | 'ascent'
  | 'roomThree'
  | 'chemical'
  | 'laserArray'
  | 'adhesionTest'
  | 'roomFour'
  | 'serviceOne'
  | 'transferTwo'
  | 'laserCore'
  | 'roomFiveExit';

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
  const ceramicHeight: HeightSampler = (x, y) =>
    (hashNoise(x, y, 17) - 0.5) * 0.045 +
    Math.sin((x + y * 0.37) * 0.23) * 0.008;
  const graphiteHeight: HeightSampler = (x, y, size) =>
    Math.sin((y / size) * Math.PI * 18) * 0.055 +
    (hashNoise(x, y, 53) - 0.5) * 0.04;
  const stickyHeight: HeightSampler = (x, y, size) =>
    organicCellHeight(x, y, size, 4, 6, 91);
  const stickyVentHeight: HeightSampler = (x, y, size) =>
    organicCellHeight(x, y, size, 5, 5, 127) * 0.72 +
    Math.sin((x / size) * Math.PI * 8 + y * 0.12) * 0.035;

  const ceramicNormal = normalTexture('containment-ceramic-micro-normal', ceramicHeight, 0.65);
  const ceramicRoughness = scalarTexture(
    'containment-ceramic-roughness',
    (x, y) => 158 + Math.round((hashNoise(x, y, 31) - 0.5) * 10),
  );
  const graphiteNormal = normalTexture('containment-graphite-micro-normal', graphiteHeight, 1.15);
  const graphiteRoughness = scalarTexture(
    'containment-graphite-roughness',
    (x, y) => 126 + Math.round((hashNoise(x, y, 67) - 0.5) * 22),
  );
  const stickyNormal = normalTexture('containment-sticky-organic-normal', stickyHeight, 2.7);
  const stickyRoughness = scalarTexture(
    'containment-sticky-wet-roughness',
    (x, y, size) => 54 + Math.round((1 - stickyHeight(x, y, size)) * 38),
  );
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

function createAcidFoundationAlbedo(): THREE.DataTexture {
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
      const normal = new THREE.Vector3(-dx, -dy, 1).normalize();
      const offset = (y * TEXTURE_SIZE + x) * 4;
      pixels[offset] = Math.round((normal.x * 0.5 + 0.5) * 255);
      pixels[offset + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
      pixels[offset + 2] = Math.round((normal.z * 0.5 + 0.5) * 255);
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
  '-': [[0.15, 0.52, 0.85, 0.52]],
  '0': [[0.2, 0.08, 0.8, 0.08], [0.8, 0.08, 0.92, 0.2], [0.92, 0.2, 0.92, 0.8], [0.92, 0.8, 0.8, 0.92], [0.8, 0.92, 0.2, 0.92], [0.2, 0.92, 0.08, 0.8], [0.08, 0.8, 0.08, 0.2], [0.08, 0.2, 0.2, 0.08], [0.2, 0.82, 0.8, 0.18]],
  '1': [[0.28, 0.24, 0.5, 0.08], [0.5, 0.08, 0.5, 0.92], [0.25, 0.92, 0.78, 0.92]],
  '2': [[0.12, 0.25, 0.28, 0.08], [0.28, 0.08, 0.72, 0.08], [0.72, 0.08, 0.9, 0.25], [0.9, 0.25, 0.12, 0.92], [0.12, 0.92, 0.9, 0.92]],
  '3': [[0.12, 0.2, 0.28, 0.08], [0.28, 0.08, 0.72, 0.08], [0.72, 0.08, 0.9, 0.24], [0.9, 0.24, 0.72, 0.5], [0.72, 0.5, 0.9, 0.7], [0.9, 0.7, 0.72, 0.92], [0.72, 0.92, 0.24, 0.92], [0.24, 0.92, 0.1, 0.8], [0.32, 0.5, 0.72, 0.5]],
  '4': [[0.72, 0.92, 0.72, 0.08], [0.72, 0.08, 0.08, 0.68], [0.08, 0.68, 0.92, 0.68]],
  '5': [[0.88, 0.08, 0.14, 0.08], [0.14, 0.08, 0.14, 0.48], [0.14, 0.48, 0.72, 0.48], [0.72, 0.48, 0.9, 0.66], [0.9, 0.66, 0.72, 0.92], [0.72, 0.92, 0.18, 0.92], [0.18, 0.92, 0.08, 0.82]],
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
  K: [[0.1, 0.08, 0.1, 0.92], [0.9, 0.08, 0.1, 0.58], [0.35, 0.46, 0.92, 0.92]],
  L: [[0.1, 0.08, 0.1, 0.92], [0.1, 0.92, 0.88, 0.92]],
  M: [[0.08, 0.92, 0.08, 0.08], [0.08, 0.08, 0.5, 0.5], [0.5, 0.5, 0.92, 0.08], [0.92, 0.08, 0.92, 0.92]],
  N: [[0.1, 0.92, 0.1, 0.08], [0.1, 0.08, 0.9, 0.92], [0.9, 0.92, 0.9, 0.08]],
  O: [[0.24, 0.08, 0.76, 0.08], [0.76, 0.08, 0.92, 0.24], [0.92, 0.24, 0.92, 0.76], [0.92, 0.76, 0.76, 0.92], [0.76, 0.92, 0.24, 0.92], [0.24, 0.92, 0.08, 0.76], [0.08, 0.76, 0.08, 0.24], [0.08, 0.24, 0.24, 0.08]],
  P: [[0.1, 0.92, 0.1, 0.08], [0.1, 0.08, 0.72, 0.08], [0.72, 0.08, 0.9, 0.25], [0.9, 0.25, 0.72, 0.5], [0.72, 0.5, 0.1, 0.5]],
  R: [[0.1, 0.92, 0.1, 0.08], [0.1, 0.08, 0.72, 0.08], [0.72, 0.08, 0.9, 0.25], [0.9, 0.25, 0.72, 0.5], [0.72, 0.5, 0.1, 0.5], [0.58, 0.5, 0.92, 0.92]],
  S: [[0.88, 0.18, 0.72, 0.08], [0.72, 0.08, 0.24, 0.08], [0.24, 0.08, 0.08, 0.28], [0.08, 0.28, 0.24, 0.5], [0.24, 0.5, 0.74, 0.5], [0.74, 0.5, 0.92, 0.7], [0.92, 0.7, 0.76, 0.92], [0.76, 0.92, 0.2, 0.92], [0.2, 0.92, 0.08, 0.82]],
  T: [[0.06, 0.08, 0.94, 0.08], [0.5, 0.08, 0.5, 0.92]],
  U: [[0.08, 0.08, 0.08, 0.74], [0.08, 0.74, 0.26, 0.92], [0.26, 0.92, 0.74, 0.92], [0.74, 0.92, 0.92, 0.74], [0.92, 0.74, 0.92, 0.08]],
  V: [[0.08, 0.08, 0.5, 0.92], [0.5, 0.92, 0.92, 0.08]],
  Y: [[0.08, 0.08, 0.5, 0.5], [0.92, 0.08, 0.5, 0.5], [0.5, 0.5, 0.5, 0.92]],
};

function createSignageAtlas(): {
  readonly texture: THREE.DataTexture;
  readonly regions: Readonly<Record<ContainmentSignLabel, ContainmentSignRegion>>;
} {
  const pixels = new Uint8Array(SIGN_ATLAS_WIDTH * SIGN_ATLAS_HEIGHT * 4);
  const signs: readonly [ContainmentSignLabel, string, string, Rgba][] = [
    ['bay', 'C-01', 'BIOLOGICAL CONTAINMENT', [180, 141, 48, 255]],
    ['specimen', 'SP-01', 'SPECIMEN TEST BAY', [83, 137, 135, 255]],
    ['locked', 'LOCKED', 'DOOR C-01', [168, 54, 61, 255]],
    ['vent', 'VENT ACCESS', 'SERVICE ROUTE', [117, 139, 60, 255]],
    ['chamber', 'C-02', 'TRAVERSAL TEST CHAMBER', [83, 137, 135, 255]],
    ['ascent', 'ASCENT 09 M', 'CALIBRATION ROUTE', [180, 141, 48, 255]],
    ['roomThree', 'C-03', 'BIOLOGICAL MATERIAL TESTING', [83, 137, 135, 255]],
    ['chemical', 'CHEMICAL CONTAINMENT', 'AUTHORIZED TEST AREA', [180, 141, 48, 255]],
    ['laserArray', 'LASER ARRAY L-03', 'ALIGNMENT CONTROL', [168, 54, 61, 255]],
    ['adhesionTest', 'ADHESION TEST A03', 'REPLACEABLE MEMBRANE', [83, 137, 135, 255]],
    ['roomFour', 'C-04', 'VERTICAL TRANSFER CORE', [180, 141, 48, 255]],
    ['serviceOne', 'S01  08 M', 'SERVICE LEVEL', [151, 159, 157, 255]],
    ['transferTwo', 'S02  24 M', 'TRANSFER ARRAY', [180, 141, 48, 255]],
    ['laserCore', 'L-04', 'ACTIVE ALIGNMENT ZONE', [168, 54, 61, 255]],
    ['roomFiveExit', 'C-05', 'RESEARCH LAB ACCESS', [83, 137, 135, 255]],
  ];
  const rowHeight = SIGN_ATLAS_HEIGHT / signs.length;
  const background: Rgba = [25, 30, 31, 255];
  const primary: Rgba = [232, 232, 224, 255];
  const secondary: Rgba = [151, 159, 157, 255];

  signs.forEach(([, title, subtitle, accent], row) => {
    const y = row * rowHeight;
    fillRect(pixels, 0, y, SIGN_ATLAS_WIDTH, rowHeight, background);
    fillRect(pixels, 0, y, 7, rowHeight, accent);
    fillRect(pixels, 19, y + 10, 3, 44, accent);
    drawVectorTextFit(pixels, title, 34, y + 6, 448, 29, primary, 3.4);
    drawVectorTextFit(pixels, subtitle, 35, y + 42, 445, 11, secondary, 1.7);
  });

  const texture = dataTexture(
    'containment-vector-signage-atlas',
    pixels,
    SIGN_ATLAS_WIDTH,
    SIGN_ATLAS_HEIGHT,
    false,
    THREE.SRGBColorSpace,
  );
  const regions = Object.fromEntries(
    signs.map(([key], row) => [
      key,
      { uMin: 0, uMax: 1, vMin: row / signs.length, vMax: (row + 1) / signs.length },
    ]),
  ) as Record<ContainmentSignLabel, ContainmentSignRegion>;
  return { texture, regions };
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
): void {
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
      if (x < 0 || x >= SIGN_ATLAS_WIDTH || y < 0 || y >= SIGN_ATLAS_HEIGHT) continue;
      const projection = lengthSquared === 0
        ? 0
        : THREE.MathUtils.clamp(((x - x1) * dx + (y - y1) * dy) / lengthSquared, 0, 1);
      const nearestX = x1 + projection * dx;
      const nearestY = y1 + projection * dy;
      const distance = Math.hypot(x + 0.5 - nearestX, y + 0.5 - nearestY);
      const coverage = THREE.MathUtils.clamp(radius + 0.8 - distance, 0, 1);
      if (coverage <= 0) continue;
      const offset = (y * SIGN_ATLAS_WIDTH + x) * 4;
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
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      if (px < 0 || px >= SIGN_ATLAS_WIDTH || py < 0 || py >= SIGN_ATLAS_HEIGHT) continue;
      pixels.set(colour, (py * SIGN_ATLAS_WIDTH + px) * 4);
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
