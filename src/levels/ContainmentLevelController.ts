import * as THREE from 'three';

import { EventBus } from '../core/EventBus.ts';
import { CollisionHit, CollisionWorld } from '../physics/CollisionWorld.ts';
import { KinematicBody } from '../physics/KinematicBody.ts';
import { CheckpointManager } from '../puzzle/Checkpoints.ts';
import { PuzzleRegistry, type ResettablePuzzleComponent } from '../puzzle/PuzzleRegistry.ts';
import type { DeathRecoveryAction } from '../systems/DeathSequence.ts';
import { ContainmentLevelScene, type ContainmentHazardFailure } from './ContainmentLevelScene.ts';
import { LevelTriggerVolume } from './LevelTriggerVolume.ts';
import {
  ROOM_3_CHECKPOINT_ID,
  ROOM_3_CHECKPOINT_POSITION,
  ROOM_3_PUZZLE_GROUP_ID,
} from './RoomThreeGreybox.ts';
import {
  ROOM_4_CHECKPOINT_ID,
  ROOM_4_CHECKPOINT_POSITION,
  ROOM_4_PUZZLE_GROUP_ID,
} from './RoomFourGreybox.ts';
import {
  ROOM_5_CENTRAL_CHECKPOINT_ID,
  ROOM_5_CENTRAL_CHECKPOINT_POSITION,
  ROOM_5_ENTRY_CHECKPOINT_ID,
  ROOM_5_ENTRY_CHECKPOINT_POSITION,
  ROOM_5_FINAL_CHECKPOINT_ID,
  ROOM_5_FINAL_CHECKPOINT_POSITION,
  ROOM_5_PUZZLE_GROUP_ID,
} from './RoomFiveGreybox.ts';

const INITIAL_GROUP_ID = 'containment-room-1';
const ROOM_2_GROUP_ID = 'containment-room-2';
const INITIAL_CHECKPOINT_ID = 'containment-room-1-spawn';
const ROOM_2_CHECKPOINT_ID = 'containment-room-2-safe-floor';
const LEVER_ADHESION_SECONDS = 0.35;

export type ContainmentLevelState = 'playing' | 'completing' | 'complete';

export interface ContainmentLevelEvents {
  completed: {
    readonly levelId: 'containment';
    readonly nextLevelId: 'level-2';
  };
}

export interface ContainmentLevelControllerOptions {
  readonly scene: ContainmentLevelScene;
  readonly body: KinematicBody;
  readonly collisionWorld: CollisionWorld;
  readonly requestDeath: (recovery: DeathRecoveryAction) => boolean;
}

class EmptyRoomReset implements ResettablePuzzleComponent {
  reset(): void {}
}

/** Fixed-step progression, checkpoint and completion owner for Level 1. */
export class ContainmentLevelController {
  readonly events = new EventBus<ContainmentLevelEvents>();

  private readonly scene: ContainmentLevelScene;
  private readonly body: KinematicBody;
  private readonly collisionWorld: CollisionWorld;
  private readonly requestDeathAction: (recovery: DeathRecoveryAction) => boolean;
  private readonly puzzleRegistry = new PuzzleRegistry();
  private readonly checkpoints: CheckpointManager;
  private readonly roomTwoCheckpointTrigger = new LevelTriggerVolume({
    id: 'room-2-safe-floor-checkpoint-trigger',
    centre: new THREE.Vector3(-8.5, 1, 30.5),
    size: new THREE.Vector3(8, 3, 7),
  });
  private readonly spawnPosition = new THREE.Vector3();
  private readonly roomTwoSpawnPosition = new THREE.Vector3();
  private readonly safetyHit = new CollisionHit();
  private readonly safetyDisplacement = new THREE.Vector3();
  private readonly unsubscribeCallbacks: Array<() => void> = [];
  private stateValue: ContainmentLevelState = 'playing';
  private leverAdhesionSeconds = 0;
  private lastFailureIdValue = 'none';
  private completionCountValue = 0;

