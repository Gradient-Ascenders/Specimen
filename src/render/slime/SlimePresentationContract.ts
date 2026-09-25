import type * as THREE from 'three';

export interface Vector3State {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SlimePresentationState {
  velocityWorld: Vector3State;
  surfaceNormalWorld: Vector3State;
  gameplayUpWorld: Vector3State;
  grounded: boolean;
  attached: boolean;
  jumpCharge: number;
  maximumLocomotionSpeedMetresPerSecond: number;
  contactCount: number;
  contactNormalWorld: Vector3State;
  contactSpeedMetresPerSecond: number;
  contactName: string;
  contactSurfaceTag: string;
  landedThisStep: boolean;
}

export type SlimeImpactKind = 'landing' | 'wall' | 'bounce' | 'sticky';

export interface SlimePresentationImpact {
  normalWorld: Vector3State;
  strength: number;
  kind: SlimeImpactKind;
}

export interface SlimePresentationLaunch {
  directionWorld: Vector3State;
  speedMetresPerSecond: number;
  chargeFraction: number;
}

export interface SlimePresentationDiagnostics {
  readonly speed: number;
  readonly locomotionPhase: number;
  readonly grounded: number;
  readonly jumpCharge: number;
  readonly squash: number;
  readonly stretch: number;
  readonly impactStrength: number;
  readonly impactAge: number;
  readonly impactNormalLocal: THREE.Vector3;
  readonly surfaceNormalLocal: THREE.Vector3;
  readonly surfaceTangentLocal: THREE.Vector3;
  readonly moveDirectionLocal: THREE.Vector3;
}
