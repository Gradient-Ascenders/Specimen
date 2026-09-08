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
  scanHalfAngleRadians = commonDrone.scanHalfAngleRadians,
  detectionHalfAngleRadians = 35 * DEG,
  minimumTargetHeightMetres?: number,
): CeilingSecurityDroneConfig {
  return {
    drone: {
      ...commonDrone,
      id,
      type: 'ceiling',
      scanHalfAngleRadians,
      detectionHalfAngleRadians,
      minimumTargetHeightMetres,
      initialPosition: position,
      colliderSize: new THREE.Vector3(2.2, 1.35, 2.2),
      forward,
      targetPolicy: 'bob-only',
      initialScanPhase: phase,
    },
    supportTargetId: `${id}-acid-soluble-support-cable`,
    radioactiveImpactPosition: new THREE.Vector3(position.x, 0.62, position.z),
    radioactiveImpactRotation: new THREE.Euler(Math.PI * 0.48, 0.12, -0.18),
    hatchPosition: new THREE.Vector3(position.x, 29.55, position.z),
    fallDurationSeconds: 0.65,
    // Includes the 2-second cable warning: 13 seconds idle before deployment.
    disabledDurationSeconds: 15,
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
      // The final exposed approach includes the side lanes, not only a narrow
      // cone down the room centre. Machinery still provides physical cover.
      detectionHalfAngleRadians: 80 * DEG,
      initialPosition: position,
      colliderSize: new THREE.Vector3(3.6, 1.5, 1.7),
      forward: new THREE.Vector3(0, 0, -1),
      targetPolicy: 'goop-only',
      initialScanPhase: phase,
    },
    rearPushCentreLocal: new THREE.Vector3(0, 0, 1.35),
    rearPushSize: new THREE.Vector3(4, 2.4, 1.8),
    pushIntentDotThreshold: 0.25,
    pushProgressPerSecond: 2.5,
    pushDecayPerSecond: 1,
    tippingDurationSeconds: 0.75,
    radioactiveFinalPosition: new THREE.Vector3(position.x, 0.55, position.z - 2.5),
    radioactiveFinalRotation: new THREE.Euler(Math.PI * 0.5, 0, 0),
  };
}

/** Room 3-local gameplay authoring, parented to the translated greybox room. */
export const CULTIVATION_ROOM_THREE_DRONE_AUTHORING: RoomThreeDroneEncounterConfig = {
  ceilingDrones: [
    // Watch the wall exits deeper in the room. The vent is behind each
    // sentry's entire scan/acquisition arc, leaving the entrance unobstructed.
    ceiling('cultivation-room-3-roof-drone-1', new THREE.Vector3(13, 24, 18.5), new THREE.Vector3(-17, .7, -1).normalize(), 0, 15 * DEG, 20 * DEG),
    ceiling('cultivation-room-3-roof-drone-2', new THREE.Vector3(-9, 25.3, 32), new THREE.Vector3(-3.44, -0.85, 3).normalize(), 0.33, 90 * DEG, 35 * DEG, 18),
    ceiling('cultivation-room-3-roof-drone-3', new THREE.Vector3(9, 26.8, 52), new THREE.Vector3(-3.5, -0.5, 3.16).normalize(), 0.67),
  ],
  groundDrones: [
    ground('cultivation-room-3-ground-drone-1', new THREE.Vector3(-6, 1.1, 68), 0),
    ground('cultivation-room-3-ground-drone-2', new THREE.Vector3(-2, 1.1, 68.7), 0.25),
    ground('cultivation-room-3-ground-drone-3', new THREE.Vector3(2, 1.1, 68.7), 0.5),
    ground('cultivation-room-3-ground-drone-4', new THREE.Vector3(6, 1.1, 68), 0.75),
  ],
};