  constructor(options: ContainmentLevelControllerOptions) {
    this.scene = options.scene;
    this.body = options.body;
    this.collisionWorld = options.collisionWorld;
    this.requestDeathAction = options.requestDeath;
    this.scene.copySpawnPosition(this.spawnPosition);
    this.scene.copyRoomTwoSafeLandingPosition(this.roomTwoSpawnPosition);

    this.puzzleRegistry.register('room-1-static-state', new EmptyRoomReset(), INITIAL_GROUP_ID);
    this.puzzleRegistry.register('room-2-static-state', new EmptyRoomReset(), ROOM_2_GROUP_ID);
    this.puzzleRegistry.register('room-3-state', this.scene.roomThree, ROOM_3_PUZZLE_GROUP_ID);
    this.puzzleRegistry.register('room-4-state', this.scene.roomFour, ROOM_4_PUZZLE_GROUP_ID);
    this.puzzleRegistry.register('room-5-state', this.scene.roomFive, ROOM_5_PUZZLE_GROUP_ID);

    this.checkpoints = new CheckpointManager(
      {
        id: INITIAL_CHECKPOINT_ID,
        spawnPosition: this.spawnPosition,
        puzzleGroupId: INITIAL_GROUP_ID,
      },
      this.isSpawnSafe,
      this.puzzleRegistry,
    );
    this.registerCheckpoints();
    this.subscribeToTriggers();
  }

  get state(): ContainmentLevelState {
    return this.stateValue;
  }

  get activeCheckpointId(): string {
    return this.checkpoints.activeCheckpointId;
  }

  get lastFailureId(): string {
    return this.lastFailureIdValue;
  }

  get completionCount(): number {
    return this.completionCountValue;
  }

  update(deltaSeconds: number): void {
    if (this.stateValue === 'complete') return;
    if (this.stateValue === 'completing') {
      if (this.scene.roomFive.updateEnding(deltaSeconds)) {
        this.stateValue = 'complete';
        this.completionCountValue += 1;
        this.events.emit('completed', {
          levelId: 'containment',
          nextLevelId: 'level-2',
        });
      }
      return;
    }

    this.roomTwoCheckpointTrigger.update(this.body);
    this.scene.roomThree.update(deltaSeconds, this.body);
    this.scene.roomFour.update(deltaSeconds, this.body);
    this.scene.roomFive.updateTraversal(deltaSeconds, this.body);

    if (
      this.scene.roomFive.observationTrigger.occupied &&
      this.body.attached &&
      this.body.attachmentSurfaceName === this.scene.roomFive.leverHandleName
    ) {
      this.leverAdhesionSeconds += deltaSeconds;
      if (
        this.leverAdhesionSeconds >= LEVER_ADHESION_SECONDS &&
        this.scene.roomFive.beginEnding()
      ) {
        this.stateValue = 'completing';
      }
    } else {
      this.leverAdhesionSeconds = 0;
    }
  }

  requestHazardFailure(failure: ContainmentHazardFailure): boolean {
    return this.requestFailure(`${failure.roomId}:${failure.hazardId}`);
  }

  requestOutOfBoundsFailure(): boolean {
    return this.requestFailure('containment:out-of-bounds');
  }

  recoverActiveCheckpoint(): void {
    this.checkpoints.recover(this.body);
  }

