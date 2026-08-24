import * as THREE from 'three';

import type { PuzzleGroupResetter } from '../puzzle/Checkpoints.ts';
import type {
  PersistentSlimeBody,
  PersistentSlimePair,
} from '../slimes/PersistentSlimePair.ts';
import type { PlayableSlimeId } from './LevelProgression.ts';

export type CultivationRoomId =
  | 'cultivation-room-1'
  | 'cultivation-room-2'
  | 'cultivation-room-3';

export interface CultivationProgressionBoundary {
  readonly roomId: CultivationRoomId;
  readonly bobEnteredRoomThree: boolean;
  readonly goopEnteredRoomThree: boolean;
}

export interface CultivationCheckpointDefinition {
  readonly id: string;
  readonly puzzleGroupId: string;
  readonly bobSpawnPosition: THREE.Vector3;
  readonly goopSpawnPosition: THREE.Vector3;
  readonly progression: CultivationProgressionBoundary;
  readonly cameraResetAnchor?: THREE.Vector3;
  readonly clearanceRadius?: number;
}

export interface CultivationCheckpointSnapshot {
  readonly id: string;
  readonly puzzleGroupId: string;
  readonly bobSpawnPosition: THREE.Vector3;
  readonly goopSpawnPosition: THREE.Vector3;
  readonly activeSlimeId: PlayableSlimeId;
  readonly progression: CultivationProgressionBoundary;
  readonly cameraResetAnchor: THREE.Vector3 | undefined;
}

type Pair<Body extends PersistentSlimeBody> = PersistentSlimePair<Body>;
type SpawnSafetyCheck = (position: THREE.Vector3, clearanceRadius: number) => boolean;

interface RegisteredCheckpoint extends CultivationCheckpointDefinition {
  readonly clearanceRadius: number;
}

/** Level 2 checkpoint authority for two persistent bodies and room progress. */
export class CultivationCheckpointManager<Body extends PersistentSlimeBody> {
  private readonly checkpoints = new Map<string, RegisteredCheckpoint>();
  private readonly initialCheckpointId: string;
  private readonly isSpawnSafe: SpawnSafetyCheck;
  private readonly puzzleGroups: PuzzleGroupResetter;
  private activeSnapshot: CultivationCheckpointSnapshot;

  constructor(
    initialCheckpoint: CultivationCheckpointDefinition,
    initialActiveSlimeId: PlayableSlimeId,
    isSpawnSafe: SpawnSafetyCheck,
    puzzleGroups: PuzzleGroupResetter,
  ) {
    this.initialCheckpointId = initialCheckpoint.id;
    this.isSpawnSafe = isSpawnSafe;
    this.puzzleGroups = puzzleGroups;
    this.register(initialCheckpoint);
    this.activeSnapshot = this.createSnapshot(
      this.getCheckpoint(initialCheckpoint.id),
      initialActiveSlimeId,
    );
  }

  get activeCheckpoint(): CultivationCheckpointSnapshot {
    return this.cloneSnapshot(this.activeSnapshot);
  }

  register(definition: CultivationCheckpointDefinition): void {
    if (!definition.id || this.checkpoints.has(definition.id)) {
      throw new Error('Cultivation checkpoint IDs must be unique and non-empty.');
    }
    if (!definition.puzzleGroupId || !this.puzzleGroups.hasGroup(definition.puzzleGroupId)) {
      throw new Error(`Checkpoint "${definition.id}" references an unknown puzzle group.`);
    }
    const clearanceRadius = definition.clearanceRadius ?? 0.45;
    if (!Number.isFinite(clearanceRadius) || clearanceRadius <= 0) {
      throw new Error('Checkpoint clearance radius must be positive and finite.');
    }
    const checkpoint: RegisteredCheckpoint = {
      ...definition,
      bobSpawnPosition: definition.bobSpawnPosition.clone(),
      goopSpawnPosition: definition.goopSpawnPosition.clone(),
      cameraResetAnchor: definition.cameraResetAnchor?.clone(),
      progression: { ...definition.progression },
      clearanceRadius,
    };
    this.assertSafe(checkpoint);
    this.checkpoints.set(checkpoint.id, checkpoint);
  }

  activate(checkpointId: string, activeSlimeId: PlayableSlimeId): void {
    const checkpoint = this.getCheckpoint(checkpointId);
    this.assertSafe(checkpoint);
    this.activeSnapshot = this.createSnapshot(checkpoint, activeSlimeId);
  }

  recover(
    pair: Pair<Body>,
    resetPuzzleGroup = true,
  ): CultivationCheckpointSnapshot {
    const checkpoint = this.getCheckpoint(this.activeSnapshot.id);
    if (resetPuzzleGroup) this.puzzleGroups.resetGroup(checkpoint.puzzleGroupId);
    // Dynamic room collision (notably the vertical blast door) must first
    // return to its authored reset pose. Validate that exact restored geometry
    // before either persistent body is recovered into the room.
    this.assertSafe(checkpoint);
    pair.setRecoveryState({
      bobPosition: this.activeSnapshot.bobSpawnPosition,
      goopPosition: this.activeSnapshot.goopSpawnPosition,
      activeSlimeId: this.activeSnapshot.activeSlimeId,
    });
    pair.restoreRecoveryState();
    return this.activeCheckpoint;
  }

  reset(initialActiveSlimeId: PlayableSlimeId): void {
    const initial = this.getCheckpoint(this.initialCheckpointId);
    this.activeSnapshot = this.createSnapshot(initial, initialActiveSlimeId);
  }

  private getCheckpoint(id: string): RegisteredCheckpoint {
    const checkpoint = this.checkpoints.get(id);
    if (!checkpoint) throw new Error(`Unknown Cultivation checkpoint "${id}".`);
    return checkpoint;
  }

  private assertSafe(checkpoint: RegisteredCheckpoint): void {
    if (!this.isSpawnSafe(checkpoint.bobSpawnPosition, checkpoint.clearanceRadius)) {
      throw new Error(`Checkpoint "${checkpoint.id}" has an unsafe Bob spawn.`);
    }
    if (!this.isSpawnSafe(checkpoint.goopSpawnPosition, checkpoint.clearanceRadius)) {
      throw new Error(`Checkpoint "${checkpoint.id}" has an unsafe Goop spawn.`);
    }
  }

  private createSnapshot(
    checkpoint: RegisteredCheckpoint,
    activeSlimeId: PlayableSlimeId,
  ): CultivationCheckpointSnapshot {
    return {
      id: checkpoint.id,
      puzzleGroupId: checkpoint.puzzleGroupId,
      bobSpawnPosition: checkpoint.bobSpawnPosition.clone(),
      goopSpawnPosition: checkpoint.goopSpawnPosition.clone(),
      activeSlimeId,
      progression: { ...checkpoint.progression },
      cameraResetAnchor: checkpoint.cameraResetAnchor?.clone(),
    };
  }

  private cloneSnapshot(snapshot: CultivationCheckpointSnapshot): CultivationCheckpointSnapshot {
    return {
      ...snapshot,
      bobSpawnPosition: snapshot.bobSpawnPosition.clone(),
      goopSpawnPosition: snapshot.goopSpawnPosition.clone(),
      progression: { ...snapshot.progression },
      cameraResetAnchor: snapshot.cameraResetAnchor?.clone(),
    };
  }
}
