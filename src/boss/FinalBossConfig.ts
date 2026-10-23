import * as THREE from 'three';
import { DEFAULT_KINEMATIC_BODY_CONFIG } from '../physics/KinematicBody.ts';
import type { SpecimenAttackConfig } from '../combat/SpecimenProjectileSystem.ts';
import type { BlackoutCheckpointDefinition } from '../levels/BlackoutCheckpointManager.ts';
import type { ContextualCameraProfile } from '../render/CameraProfile.ts';

// Keep the staging corridor joined at z=190; enlarge authored scenery around
// that doorway, baking dimensions into collider geometry rather than scaling it.
export const FINAL_ARENA_SCALE = 100 / 26;
export const finalArenaZ = (authoredZ:number):number => 190 + (authoredZ - 190) * FINAL_ARENA_SCALE;
export const finalArenaY = (authoredY:number):number => .4 + (authoredY - .4) * FINAL_ARENA_SCALE;
export const FINAL_ARENA = Object.freeze({
  centreZ: finalArenaZ(216), radius:100, floorY:.4, ceilingY:96,
  pitFloorY:-520, fallFailureY:-100, cameraFar:850,
});
export const FINAL_ARENA_RING = Object.freeze({innerRadius:62,outerRadius:99.5,radius:82.5,thickness:1.2,segments:96});
export const FINAL_ARENA_ORBIT = Object.freeze({
  enabled:false,
  count:4,radius:55,size:9,thickness:.8,angularSpeed:.255,
  lowY:6,highY:24,liftPeriodSeconds:32,
});
/** Coarse minion flight band; sweeps separately lock the real carrier height. */
export function finalArenaSupportY(feetY:number):number {
  return feetY>=FINAL_ARENA_ORBIT.lowY-.15 ? THREE.MathUtils.clamp(feetY,FINAL_ARENA_ORBIT.lowY,FINAL_ARENA_ORBIT.highY) : FINAL_ARENA.floorY;
}
export const FINAL_BOSS_TUNING = Object.freeze({
  health:200,phaseTwoHealth:100,scale:3,hoverY:18,defenseHoverY:26,
  defenseThresholds:Object.freeze([.85,.70,.55]),healPerSecond:2.5,
  defenseGroups:Object.freeze([Object.freeze([4,4]),Object.freeze([5,5]),Object.freeze([5,5,5])]),
  shieldRadius:28,droneCount:18,droneHealth:6,pursuers:3,
  phaseOneDroneFireSeconds:1.05,phaseTwoDroneFireSeconds:.9,guardianAttackSpeed:1.5,
  droneProjectileSpeed:28,guardianProjectileSpeed:84,pursuerHitboxScale:2,hostileProjectileCapacity:128,
  gunSpeed:164,gunRadius:.25,gunDamage:7,gunVolleySeconds:.16,gunCapacity:96,
  orbSpeed:63,orbRadius:1.25,orbDamage:20,orbCount:3,orbBursts:5,orbIntervalSeconds:.8,orbCapacity:24,
  phaseTwoOrbCount:5,orbSpreadIntervalSeconds:.13,orbSpreadRadians:.095,
  reinforcementHealth:Object.freeze([70,50,20]),advancedGroups:Object.freeze([3,3]),advancedPursuers:2,
  advancedScale:1.8,advancedAttackSpeed:1,advancedProjectileCapacity:64,
  healthPackCapacity:24,healthPackFraction:.25,
  // Keep the thicker beam's lower edge above the ring instead of burying it
  // in the deck and clipping the entire attack at the inner lip of the pit.
  beamHeight:3.4,beamRadius:2.7,beamDamage:40,playerDamageGraceSeconds:.45,
  beamCircles:3,beamLapSeconds:14/3,phaseTwoBeamHalves:5,phaseTwoBeamSpeedMultiplier:1.5,beamTurnSeconds:.8,
  // Wall stopping and cover clearing are independent of solid-model contacts.
  ramDamage:45,ramRadius:8,ramHeight:9,ramCoverRadius:20,
  dodgeDistance:34,dodgeDuration:1.6,dodgeRollSeconds:.48,dodgeLookaheadSeconds:.22,
});
export const FINAL_DRONE_FLIGHT = Object.freeze({
  maximumSpeed:20,maximumAcceleration:28,maximumVerticalSpeed:9,
  pursuitRadius:11,pursuitAngularSpeed:.28,hoverOffset:3.2,
  guardianRadius:36,groupSeparationRadians:1.05,
  collisionRadius:.9,avoidanceSeconds:.3,
});
export const FINAL_SPECIMEN_RADIUS = 1.65;
export const FINAL_SPECIMEN_START_PITCH = -.26;
export const FINAL_SPECIMEN_CAMERA:ContextualCameraProfile=Object.freeze({
  id:'extermination-specimen',playerControlledPitch:true,distanceMetres:12,targetHeightMetres:2,
  pitchRadians:Math.PI/10,transitionDurationSeconds:.65,
  // Keep the elevated focus: a small dead zone would pull it back down toward
  // the body's centre and force the upward-looking boom into the floor.
  framingDeadZoneHalfWidthMetres:.65,framingDeadZoneHalfHeightMetres:2,framingDampingPerSecond:9,
});
export const FINAL_MERGE_ANCHOR = new THREE.Vector3(0, 2.07, FINAL_ARENA.centreZ-FINAL_ARENA_RING.radius);
export const FINAL_SPLIT_ANCHORS = {
  bob: new THREE.Vector3(-2, .87, finalArenaZ(247)), goop: new THREE.Vector3(0, .87, finalArenaZ(247)), volt: new THREE.Vector3(2, .87, finalArenaZ(247)),
};
const bob = DEFAULT_KINEMATIC_BODY_CONFIG;
export const FINAL_SPECIMEN_MOVEMENT = Object.freeze({
  radiusMetres: FINAL_SPECIMEN_RADIUS,
  maxSpeedMetresPerSecond: bob.maxSpeedMetresPerSecond * 3,
  groundAccelerationMetresPerSecondSquared: bob.groundAccelerationMetresPerSecondSquared * 3,
  groundBrakingMetresPerSecondSquared: bob.groundBrakingMetresPerSecondSquared * 3,
  airAccelerationMetresPerSecondSquared: bob.airAccelerationMetresPerSecondSquared * 3,
  gravityMetresPerSecondSquared: bob.gravityMetresPerSecondSquared,
  minimumJumpSpeedMetresPerSecond: bob.minimumJumpSpeedMetresPerSecond,
  // Normal gravity and a normal tap jump. The full-charge height is still
  // required to clear the actual RAM turbines, which a 6.8 m jump hits.
  maximumJumpSpeedMetresPerSecond: Math.sqrt(2 * bob.gravityMetresPerSecondSquared * 11.2),
  maximumJumpChargeSeconds: bob.maximumJumpChargeSeconds / 2,
  slimeHardLandingImpactSpeedMetresPerSecond: bob.slimeHardLandingImpactSpeedMetresPerSecond * 2.5,
  slimeLandingReactionHopSpeedMetresPerSecond: bob.slimeLandingReactionHopSpeedMetresPerSecond,
  adhesionEnabled: false, reboundEnabled: true, chargedJumpEnabled: true,
});
export const FINAL_SPECIMEN_WEAPON: Partial<SpecimenAttackConfig> = Object.freeze({
  fullChargeSeconds: 1.5, minimumCooldownSeconds: .15, maximumCooldownSeconds: .22,
  maximumLiveProjectiles: 32,
  projectileSpeedMetresPerSecond: 50, maximumRangeMetres: 145, projectileLifetimeSeconds: 3.2,
  minimumProjectileRadiusMetres: .18, maximumProjectileRadiusMetres: .7,
  minimumDamageUnits: 2, maximumDamageUnits: 18, maximumSplashRadiusMetres: 14,
  splashRequiresFullCharge: true,
  launchHeightOffsetMetres: .75,
  allowHipFire:true,
  overchargeHitsRequired: 4,
});
/** Re-entry deliberately restores a fresh encounter, not an attack in progress. */
export const FINAL_BOSS_CHECKPOINT: BlackoutCheckpointDefinition = {
  id: 'cp8', activeSlimeId: 'bob', controlledForm: 'specimen',
  bodyPositions: FINAL_SPLIT_ANCHORS, specimenPosition: FINAL_MERGE_ANCHOR,
  specimenClearanceRadius: FINAL_SPECIMEN_RADIUS,
  room: { roomId: 'room-4a', phase: 'specimen', local: { finalBoss: true, merged: true } },
};
/** CP9 is a clean phase-two boundary, not a snapshot of a live attack. */
export const FINAL_BOSS_PHASE_TWO_CHECKPOINT:BlackoutCheckpointDefinition={
  ...FINAL_BOSS_CHECKPOINT,id:'cp9',
  room:{roomId:'room-4b',phase:'boss',local:{finalBoss:true,merged:true,bossPhase:2}},
};
