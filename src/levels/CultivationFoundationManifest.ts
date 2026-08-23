import * as THREE from 'three';

import type { RadioactiveHazardDefinition } from '../hazards/RadioactiveHazardSystem.ts';
import type { SurfaceTag } from '../physics/SurfaceRegistry.ts';
import type { CultivationCheckpointDefinition } from './CultivationCheckpointManager.ts';

export const CULTIVATION_ROOM_ONE_GROUP_ID = 'cultivation-room-1';
export const CULTIVATION_ROOM_TWO_GROUP_ID = 'cultivation-room-2';
export const CULTIVATION_ROOM_THREE_GROUP_ID = 'cultivation-room-3';

export const CULTIVATION_ENTRANCE_CHECKPOINT_ID = 'cultivation-entrance';
export const CULTIVATION_ROOM_TWO_CHECKPOINT_ID = 'cultivation-room-2-entry';
export const CULTIVATION_ROOM_THREE_CHECKPOINT_ID = 'cultivation-room-3-entry';

export interface CultivationTriggerAuthoring {
  readonly id: string;
  readonly role: 'room-2-entry' | 'bob-room-3-entry' | 'goop-room-3-entry';
  readonly centre: THREE.Vector3;
  readonly size: THREE.Vector3;
}

export interface CultivationStructuralAssemblyAuthoring {
  readonly id: string;
  readonly mode: 'drop-to-acid' | 'rope-catch';
  readonly puzzleGroupId: string;
  readonly supportTargetId: string;
  readonly supportRole: 'soluble-rope' | 'soluble-brace';
  readonly supportPosition: THREE.Vector3;
  readonly supportSize: THREE.Vector3;
  readonly initialPosition: THREE.Vector3;
  readonly finalPosition: THREE.Vector3;
  readonly movingSize: THREE.Vector3;
  readonly releaseDelaySeconds: number;
  readonly travelDurationSeconds: number;
  readonly settlingDurationSeconds?: number;
  readonly settlingSwingRadians?: number;
  readonly finalSurfaceTag: SurfaceTag;
}

export interface CultivationFoundationManifest {
  readonly checkpoints: readonly CultivationCheckpointDefinition[];
  readonly triggers: readonly CultivationTriggerAuthoring[];
  readonly radioactiveHazards: readonly RadioactiveHazardDefinition[];
  readonly structuralAssemblies: readonly CultivationStructuralAssemblyAuthoring[];
  readonly outOfBoundsYMetres: number;
}

/**
 * Temporary authored-neutral layout for validating Issue #93's backend.
 * Final room plans should replace these values without changing runtime APIs.
 */
