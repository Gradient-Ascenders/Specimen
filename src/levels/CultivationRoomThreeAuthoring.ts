import * as THREE from 'three';

import type { CeilingSecurityDroneConfig } from '../hazards/CeilingSecurityDrone.ts';
import type { GroundSecurityDroneConfig } from '../hazards/GroundSecurityDrone.ts';
import type { RoomThreeDroneEncounterConfig } from '../hazards/RoomThreeDroneEncounter.ts';

const DEG = Math.PI / 180;

const commonDrone = {
  scanAxis: new THREE.Vector3(0, 1, 0),
  scanHalfAngleRadians: 35 * DEG,
  scanSpeedRadiansPerSecond: 30 * DEG,
  detectionHalfAngleRadians: 15 * DEG,
  // One unobstructed sentry can pressure almost the full 72 m chamber. Cover,
  // rather than outranging or sidestepping a slow shot, is the intended answer.
  detectionRangeMetres: 90,
  warningSeconds: 0.4,
  fireIntervalSeconds: 0.3,
  targetLossGraceSeconds: 0.3,
  cooldownSeconds: 2.2,
  muzzleAnchor: new THREE.Vector3(0, -0.18, -0.55),
  detectionAnchor: new THREE.Vector3(0, -0.1, -0.5),
} as const;

function ceiling(
  id: string,
  position: THREE.Vector3,
  forward: THREE.Vector3,
  phase: number,
): CeilingSecurityDroneConfig {
  return {
    drone: {
      ...commonDrone,
      id,
      type: 'ceiling',
      initialPosition: position,
      colliderSize: new THREE.Vector3(2.2, 1.35, 2.2),
      forward,
      targetPolicy: 'bob-only',
      initialScanPhase: phase,
    },
    supportTargetId: `${id}-soluble-support-rope`,
    radioactiveImpactPosition: new THREE.Vector3(position.x, 0.62, position.z),
    radioactiveImpactRotation: new THREE.Euler(Math.PI * 0.48, 0.12, -0.18),
    hatchPosition: new THREE.Vector3(position.x, 29.55, position.z),
    fallDurationSeconds: 0.65,
    disabledDurationSeconds: 10,
    replacementWarningSeconds: 2,
    reinstallDurationSeconds: 1.75,
  };
}

function ground(
  id: string,
  position: THREE.Vector3,
  phase: number,
): GroundSecurityDroneConfig {
  return {
    drone: {
      ...commonDrone,
      id,
      type: 'ground',
      initialPosition: position,
      colliderSize: new THREE.Vector3(3.6, 1.5, 1.7),
      forward: new THREE.Vector3(0, 0, -1),
      targetPolicy: 'goop-only',
      initialScanPhase: phase,
    },
    rearPushCentreLocal: new THREE.Vector3(0, 0, 1.35),
    rearPushSize: new THREE.Vector3(3.5, 2, 1.4),
    pushIntentDotThreshold: 0.5,
    pushProgressPerSecond: 1.25,
    pushDecayPerSecond: 2,
    tippingDurationSeconds: 0.75,
    radioactiveFinalPosition: new THREE.Vector3(position.x, 0.55, position.z - 2.5),
    radioactiveFinalRotation: new THREE.Euler(Math.PI * 0.5, 0, 0),
  };
}

/** Room 3-local gameplay authoring, parented to the translated greybox room. */
export const CULTIVATION_ROOM_THREE_DRONE_AUTHORING: RoomThreeDroneEncounterConfig = {
  ceilingDrones: [
    ceiling('cultivation-room-3-roof-drone-1', new THREE.Vector3(13, 19.5, 18.5), new THREE.Vector3(1, 4.9, -5.5).normalize(), 0),
    ceiling('cultivation-room-3-roof-drone-2', new THREE.Vector3(-1, 18, 36), new THREE.Vector3(3.5, 5, -6).normalize(), 0.33),
    ceiling('cultivation-room-3-roof-drone-3', new THREE.Vector3(-12, 19, 55.5), new THREE.Vector3(2, 3.3, -7).normalize(), 0.67),
  ],
  groundDrones: [
    ground('cultivation-room-3-ground-drone-1', new THREE.Vector3(-6, 1.1, 68), 0),
    ground('cultivation-room-3-ground-drone-2', new THREE.Vector3(-2, 1.1, 68.7), 0.25),
    ground('cultivation-room-3-ground-drone-3', new THREE.Vector3(2, 1.1, 68.7), 0.5),
    ground('cultivation-room-3-ground-drone-4', new THREE.Vector3(6, 1.1, 68), 0.75),
  ],
};
