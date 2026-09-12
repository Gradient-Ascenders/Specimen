import * as THREE from 'three';

function hash(x: number, y: number): number {
  let value = Math.imul(x + 71, 374761393) ^ Math.imul(y + 19, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
}

/** Periodic value noise keeps the shared wear atlas seamless. */
function noise(u: number, v: number, cells: number): number {
  const x = u * cells, y = v * cells, ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const sample = (a: number, b: number) => hash(((a % cells) + cells) % cells, ((b % cells) + cells) % cells);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(sample(ix, iy), sample(ix + 1, iy), sx),
    THREE.MathUtils.lerp(sample(ix, iy + 1), sample(ix + 1, iy + 1), sx), sy);
}

/** Built once, borrowed by every deck/pole; no animated shader or extra draw calls. */
export function createCultivationPlatformWear(kind: 'deck' | 'pole') {
  const size = kind === 'deck' ? 512 : 256;
  const albedo = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(albedo.length);
  const clean = kind === 'deck' ? [247, 247, 241] : [83, 89, 87];
  const worn = kind === 'deck' ? [148, 137, 112] : [143, 81, 43];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const broad = noise(u, v, 4), broken = noise(u, v, 16), fine = noise(u, v, 64);
    const grain = hash(x, y);
    const deposit = THREE.MathUtils.smoothstep(broad * .7 + broken * .3, .43, .76);
    const dirt = deposit * (.7 + fine * .3);
    const wet = dirt * THREE.MathUtils.smoothstep(broken, .6, .85);
    // Fine, interrupted drag marks; sparse enough to leave the clean composite visible.
    const scuff = kind === 'deck'
      ? THREE.MathUtils.smoothstep(noise(u, v * 8, 32), .8, .94) * THREE.MathUtils.smoothstep(broken, .55, .8)
      : 0;
    const rust = THREE.MathUtils.smoothstep(broad * .45 + broken * .35 + fine * .2, .43, .7);
    const i = (y * size + x) * 4;
    const amount = kind === 'deck' ? dirt * .6 : rust;
    for (let c = 0; c < 3; c++) {
      albedo[i + c] = THREE.MathUtils.lerp(clean[c], worn[c], amount) - wet * 12 - scuff * 18 + (grain - .5) * 5;
      roughness[i + c] = kind === 'deck' ? 200 + dirt * 45 - wet * 75 : 163 + rust * 82 + grain * 8;
    }
    albedo[i + 3] = roughness[i + 3] = 255;
  }
  const texture = (suffix: string, pixels: Uint8Array, colorSpace: THREE.ColorSpace) => {
    const map = new THREE.DataTexture(pixels, size, size);
    map.name = `cultivation-weathered-${kind}-${suffix}`;
    map.colorSpace = colorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true; map.anisotropy = 4; map.needsUpdate = true;
    return map;
  };
  return {
    albedo: texture('albedo', albedo, THREE.SRGBColorSpace),
    roughness: texture('roughness', roughness, THREE.NoColorSpace),
  };
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
