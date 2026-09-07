export interface PerformanceRenderSnapshot {
  viewportWidth: number;
  viewportHeight: number;
  drawingBufferWidth: number;
  drawingBufferHeight: number;
  effectiveDpr: number;
  resolutionTier: number;
  drawCalls: number;
  triangles: number;
  programs: number;
  geometries: number;
  textures: number;
}

export interface PerformanceGameplaySnapshot {
  level: string;
  room: string | number;
  gameplayState: string;
  cutsceneState: string;
  activeSlime: string;
  readonly cameraPosition: [number, number, number];
  readonly bobPosition: [number, number, number];
  readonly goopPosition: [number, number, number];
  collisionRegistered: number;
  collisionEligible: number;
  collisionCandidates: number;
  collisionNarrowChecks: number;
}

/** Copy a vector-like value into reusable recorder storage without allocating. */
export const writePerformancePosition = (
  target: [number, number, number],
  source: { readonly x: number; readonly y: number; readonly z: number },
): void => {
  target[0] = source.x;
  target[1] = source.y;
  target[2] = source.z;
};
