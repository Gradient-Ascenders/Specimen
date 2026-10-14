/** Offline only: exact issue #162 seeded wear, joints, corrosion and normal data. */
import * as THREE from 'three';
import {BLACKOUT_MAINTENANCE_FINISHES, type BlackoutMaterialFamily} from '../../src/render/environment/blackout/BlackoutMaintenanceFinish.ts';
const fract = (value: number) => value - Math.floor(value);
const mix = THREE.MathUtils.lerp;
const smooth = THREE.MathUtils.smoothstep;

function hash(x: number, y: number, seed: number): number {
  let value = Math.imul(x + seed, 374761393) ^ Math.imul(y + seed * 7, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
}

/** Periodic multi-scale noise, following the existing project-authored wear maps. */
function noise(u: number, v: number, cells: number, seed: number): number {
  const x = u * cells, y = v * cells, ix = Math.floor(x), iy = Math.floor(y);
  const sx = smooth(fract(x), 0, 1), sy = smooth(fract(y), 0, 1);
  const sample = (a: number, b: number) => hash((a % cells + cells) % cells, (b % cells + cells) % cells, seed);
  return mix(mix(sample(ix, iy), sample(ix + 1, iy), sx), mix(sample(ix, iy + 1), sample(ix + 1, iy + 1), sx), sy);
}


export function generateBlackoutMaintenanceMaps(family: BlackoutMaterialFamily): readonly [Uint8Array, Uint8Array, Uint8Array] {
    const finish = BLACKOUT_MAINTENANCE_FINISHES[family];
    const size = finish.resolution ?? 256;
    const albedo = new Uint8Array(size * size * 4), roughness = new Uint8Array(albedo.length);
    const height = new Float32Array(size * size), normal = new Uint8Array(albedo.length);
    const panel = family === 'wallPanel' || family === 'ceilingPanel' || family === 'ductSteel' || family === 'machineryMetal' || family === 'dronePaint';
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size, i = (y * size + x) * 4;
      const broad = noise(u, v, 4, finish.seed), broken = noise(u, v, 16, finish.seed);
      const fine = noise(u, v, 64, finish.seed), grain = hash(x, y, finish.seed);
      const edge = Math.min(u, 1 - u, v, 1 - v);
      const seam = panel ? 1 - smooth(edge, .002, .009) : 0;
      const jointGrime = panel ? (1 - smooth(edge, .008, .07)) * (.4 + broken * .6) : 0;
      const corrosion = smooth(broad * .6 + broken * .3 + fine * .1, family === 'acidPlatform' ? .39 : .49, .74);
      const scratch = smooth(noise(u, v * 8, 32, finish.seed), .75, .91) * smooth(broken, .45, .7);
      const pitting = smooth(grain, .88, 1) * corrosion;
      // Inset panel screws and narrow seams are baked relief, never extra meshes.
      const boltDistance = Math.hypot(Math.min(Math.abs(u - .035), Math.abs(u - .965)), Math.min(Math.abs(v - .035), Math.abs(v - .965)));
      const bolt = panel ? 1 - smooth(boltDistance, .004, .008) : 0;
      const groove = panel && bolt > 0 && Math.abs(v - .035) < .0018 ? .5 : 0;
      // Interrupted diagonal traction ribs, deliberately shallow and low contrast.
      const rib = family === 'floorDeck' ? (1 - smooth(Math.abs(fract((u + v) * 12) - .5), .09, .19)) *
        (1 - smooth(fract((u - v) * 6), .55, .7)) : 0;
      const stripe = family === 'warningPaint' && fract((u + v) * 2) > .5 ? .32 : 1;
      const rust = family === 'acidPlatform' || family === 'basinMetal' ? [42, 34, 21] : [53, 34, 23];
      const chipped = family === 'dronePaint' ? smooth(broken * .6 + fine * .4 + jointGrime * .3, .64, .77) : 0;
      for (let c = 0; c < 3; c++) {
        albedo[i + c] = THREE.MathUtils.clamp((mix(finish.color[c], rust[c], corrosion * .85) * stripe +
          (fine - .5) * 5 + (grain - .5) * 2 + scratch * 7 + rib * 3) * (1 - seam * .62 - jointGrime * .22) - pitting * 4 + bolt * 5, 0, 255);
        roughness[i + c] = THREE.MathUtils.clamp(191 + corrosion * 49 + jointGrime * 12 - scratch * 26 - rib * 12 + fine * 9, 0, 255);
        if (chipped) albedo[i + c] = mix(albedo[i + c], [39, 43, 40][c], chipped);
      }
      // Height is in metres. Corrosion pits stay sub-millimetre; joints ~2 mm.
      height[y * size + x] = -seam * .002 + bolt * .0008 - groove * .001 - pitting * .0007 + fine * .0005 + rib * .001;
      albedo[i + 3] = roughness[i + 3] = 255;
    }
    const sampleHeight = (x: number, y: number) => height[((y + size) % size) * size + (x + size) % size];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = (sampleHeight(x + 1, y) - sampleHeight(x - 1, y)) * size / (2 * finish.tile[0]);
      const dy = (sampleHeight(x, y + 1) - sampleHeight(x, y - 1)) * size / (2 * finish.tile[1]);
      const length = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
      normal[i] = Math.round((.5 - dx / length * .5) * 255);
      normal[i + 1] = Math.round((.5 - dy / length * .5) * 255);
      normal[i + 2] = Math.round((.5 + 1 / length * .5) * 255); normal[i + 3] = 255;
    }
    return [albedo, roughness, normal];
}
