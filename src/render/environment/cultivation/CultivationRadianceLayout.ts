/** Coordinates relative to the authored level root, including both split routes.
 * Separate duct/sewer volumes keep neighbouring rooms from sharing irradiance. */
export const CULTIVATION_RADIANCE_LAYOUT = [
  { name: 'nursery', room: 1, min: [-18, 0, 0], max: [18, 20, 50], grid: [7, 5, 9], capture: [0, 7, 25] },
  { name: 'decontamination', room: 1, min: [-4, 0, 50], max: [4, 6.5, 78], grid: [3, 3, 7], capture: [0, 2, 64] },
  { name: 'testing', room: 2, min: [-19, 0, 78], max: [19, 24, 123], grid: [7, 7, 9], capture: [0, 11, 100] },
  { name: 'filtration', room: 2, min: [-3.5, 0, 123], max: [3.5, 6.5, 151], grid: [3, 3, 7], capture: [0, 2, 137] },
  { name: 'bob-duct', room: 2, min: [7, 18.8, 123], max: [9, 20.9, 151], grid: [3, 3, 7], capture: [8, 19.8, 137] },
  { name: 'pressure-hall', room: 3, min: [-24, 0, 151], max: [24, 30, 227], grid: [9, 7, 11], capture: [0, 15, 188] },
  { name: 'lift-lower', room: 4, min: [-5, -2, 227], max: [5, 16, 242], grid: [3, 5, 5], capture: [0, 4, 237] },
  { name: 'lift-upper', room: 4, min: [-5, 16, 227], max: [5, 44, 242], grid: [3, 7, 5], capture: [0, 26, 237] },
  { name: 'arrival-duct', room: 5, min: [-1.1, 0, 242], max: [1.1, 2.55, 250.5], grid: [3, 3, 5], capture: [0, 1.3, 246] },
  { name: 'service-junction', room: 5, min: [-13.4, 0, 250.5], max: [41.4, 3, 263.3], grid: [11, 3, 5], capture: [12, 1.3, 251.1] },
  { name: 'containment', room: 5, min: [-20, 0, 258], max: [20, 38, 322], grid: [9, 9, 11], capture: [0, 19, 287] },
  { name: 'sewer', room: 5, min: [29, -15, 258], max: [51, -2, 382], grid: [7, 5, 13], capture: [40, -7, 304] },
  { name: 'maintenance-return', room: 5, min: [22.7, -12, 304], max: [30.2, 4.8, 369], grid: [5, 7, 13], capture: [25, -5.2, 335] },
] as const;
export const CULTIVATION_RADIANCE_VERSION = 'SPCR0001';
export const CULTIVATION_CAPTURE_SIZE = [128, 64] as const;
export const CULTIVATION_PROBE_RAYS = 64;
export const CULTIVATION_ATLAS_WIDTH = 11;
export const CULTIVATION_ATLAS_HEIGHT = 36;
export const CULTIVATION_ZONE_DEPTH = CULTIVATION_RADIANCE_LAYOUT.reduce((n, p) => n + p.grid[2] + 2, 0);
export const CULTIVATION_ATLAS_DEPTH = CULTIVATION_ZONE_DEPTH * 2;
export const CULTIVATION_REFLECTION_COLUMNS = 4;
export const CULTIVATION_LIGHTING_TINTS = [[1, .96, .90], [.92, .98, .96], [.88, .94, 1], [.87, .96, .93], [.86, .94, 1], [.91, .95, .91],
  [.80, .88, 1], [.67, .80, 1], [.82, .94, .94], [.82, .94, .94], [.75, .89, 1], [1, .73, .38], [.92, .94, .88]] as const;

/** Same region choice is exercised on the CPU and emitted into the shader. */
export function cultivationRadianceZone(p: { x: number; y: number; z: number }): number {
  if (p.z < 50) return 0;
  if (p.z < 78) return 1;
  if (p.z < 123) return 2;
  if (p.z < 151) return p.y > 12 && p.x > 5 ? 4 : 3;
  if (p.z < 227) return 5;
  if (p.z < 242) return p.y > 16 ? 7 : 6;
  if (p.z > 303 && p.z < 370 && p.x > 22 && p.x < 29.5 && p.y < 7) return 12;
  if (p.x > 29.5 && p.y < -.5) return 11;
  if (p.z < 250.5) return 8;
  if (p.y < 3 && (p.z < 258 || p.x > 22 || p.x < -10)) return 9;
  return 10;
}
