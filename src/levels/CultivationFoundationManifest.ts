import * as THREE from 'three';

import type { RadioactiveHazardDefinition } from '../hazards/RadioactiveHazardSystem.ts';
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

export interface CultivationFoundationManifest {
  readonly checkpoints: readonly CultivationCheckpointDefinition[];
  readonly triggers: readonly CultivationTriggerAuthoring[];
  readonly radioactiveHazards: readonly RadioactiveHazardDefinition[];
  /** Reserved stable IDs for separately-owned structural assembly components. */
  readonly structuralAssemblyIds: readonly string[];
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
  structuralAssemblyIds: [],
  outOfBoundsYMetres: -5,
};