export const CULTIVATION_FOUNDATION_MANIFEST: CultivationFoundationManifest = {
  checkpoints: [
    {
      id: CULTIVATION_ENTRANCE_CHECKPOINT_ID,
      puzzleGroupId: CULTIVATION_ROOM_ONE_GROUP_ID,
      bobSpawnPosition: new THREE.Vector3(-1.5, 0.46, 2),
      goopSpawnPosition: new THREE.Vector3(1.5, 0.46, 2),
      progression: {
        roomId: 'cultivation-room-1',
        bobEnteredRoomThree: false,
        goopEnteredRoomThree: false,
      },
      cameraResetAnchor: new THREE.Vector3(0, 1, 2),
    },
    {
      id: CULTIVATION_ROOM_TWO_CHECKPOINT_ID,
      puzzleGroupId: CULTIVATION_ROOM_TWO_GROUP_ID,
      bobSpawnPosition: new THREE.Vector3(-1.5, 0.46, 14),
      goopSpawnPosition: new THREE.Vector3(1.5, 0.46, 14),
      progression: {
        roomId: 'cultivation-room-2',
        bobEnteredRoomThree: false,
        goopEnteredRoomThree: false,
      },
      cameraResetAnchor: new THREE.Vector3(0, 1, 14),
    },
    {
      id: CULTIVATION_ROOM_THREE_CHECKPOINT_ID,
      puzzleGroupId: CULTIVATION_ROOM_THREE_GROUP_ID,
      bobSpawnPosition: new THREE.Vector3(-2.5, 4.66, 34),
      goopSpawnPosition: new THREE.Vector3(2.5, 0.46, 34),
      progression: {
        roomId: 'cultivation-room-3',
        bobEnteredRoomThree: true,
        goopEnteredRoomThree: true,
      },
      cameraResetAnchor: new THREE.Vector3(0, 2.5, 34),
    },
  ],
  triggers: [
    {
      id: 'cultivation-room-2-entry-trigger',
      role: 'room-2-entry',
      centre: new THREE.Vector3(0, 1, 11),
      size: new THREE.Vector3(14, 3, 2),
    },
    {
      id: 'cultivation-bob-room-3-entry-trigger',
      role: 'bob-room-3-entry',
      centre: new THREE.Vector3(-3.5, 1, 29),
      size: new THREE.Vector3(6, 3, 3),
    },
    {
      id: 'cultivation-goop-room-3-entry-trigger',
      role: 'goop-room-3-entry',
      centre: new THREE.Vector3(3.5, 1, 29),
      size: new THREE.Vector3(6, 3, 3),
    },
  ],
  radioactiveHazards: [
    {
      id: 'cultivation-room-2-radiation',
      centre: new THREE.Vector3(0, 0.55, 21),
      size: new THREE.Vector3(5, 1.1, 4),
    },
  ],
  structuralAssemblies: [
    {
      id: 'cultivation-room-1-drop-platform-1',
      mode: 'drop-to-acid',
      puzzleGroupId: CULTIVATION_ROOM_ONE_GROUP_ID,
      supportTargetId: 'cultivation-room-1-soluble-rope-1',
      supportRole: 'soluble-rope',
      supportPosition: new THREE.Vector3(-3.4, 8.75, 5),
      supportSize: new THREE.Vector3(0.7, 3.5, 0.7),
      initialPosition: new THREE.Vector3(-3.4, 7, 5),
      finalPosition: new THREE.Vector3(-3.4, 0.35, 5),
      movingSize: new THREE.Vector3(2.6, 0.5, 2.6),
      releaseDelaySeconds: 0.08,
      travelDurationSeconds: 0.72,
      finalSurfaceTag: 'default',
    },
    {
      id: 'cultivation-room-1-drop-platform-2',
      mode: 'drop-to-acid',
      puzzleGroupId: CULTIVATION_ROOM_ONE_GROUP_ID,
      supportTargetId: 'cultivation-room-1-soluble-rope-2',
      supportRole: 'soluble-rope',
      supportPosition: new THREE.Vector3(0, 9, 7.4),
      supportSize: new THREE.Vector3(0.7, 4, 0.7),
      initialPosition: new THREE.Vector3(0, 7, 7.4),
      finalPosition: new THREE.Vector3(0, 0.42, 7.4),
      movingSize: new THREE.Vector3(2.6, 0.5, 2.6),
      releaseDelaySeconds: 0.1,
      travelDurationSeconds: 0.78,
      finalSurfaceTag: 'default',
    },
    {
      id: 'cultivation-room-1-drop-platform-3',
      mode: 'drop-to-acid',
      puzzleGroupId: CULTIVATION_ROOM_ONE_GROUP_ID,
      supportTargetId: 'cultivation-room-1-soluble-rope-3',
      supportRole: 'soluble-rope',
      supportPosition: new THREE.Vector3(3.4, 9.25, 9.7),
      supportSize: new THREE.Vector3(0.7, 4.5, 0.7),
      initialPosition: new THREE.Vector3(3.4, 7, 9.7),
      finalPosition: new THREE.Vector3(3.4, 0.5, 9.7),
      movingSize: new THREE.Vector3(2.6, 0.5, 2.6),
      releaseDelaySeconds: 0.12,
      travelDurationSeconds: 0.84,
      finalSurfaceTag: 'default',
    },
    {
      id: 'cultivation-room-2-rope-catch-block-1',
      mode: 'rope-catch',
      puzzleGroupId: CULTIVATION_ROOM_TWO_GROUP_ID,
      supportTargetId: 'cultivation-room-2-soluble-brace-1',
      supportRole: 'soluble-brace',
      supportPosition: new THREE.Vector3(-5, 10.5, 20),
      supportSize: new THREE.Vector3(2, 0.65, 0.8),
      initialPosition: new THREE.Vector3(-5, 9, 20),
      finalPosition: new THREE.Vector3(-5.5, 5, 23.5),
      movingSize: new THREE.Vector3(2.8, 0.5, 2.8),
      releaseDelaySeconds: 0.08,
      travelDurationSeconds: 0.68,
      settlingDurationSeconds: 0.48,
      settlingSwingRadians: 0.065,
      finalSurfaceTag: 'default',
    },
    {
      id: 'cultivation-room-2-rope-catch-block-2',
      mode: 'rope-catch',
      puzzleGroupId: CULTIVATION_ROOM_TWO_GROUP_ID,
      supportTargetId: 'cultivation-room-2-soluble-brace-2',
      supportRole: 'soluble-brace',
      supportPosition: new THREE.Vector3(0, 10.5, 23.5),
      supportSize: new THREE.Vector3(2, 0.65, 0.8),
      initialPosition: new THREE.Vector3(0, 9, 23.5),
      finalPosition: new THREE.Vector3(-0.5, 6, 25.5),
      movingSize: new THREE.Vector3(2.8, 0.5, 2.8),
      releaseDelaySeconds: 0.1,
      travelDurationSeconds: 0.72,
      settlingDurationSeconds: 0.5,
      settlingSwingRadians: 0.06,
      finalSurfaceTag: 'default',
    },
    {
      id: 'cultivation-room-2-rope-catch-block-3',
      mode: 'rope-catch',
      puzzleGroupId: CULTIVATION_ROOM_TWO_GROUP_ID,
      supportTargetId: 'cultivation-room-2-soluble-brace-3',
      supportRole: 'soluble-brace',
      supportPosition: new THREE.Vector3(5, 10.5, 26),
      supportSize: new THREE.Vector3(2, 0.65, 0.8),
      initialPosition: new THREE.Vector3(5, 9, 26),
      finalPosition: new THREE.Vector3(4.5, 7.25, 27.5),
      movingSize: new THREE.Vector3(2.8, 0.5, 2.8),
      releaseDelaySeconds: 0.12,
      travelDurationSeconds: 0.76,
      settlingDurationSeconds: 0.52,
      settlingSwingRadians: 0.055,
      finalSurfaceTag: 'default',
    },
  ],
  outOfBoundsYMetres: -5,
};
