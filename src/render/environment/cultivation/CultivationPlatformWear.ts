import type { CultivationAssetSource } from './CultivationBakedAssets.ts';
import * as THREE from 'three';

function hash(x: number, y: number): number {
  let value = Math.imul(x + 71, 374761393) ^ Math.imul(y + 19, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
}

/** Built once, borrowed by every deck/pole; no animated shader or extra draw calls. */
export function createCultivationPlatformWear(assets: CultivationAssetSource, kind: 'deck' | 'pole') {
  const { albedo, roughness } = assets.textures(`platform-${kind}`);
  return { albedo, roughness };
}

/** Local UVs survive falls and static batching; each deck selects a different atlas region. */
export function mapCultivationPlatformWear(geometry: THREE.BufferGeometry, name: string, spanMetres = 8): void {
  let seed = 0;
  for (const character of name) seed = Math.imul(seed, 31) + character.charCodeAt(0) | 0;
  const angle = hash(seed, 3) * Math.PI * 2, cos = Math.cos(angle), sin = Math.sin(angle);
  const offsetU = hash(seed, 7), offsetV = hash(seed, 11);
  const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
  if (!geometry.getAttribute('uv')) geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(positions.count * 2), 2));
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const nx = Math.abs(normals.getX(i)), ny = Math.abs(normals.getY(i));
    const a = nx > .5 ? z : x, b = ny > .5 ? z : y;
    uv.setXY(i, (a * cos - b * sin) / spanMetres + offsetU, (a * sin + b * cos) / spanMetres + offsetV);
  }
  uv.needsUpdate = true;
}