  reset(): void {
    this.puzzleRegistry.reset();
    this.checkpoints.reset();
    this.body.recoverAt(this.spawnPosition);
    this.roomTwoCheckpointTrigger.reset();
    this.stateValue = 'playing';
    this.leverAdhesionSeconds = 0;
    this.lastFailureIdValue = 'none';
    this.completionCountValue = 0;
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribeCallbacks) unsubscribe();
    this.unsubscribeCallbacks.length = 0;
    this.roomTwoCheckpointTrigger.dispose();
    this.puzzleRegistry.clear();
    this.events.clear();
  }

  private registerCheckpoints(): void {
    this.checkpoints.register({
      id: ROOM_2_CHECKPOINT_ID,
      spawnPosition: this.roomTwoSpawnPosition,
      puzzleGroupId: ROOM_2_GROUP_ID,
    });
    this.checkpoints.register({
      id: ROOM_3_CHECKPOINT_ID,
      spawnPosition: ROOM_3_CHECKPOINT_POSITION,
      puzzleGroupId: ROOM_3_PUZZLE_GROUP_ID,
    });
    this.checkpoints.register({
      id: ROOM_4_CHECKPOINT_ID,
      spawnPosition: ROOM_4_CHECKPOINT_POSITION,
      puzzleGroupId: ROOM_4_PUZZLE_GROUP_ID,
    });
    this.checkpoints.register({
      id: ROOM_5_ENTRY_CHECKPOINT_ID,
      spawnPosition: ROOM_5_ENTRY_CHECKPOINT_POSITION,
      puzzleGroupId: ROOM_5_PUZZLE_GROUP_ID,
    });
    this.checkpoints.register({
      id: ROOM_5_CENTRAL_CHECKPOINT_ID,
      spawnPosition: ROOM_5_CENTRAL_CHECKPOINT_POSITION,
      puzzleGroupId: ROOM_5_PUZZLE_GROUP_ID,
    });
    this.checkpoints.register({
      id: ROOM_5_FINAL_CHECKPOINT_ID,
      spawnPosition: ROOM_5_FINAL_CHECKPOINT_POSITION,
      puzzleGroupId: ROOM_5_PUZZLE_GROUP_ID,
    });
  }

  private subscribeToTriggers(): void {
    this.onEntered(this.roomTwoCheckpointTrigger, () =>
      this.checkpoints.activate(ROOM_2_CHECKPOINT_ID));
    this.onEntered(this.scene.roomThree.checkpointTrigger, () =>
      this.checkpoints.activate(ROOM_3_CHECKPOINT_ID));
    this.onEntered(this.scene.roomFour.checkpointTrigger, () =>
      this.checkpoints.activate(ROOM_4_CHECKPOINT_ID));
    this.onEntered(this.scene.roomFive.entryCheckpointTrigger, () =>
      this.checkpoints.activate(ROOM_5_ENTRY_CHECKPOINT_ID));
    this.onEntered(this.scene.roomFive.centralCheckpointTrigger, () =>
      this.checkpoints.activate(ROOM_5_CENTRAL_CHECKPOINT_ID));
    this.onEntered(this.scene.roomFive.finalCheckpointTrigger, () =>
      this.checkpoints.activate(ROOM_5_FINAL_CHECKPOINT_ID));

    this.onEntered(this.scene.roomThree.failureVolume, () =>
      this.requestFailure('room-3:fall'));
    this.onEntered(this.scene.roomFour.failureVolume, () =>
      this.requestFailure('room-4:fall'));
    this.onEntered(this.scene.roomFive.failureVolume, () =>
      this.requestFailure('room-5:fall'));
  }

  private onEntered(volume: LevelTriggerVolume, callback: () => void): void {
    this.unsubscribeCallbacks.push(
      volume.trigger.events.on('entered', callback),
    );
  }

  private requestFailure(failureId: string): boolean {
    if (this.stateValue !== 'playing') return false;
    const accepted = this.requestDeathAction(() =>
      this.checkpoints.recover(this.body));
    if (accepted) this.lastFailureIdValue = failureId;
    return accepted;
  }

  private readonly isSpawnSafe = (
    position: THREE.Vector3,
    clearanceRadius: number,
  ): boolean => {
    const directions: readonly (readonly [number, number, number])[] = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
      [0, 1, 0],
    ];
    for (const [x, y, z] of directions) {
      this.safetyDisplacement.set(x, y, z).multiplyScalar(0.02);
      if (
        this.collisionWorld.sweepSphere(
          position,
          this.safetyDisplacement,
          clearanceRadius,
          this.safetyHit,
        ) &&
        this.safetyHit.fraction <= 1e-5
      ) {
        return false;
      }
    }
    return true;
  };
}
