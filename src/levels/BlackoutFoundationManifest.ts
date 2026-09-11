import * as THREE from 'three';

import type { BlackoutCheckpointDefinition } from './BlackoutCheckpointManager.ts';

const spawnSet = (z: number) => ({
  bob: new THREE.Vector3(-2, 0.46, z),
  goop: new THREE.Vector3(0, 0.46, z),
  volt: new THREE.Vector3(2, 0.46, z),
});

export const BLACKOUT_CHECKPOINTS: readonly BlackoutCheckpointDefinition[] = [
  { id: 'cp1', bodyPositions: spawnSet(2), activeSlimeId: 'volt', room: { roomId: 'room-1', phase: 'three-slime', local: {} } },
  { id: 'cp2', bodyPositions: spawnSet(11), activeSlimeId: 'volt', room: { roomId: 'room-1', phase: 'three-slime', local: { tutorialComplete: true } } },
  { id: 'cp3', bodyPositions: spawnSet(20), activeSlimeId: 'bob', room: { roomId: 'room-2', phase: 'three-slime', local: {} } },
  { id: 'cp4', bodyPositions: spawnSet(29), activeSlimeId: 'bob', room: { roomId: 'room-2', phase: 'three-slime', local: { bridgeComplete: true } } },
  { id: 'cp5', bodyPositions: spawnSet(38), activeSlimeId: 'volt', room: { roomId: 'room-3', phase: 'three-slime', local: {} } },
  { id: 'cp6', bodyPositions: spawnSet(47), activeSlimeId: 'volt', room: { roomId: 'room-3', phase: 'three-slime', local: { reactorApproach: true } } },
  { id: 'cp7', bodyPositions: spawnSet(56), activeSlimeId: 'bob', room: { roomId: 'room-3', phase: 'three-slime', local: { finalPuzzleReady: true } } },
  { id: 'cp8', bodyPositions: spawnSet(65), activeSlimeId: 'bob', room: { roomId: 'room-4b', phase: 'specimen', local: { merged: true } } },
  { id: 'cp9', bodyPositions: spawnSet(74), activeSlimeId: 'bob', room: { roomId: 'room-4b', phase: 'boss', local: { optionalBossCheckpoint: true } } },
] as const;

export const BLACKOUT_FOUNDATION_LENGTH_METRES = 84;
