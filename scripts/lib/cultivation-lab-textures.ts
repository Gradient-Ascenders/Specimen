import * as THREE from 'three';

export function generateLabFinish(kind: 'wall' | 'floor' | 'ceiling' | 'metal' | 'duct') {
    const size = kind === 'metal' || kind === 'duct' ? 256 : 512;
    const albedo = new Uint8Array(size * size * 4);
    const relief = new Uint8Array(size * size * 4);
    const rough = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const edge = Math.min(u, 1 - u, v, 1 - v);
      const noise = (((Math.imul(x + 37, 374761393) ^ Math.imul(y + 91, 668265263)) >>> 0) % 997) / 997;
      const metal = kind === 'metal' || kind === 'duct';
      const ductRow = (v * 4) % 1;
      const seam = edge < (metal ? 0.004 : 0.006) ||
        (kind === 'duct' && Math.min(ductRow, 1 - ductRow) < 0.008);
      const rim = edge < 0.013;
      const grime = Math.exp(-edge * 90) * (3 + noise * 5);
      const scratch = !seam && y % 71 === 19 && x % 113 > 25 && x % 113 < 68 ? 7 : 0;
      const brush = metal ? Math.sin(v * Math.PI * 128) * 3 : 0;
      // Ceiling service recess and duct seams are baked, avoiding extra geometry.
      const service = kind === 'ceiling' && u > 0.82 && u < 0.94;
      const louvre = service && Math.floor(v * 28) % 2 === 0;
      const screw = Math.hypot(Math.min(Math.abs(u - 0.035), Math.abs(u - 0.965)),
        Math.min(Math.abs(v - 0.035), Math.abs(v - 0.965))) < 0.004;
      const value = screw ? 120 : seam ? 65 : service ? (louvre ? 103 : 143) : (rim ? 222 : 249) - grime + (noise - 0.5) * 3 + brush - scratch;
      const i = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        albedo[i + channel] = value;
        relief[i + channel] = seam || louvre ? 85 : 180 + (noise - 0.5) * 5 - scratch;
        rough[i + channel] = seam ? 245 : 215 + noise * 25 + Math.min(grime, 10);
      }
      // Tiny warm deposits around exposed metal joints, not widespread rust.
      if (metal && rim && !seam) albedo[i + 2] -= 5;
      albedo[i + 3] = relief[i + 3] = rough[i + 3] = 255;
    }
    const texture = (suffix: string, pixels: Uint8Array, colourMap = false) => {
      const map = new THREE.DataTexture(pixels, size, size);
      map.name = `cultivation-lab-${kind}-${suffix}`;
      map.colorSpace = colourMap ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.magFilter = THREE.LinearFilter;
      map.minFilter = THREE.LinearMipmapLinearFilter;
      map.generateMipmaps = true;
      map.anisotropy = 4;
      map.needsUpdate = true;
      return map;
    };
  return { albedo: texture('albedo', albedo, true), relief: texture('relief', relief), roughness: texture('roughness', rough) };
}
