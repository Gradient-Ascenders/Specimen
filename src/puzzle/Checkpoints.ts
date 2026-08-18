import * as THREE from 'three';

export interface CheckpointDefinition {
  readonly id: string;
  readonly spawnPosition: THREE.Vector3;
  readonly clearanceRadius?: number;
}

export interface CheckpointRecoveryTarget {
  recoverAt(position: THREE.Vector3): void;
}

export type SpawnSafetyCheck = (
  position: THREE.Vector3,
  clearanceRadius: number,
) => boolean;

interface Checkpoint extends CheckpointDefinition {
  readonly clearanceRadius: number;
}

/**
 * Tracks an active checkpoint for one level. Spawn safety is checked when a
 * checkpoint is authored, activated, and used for recovery, so recovery never
 * intentionally places the player inside registered collision geometry.
 */
export class CheckpointManager {
  private readonly checkpoints = new Map<string, Checkpoint>();
  private readonly initialCheckpointId: string;
  private currentCheckpointId: string;

  constructor(
    initialCheckpoint: CheckpointDefinition,
    private readonly isSpawnSafe: SpawnSafetyCheck,
  ) {
    this.initialCheckpointId = initialCheckpoint.id;
    this.currentCheckpointId = initialCheckpoint.id;
    this.register(initialCheckpoint);
  }

  get activeCheckpointId(): string {
    return this.currentCheckpointId;
  }

  register(definition: CheckpointDefinition): void {
    if (!definition.id) throw new Error('Checkpoint IDs cannot be empty.');
    if (this.checkpoints.has(definition.id)) {
      throw new Error(`Checkpoint "${definition.id}" is already registered.`);
    }

    const clearanceRadius = definition.clearanceRadius ?? 0.45;
    if (!Number.isFinite(clearanceRadius) || clearanceRadius <= 0) {
      throw new Error('Checkpoint clearance radius must be positive.');
    }

    const checkpoint: Checkpoint = {
      id: definition.id,
      spawnPosition: definition.spawnPosition.clone(),
      clearanceRadius,
    };
    this.assertSafe(checkpoint);
    this.checkpoints.set(checkpoint.id, checkpoint);
  }

  activate(checkpointId: string): void {
    const checkpoint = this.getCheckpoint(checkpointId);
    this.assertSafe(checkpoint);
    this.currentCheckpointId = checkpoint.id;
  }

  recover(target: CheckpointRecoveryTarget): void {
    const checkpoint = this.getCheckpoint(this.currentCheckpointId);
    this.assertSafe(checkpoint);
    target.recoverAt(checkpoint.spawnPosition);
  }

  reset(): void {
    this.currentCheckpointId = this.initialCheckpointId;
  }

  private getCheckpoint(id: string): Checkpoint {
    const checkpoint = this.checkpoints.get(id);
    if (!checkpoint) throw new Error(`Unknown checkpoint "${id}".`);
    return checkpoint;
  }

  private assertSafe(checkpoint: Checkpoint): void {
    if (!this.isSpawnSafe(checkpoint.spawnPosition, checkpoint.clearanceRadius)) {
      throw new Error(`Checkpoint "${checkpoint.id}" is not clear for spawning.`);
    }
  }
}
