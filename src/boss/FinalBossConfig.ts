import * as THREE from 'three';
import { DEFAULT_KINEMATIC_BODY_CONFIG } from '../physics/KinematicBody.ts';
import type { SpecimenAttackConfig } from '../combat/SpecimenProjectileSystem.ts';
import type { BlackoutCheckpointDefinition } from '../levels/BlackoutCheckpointManager.ts';

export const FINAL_ARENA = Object.freeze({ centreZ: 216, radius: 26, floorY: .4, walkwayY: 3.4, ceilingY: 25 });
export const FINAL_SPECIMEN_RADIUS = 1.65;
export const FINAL_MERGE_ANCHOR = new THREE.Vector3(0, 2.07, 197);
export const FINAL_SPLIT_ANCHORS = {
  bob: new THREE.Vector3(-2, .87, 236), goop: new THREE.Vector3(0, .87, 236), volt: new THREE.Vector3(2, .87, 236),
};
const bob = DEFAULT_KINEMATIC_BODY_CONFIG;
export const FINAL_SPECIMEN_MOVEMENT = Object.freeze({
  radiusMetres: FINAL_SPECIMEN_RADIUS,
  maxSpeedMetresPerSecond: bob.maxSpeedMetresPerSecond * 2.4,
  groundAccelerationMetresPerSecondSquared: bob.groundAccelerationMetresPerSecondSquared * 2.4,
  groundBrakingMetresPerSecondSquared: bob.groundBrakingMetresPerSecondSquared * 2.4,
  airAccelerationMetresPerSecondSquared: bob.airAccelerationMetresPerSecondSquared * 3,
  minimumJumpSpeedMetresPerSecond: bob.minimumJumpSpeedMetresPerSecond * 1.8,
  maximumJumpSpeedMetresPerSecond: bob.maximumJumpSpeedMetresPerSecond * 1.8,
  slimeHardLandingImpactSpeedMetresPerSecond: bob.slimeHardLandingImpactSpeedMetresPerSecond * 1.8,
  slimeLandingReactionHopSpeedMetresPerSecond: bob.slimeLandingReactionHopSpeedMetresPerSecond * 1.8,
  adhesionEnabled: false, reboundEnabled: true, chargedJumpEnabled: true,
});
export const FINAL_SPECIMEN_WEAPON: Partial<SpecimenAttackConfig> = Object.freeze({
  fullChargeSeconds: 1.5, minimumCooldownSeconds: .25, maximumCooldownSeconds: .9,
  projectileSpeedMetresPerSecond: 36, maximumRangeMetres: 90, projectileLifetimeSeconds: 3,
  minimumProjectileRadiusMetres: .18, maximumProjectileRadiusMetres: .7,
  minimumDamageUnits: 3, maximumDamageUnits: 12, maximumSplashRadiusMetres: 6,
  splashRequiresFullCharge: true,
});
/** Re-entry deliberately restores a fresh encounter, not an attack in progress. */
export const FINAL_BOSS_CHECKPOINT: BlackoutCheckpointDefinition = {
  id: 'cp8', activeSlimeId: 'bob', controlledForm: 'specimen',
  bodyPositions: FINAL_SPLIT_ANCHORS, specimenPosition: FINAL_MERGE_ANCHOR,
  specimenClearanceRadius: FINAL_SPECIMEN_RADIUS,
  room: { roomId: 'room-4a', phase: 'specimen', local: { finalBoss: true, merged: true } },
};
