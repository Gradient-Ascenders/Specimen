import type { Input } from './Input.ts';

export interface PerformanceRenderSnapshot {
  viewportWidth: number;
  viewportHeight: number;
  drawingBufferWidth: number;
  drawingBufferHeight: number;
  effectiveDpr: number;
  resolutionTier: number;
  graphicsProfile: string;
  graphicsProfileBase: string;
  devicePixelRatio: number;
  renderScale: number;
  pixelBudget: number;
  gelRenderingMode: string;
  transmissionResolutionScale: number;
  shadowMapSizeCap: number;
  effectsDensity: number;
  antialias: boolean;
  lightingPolicy: string;
  graphicsPreset: string;
  requestedPixelRatioCap: number;
  drawCalls: number;
  triangles: number;
  programs: number;
  geometries: number;
  textures: number;
}

export interface PerformanceGameplaySnapshot {
  readonly activePosition: [number,number,number];
  inputEnabled: boolean;
  pointerLocked: boolean;
  inputActive: boolean;
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

export function writePerformanceInput(target: PerformanceGameplaySnapshot, input: Input): void {
  target.inputEnabled = input.enabled;
  target.pointerLocked = input.pointerLocked;
  target.inputActive = input.isDown('moveForward') || input.isDown('moveBackward') ||
    input.isDown('moveLeft') || input.isDown('moveRight') || input.isDown('jump') ||
    input.isDown('fireAbility') || input.isDown('aimAbility') || input.isDown('mountDrone');
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
