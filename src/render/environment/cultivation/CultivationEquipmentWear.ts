import * as THREE from 'three';

function hash(x: number, y: number): number {
  let n = Math.imul(x + 43, 374761393) ^ Math.imul(y + 89, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 0xffffffff;
}

function noise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(hash(ix, iy), hash(ix + 1, iy), sx),
    THREE.MathUtils.lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), sx), sy);
}

/** Four panel variants, plus a smaller armour map shared only by Room 3 drones. */
export function createCultivationEquipmentWear(drone = false) {
  const tile = 256, size = drone ? tile : tile * 2, variants = drone ? 1 : 4;
  const albedo = new Uint8Array(size * size * 4), roughness = new Uint8Array(albedo.length);
  for (let variant = 0; variant < variants; variant++) {
    const scratches = Array.from({ length: drone ? 14 : 9 }, (_, i) => {
      const x = .08 + hash(i, variant) * .8, y = .1 + hash(i + 20, variant) * .8;
      return [x, y, x + .035 + hash(i + 40, variant) * .12, y + (hash(i + 60, variant) - .5) * .08];
    });
    for (let y = 0; y < tile; y++) for (let x = 0; x < tile; x++) {
      const u = x / (tile - 1), v = y / (tile - 1);
      const broad = noise(u * 4 + variant * 13, v * 5 + 3);
      const broken = noise(u * 23 + variant * 7, v * 27);
      const grain = hash(x + variant * tile, y);
      const edge = Math.min(u, 1 - u, v, 1 - v);
      const seam = drone ? 0 : Math.exp(-edge * 42) * (.3 + broken * .7);
      const base = drone ? 0 : Math.exp(-v * 9) * THREE.MathUtils.smoothstep(broad, .3, .8);
      let runoff = 0;
      if (!drone) for (let n = 0; n < 3; n++) {
        const source = .12 + hash(n + 71, variant) * .76;
        const width = .012 + hash(n + 82, variant) * .026;
        const tail = .2 + hash(n + 93, variant) * .5;
        const distance = Math.abs(u - source + (broken - .5) * .012);
        runoff += (1 - THREE.MathUtils.smoothstep(distance, width * .2, width)) *
          THREE.MathUtils.smoothstep(v, tail, tail + .22) * (.3 + broad * .7);
      }
      const haze = THREE.MathUtils.smoothstep(broad * .65 + broken * .35, .52, .82);
      let scratch = 0;
      for (const [ax, ay, bx, by] of scratches) {
        const dx = bx - ax, dy = by - ay;
        const t = THREE.MathUtils.clamp(((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy), 0, 1);
        const distance = Math.hypot(u - ax - t * dx, v - ay - t * dy);
        scratch = Math.max(scratch, (1 - THREE.MathUtils.smoothstep(distance, .001, drone ? .004 : .003)) * (.4 + grain * .6));
      }
      const chip = drone
        ? THREE.MathUtils.smoothstep(broad, .58, .78) * THREE.MathUtils.smoothstep(noise(u * 82, v * 79), .64, .82)
        : seam * THREE.MathUtils.smoothstep(broken + (grain - .5) * .24, .5, .8);
      const grime = Math.min(.8, seam * .32 + base * .36 + runoff * .23 + haze * (drone ? .08 : .2));
      const abrasion = Math.min(.8, scratch * .5 + chip * (drone ? .45 : .65));
      const i = ((y + Math.floor(variant / 2) * tile) * size + x + (variant % 2) * tile) * 4;
      for (let c = 0; c < 3; c++) {
        const residue = [130, 112, 81][c];
        albedo[i + c] = THREE.MathUtils.lerp(249, residue, grime) * (1 - abrasion * .6) + (grain - .5) * 3;
        roughness[i + c] = Math.min(250, 190 + grime * 64 + abrasion * 35 + grain * 6);
      }
      albedo[i + 3] = roughness[i + 3] = 255;
    }
  }
  const texture = (suffix: string, pixels: Uint8Array, color: boolean) => {
    const map = new THREE.DataTexture(pixels, size, size);
    map.name = `cultivation-room-3-${drone ? 'drone-scuffs' : 'equipment-wear'}-${suffix}`;
    map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
    map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true; map.anisotropy = 4; map.needsUpdate = true;
    return map;
  };
  return { albedo: texture('albedo', albedo, true), roughness: texture('roughness', roughness, false) };
}
