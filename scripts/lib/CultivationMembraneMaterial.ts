import * as THREE from 'three';

const SIZE = 512;
function hash(x: number, y: number): number {
  let n = Math.imul(x + 31, 374761393) ^ Math.imul(y + 67, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 0xffffffff;
}
function noise(u: number, v: number, cells: number): number {
  const x = u * cells, y = v * cells, ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const at = (a: number, b: number) => hash(((a % cells) + cells) % cells, ((b % cells) + cells) % cells);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(ix, iy), at(ix + 1, iy), sx),
    THREE.MathUtils.lerp(at(ix, iy + 1), at(ix + 1, iy + 1), sx), sy);
}

export function createCultivationMembraneTextures() {
  const albedo = new Uint8Array(SIZE * SIZE * 4), roughness = new Uint8Array(albedo.length);
  const normal = new Uint8Array(albedo.length), heights = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const u = x / SIZE, v = y / SIZE;
    const broad = noise(u, v, 4), fine = noise(u, v, 64);
    const folds = noise(u + .16 + (broad - .5) * .16,
      v + (noise(u + .31, v, 4) - .5) * .16, 24);
    const vein = 1 - THREE.MathUtils.smoothstep(Math.abs(folds - .5), .025, .11);
    const dried = THREE.MathUtils.smoothstep(broad * .8 + fine * .2, .58, .82) * .65;
    const bloom = THREE.MathUtils.smoothstep(folds, .3, .8);
    const i = (y * SIZE + x) * 4;
    albedo[i] = 85 + bloom * 12 + vein * 6 + dried * 17;
    albedo[i + 1] = 160 + bloom * 17 + vein * 9 - dried * 44;
    albedo[i + 2] = 138 + bloom * 12 + vein * 7 - dried * 40;
    for (let c = 0; c < 3; c++) roughness[i + c] = 151 + dried * 75 - vein * 15;
    albedo[i + 3] = roughness[i + 3] = 255;
    heights[y * SIZE + x] = folds * .4 + vein * .05 + fine * .018 - dried * .05;
  }
  const height = (x: number, y: number) => heights[((y + SIZE) % SIZE) * SIZE + (x + SIZE) % SIZE];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const dx = (height(x + 1, y) - height(x - 1, y)) * 3;
    const dy = (height(x, y + 1) - height(x, y - 1)) * 3;
    const inverse = 1 / Math.sqrt(dx * dx + dy * dy + 1), i = (y * SIZE + x) * 4;
    normal.set([(-dx * inverse * .5 + .5) * 255, (-dy * inverse * .5 + .5) * 255, (inverse * .5 + .5) * 255, 255], i);
  }
  const texture = (role: string, pixels: Uint8Array, color = false) => {
    const map = new THREE.DataTexture(pixels, SIZE, SIZE);
    map.name = `cultivation-aged-membrane-${role}`;
    map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true; map.anisotropy = 4; map.needsUpdate = true;
    return map;
  };
  return { albedo: texture('albedo', albedo, true), roughness: texture('roughness', roughness), normal: texture('normal', normal) };
}
