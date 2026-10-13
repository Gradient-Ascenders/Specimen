export type BlackoutMaterialFamily = 'wallPanel' | 'ceilingPanel' | 'floorDeck' | 'acidPlatform' | 'basinMetal' | 'warningPaint' | 'ductSteel' | 'machineryMetal' | 'dronePaint';
export type BlackoutDetailFinish = 'circuitBoard' | 'copper' | 'rubber' | 'droneTrim' | 'steel';

interface Finish {
  readonly color: readonly [number, number, number];
  readonly tile: readonly [number, number];
  readonly seed: number;
  readonly metalness: number;
  readonly resolution?: number;
}

export const BLACKOUT_MAINTENANCE_FINISHES: Record<BlackoutMaterialFamily, Finish> = {
  wallPanel: { color: [31, 37, 41], tile: [3, 3], seed: 11, metalness: .32 },
  ceilingPanel: { color: [22, 28, 32], tile: [3, 3], seed: 23, metalness: .3 },
  floorDeck: { color: [48, 53, 51], tile: [1.5, 1.5], seed: 37, metalness: .36 },
  acidPlatform: { color: [43, 49, 35], tile: [2.5, 3.5], seed: 51, metalness: .25 },
  basinMetal: { color: [24, 29, 22], tile: [3, 3], seed: 67, metalness: .18 },
  warningPaint: { color: [119, 91, 31], tile: [1, 1], seed: 79, metalness: .12 },
  ductSteel: { color: [68, 76, 74], tile: [1.5, 1.5], seed: 97, metalness: .52, resolution: 128 },
  machineryMetal: { color: [55, 62, 59], tile: [.6, .6], seed: 113, metalness: .58, resolution: 128 },
  dronePaint: { color: [174, 129, 34], tile: [1.4, 1.4], seed: 131, metalness: .28 },
};

export const BLACKOUT_MATERIAL_FAMILIES = Object.keys(BLACKOUT_MAINTENANCE_FINISHES) as BlackoutMaterialFamily[];
