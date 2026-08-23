import * as THREE from 'three';

import { EventBus } from '../core/EventBus.ts';
import type { RadiationFailure } from '../hazards/RadioactiveHazardSystem.ts';
import type { CollisionWorld } from '../physics/CollisionWorld.ts';
import { CollisionHit } from '../physics/CollisionWorld.ts';
import type { KinematicBody } from '../physics/KinematicBody.ts';
import { BoxTriggerSensor } from '../puzzle/BoxTriggerSensor.ts';
import { PuzzleRegistry, type ResettablePuzzleComponent } from '../puzzle/PuzzleRegistry.ts';
import { Trigger } from '../puzzle/Trigger.ts';
import type { PersistentSlimePair } from '../slimes/PersistentSlimePair.ts';
import type { DeathRecoveryAction } from '../systems/DeathSequence.ts';
import {
  CultivationCheckpointManager,
  type CultivationProgressionBoundary,
  type CultivationRoomId,
} from './CultivationCheckpointManager.ts';
import {
  CULTIVATION_ENTRANCE_CHECKPOINT_ID,
  CULTIVATION_FOUNDATION_MANIFEST,
  CULTIVATION_ROOM_ONE_GROUP_ID,
  CULTIVATION_ROOM_THREE_CHECKPOINT_ID,
  CULTIVATION_ROOM_THREE_GROUP_ID,
  CULTIVATION_ROOM_TWO_CHECKPOINT_ID,
  CULTIVATION_ROOM_TWO_GROUP_ID,
  type CultivationFoundationManifest,
  type CultivationTriggerAuthoring,
} from './CultivationFoundationManifest.ts';
import type { PlayableSlimeId } from './LevelProgression.ts';

export type CultivationLevelState = 'playing' | 'recovering' | 'completing' | 'complete';

export const CULTIVATION_OBJECTIVES: Readonly<Record<CultivationRoomId, string>> = {
  'cultivation-room-1': 'Bring Bob through the cultivation entry',
  'cultivation-room-2': 'Move both slimes toward their separate exits',
  'cultivation-room-3': 'Cultivation foundation complete',
};

export interface CultivationProgressReadModel {
  readonly state: CultivationLevelState;
  readonly roomId: CultivationRoomId;
  readonly objective: string;
  readonly checkpointId: string;
  readonly puzzleGroupId: string;
  readonly bobEnteredRoomThree: boolean;
  readonly goopEnteredRoomThree: boolean;
  readonly goopEnteredRoomTwoEarly: boolean;
  readonly lastFailure: string;
}

export interface CultivationLevelEvents {
  objectiveChanged: { readonly roomId: CultivationRoomId; readonly objective: string };
  progressChanged: CultivationProgressReadModel;
}

export interface CultivationLevelControllerOptions {
  readonly pair: PersistentSlimePair<KinematicBody>;
  readonly collisionWorld: CollisionWorld;
  readonly initialActiveSlimeId: PlayableSlimeId;
  readonly requestDeath: (
    recovery: DeathRecoveryAction,
    dyingSlimeId: PlayableSlimeId,
  ) => boolean;
  readonly cancelTransients: () => void;
  readonly manifest?: CultivationFoundationManifest;
}

class EmptyRoomReset implements ResettablePuzzleComponent {
  reset(): void {}
}

interface TriggerRuntime {
  readonly authoring: CultivationTriggerAuthoring;
  readonly trigger: Trigger;
  readonly sensor: BoxTriggerSensor;
}

export class CultivationLevelController {
  readonly events = new EventBus<CultivationLevelEvents>();

  private readonly pair: PersistentSlimePair<KinematicBody>;
  private readonly requestDeathAction: (
    recovery: DeathRecoveryAction,
    dyingSlimeId: PlayableSlimeId,
  ) => boolean;
  private readonly cancelTransients: () => void;
  private readonly manifest: CultivationFoundationManifest;
  private readonly puzzleRegistry = new PuzzleRegistry();
  private readonly checkpoints: CultivationCheckpointManager<KinematicBody>;
  private readonly triggerRuntimes: readonly TriggerRuntime[];
  private readonly occupants: readonly [
    { readonly id: 'bob'; readonly position: KinematicBody['position']; readonly radiusMetres: number },
    { readonly id: 'goop'; readonly position: KinematicBody['position']; readonly radiusMetres: number },
  ];
  private readonly unsubscribeCallbacks: Array<() => void> = [];
  private readonly safetyHit = new CollisionHit();
  private readonly safetyDisplacement = new THREE.Vector3();
  private readonly collisionWorld: CollisionWorld;
  private stateValue: CultivationLevelState = 'playing';
  private progression: CultivationProgressionBoundary;
  private goopEnteredRoomTwoEarly = false;
  private failureLatched = false;
  private lastFailureValue = 'none';

  constructor(options: CultivationLevelControllerOptions) {
    this.pair = options.pair;
    this.requestDeathAction = options.requestDeath;
    this.cancelTransients = options.cancelTransients;
    this.manifest = options.manifest ?? CULTIVATION_FOUNDATION_MANIFEST;
    this.collisionWorld = options.collisionWorld;
    this.occupants = [
      { id: 'bob', position: this.pair.bobBody.position, radiusMetres: this.pair.bobBody.radiusMetres },
      { id: 'goop', position: this.pair.goopBody.position, radiusMetres: this.pair.goopBody.radiusMetres },
    ];

    this.puzzleRegistry.register('cultivation-room-1-state', new EmptyRoomReset(), CULTIVATION_ROOM_ONE_GROUP_ID);
    this.puzzleRegistry.register('cultivation-room-2-state', new EmptyRoomReset(), CULTIVATION_ROOM_TWO_GROUP_ID);
    this.puzzleRegistry.register('cultivation-room-3-state', new EmptyRoomReset(), CULTIVATION_ROOM_THREE_GROUP_ID);

    const initial = this.requireCheckpoint(CULTIVATION_ENTRANCE_CHECKPOINT_ID);
    this.progression = { ...initial.progression };
    this.checkpoints = new CultivationCheckpointManager(
      initial,
      options.initialActiveSlimeId,
      this.isSpawnSafe,
      this.puzzleRegistry,
    );
    for (const checkpoint of this.manifest.checkpoints) {
      if (checkpoint.id !== initial.id) this.checkpoints.register(checkpoint);
    }

    this.triggerRuntimes = this.manifest.triggers.map((authoring) => ({
      authoring,
      trigger: new Trigger(authoring.id),
      sensor: new BoxTriggerSensor(authoring.centre, authoring.size),
    }));
    this.subscribeToTriggers();
  }

  get readModel(): CultivationProgressReadModel {
    const checkpoint = this.checkpoints.activeCheckpoint;
    return {
      state: this.stateValue,
      roomId: this.progression.roomId,
      objective: CULTIVATION_OBJECTIVES[this.progression.roomId],
      checkpointId: checkpoint.id,
      puzzleGroupId: checkpoint.puzzleGroupId,
      bobEnteredRoomThree: this.progression.bobEnteredRoomThree,
      goopEnteredRoomThree: this.progression.goopEnteredRoomThree,
      goopEnteredRoomTwoEarly: this.goopEnteredRoomTwoEarly,
      lastFailure: this.lastFailureValue,
    };
  }

  update(): void {
    if (this.stateValue !== 'playing') return;
    for (const runtime of this.triggerRuntimes) {
      runtime.sensor.update(runtime.trigger, this.occupants);
    }
    this.syncRoomThreeOccupancy();
    for (const occupant of this.occupants) {
      if (occupant.position.y < this.manifest.outOfBoundsYMetres) {
        this.requestFailure(`cultivation:out-of-bounds:${occupant.id}`, occupant.id);
        return;
      }
    }
  }

  requestRadiationFailure(failure: RadiationFailure): boolean {
    if (failure.targetId !== 'bob' && failure.targetId !== 'goop') return false;
    return this.requestFailure(
      `radiation:${failure.hazardId}:${failure.targetId}`,
      failure.targetId,
    );
  }

  recoverActiveCheckpoint(): void {
    this.cancelTransients();
    this.clearTriggerOccupants();
    const snapshot = this.checkpoints.recover(this.pair);
    this.progression = { ...snapshot.progression };
    this.goopEnteredRoomTwoEarly = false;
    this.failureLatched = false;
    this.stateValue = 'playing';
    this.emitProgress(true);
  }

  reset(initialActiveSlimeId: PlayableSlimeId): void {
    this.cancelTransients();
    this.clearTriggerOccupants();
    this.puzzleRegistry.reset();
    this.checkpoints.reset(initialActiveSlimeId);
    const snapshot = this.checkpoints.recover(this.pair, false);
    this.progression = { ...snapshot.progression };
    this.goopEnteredRoomTwoEarly = false;
    this.failureLatched = false;
    this.lastFailureValue = 'none';
    this.stateValue = 'playing';
    this.emitProgress(true);
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribeCallbacks) unsubscribe();
    this.unsubscribeCallbacks.length = 0;
    for (const runtime of this.triggerRuntimes) runtime.trigger.dispose();
    this.puzzleRegistry.clear();
    this.events.clear();
  }

  private requestFailure(
    failureId: string,
    dyingSlimeId: PlayableSlimeId,
  ): boolean {
    if (this.stateValue !== 'playing' || this.failureLatched) return false;
    const accepted = this.requestDeathAction(
      () => this.recoverActiveCheckpoint(),
      dyingSlimeId,
    );
    if (!accepted) return false;
    this.failureLatched = true;
    this.lastFailureValue = failureId;
    this.stateValue = 'recovering';
    this.emitProgress();
    return true;
  }

  private subscribeToTriggers(): void {
    for (const runtime of this.triggerRuntimes) {
      if (runtime.authoring.role !== 'room-2-entry') continue;
      this.unsubscribeCallbacks.push(
        runtime.trigger.events.on('entered', ({ occupantId }) => {
          this.handleRoomTwoEntry(occupantId);
        }),
      );
    }
  }

  private handleRoomTwoEntry(occupantId: string): void {
    if (this.progression.roomId !== 'cultivation-room-1') return;
    if (occupantId === 'goop') {
      this.goopEnteredRoomTwoEarly = true;
      this.emitProgress();
      return;
    }
    if (occupantId !== 'bob') return;
    const checkpoint = this.requireCheckpoint(CULTIVATION_ROOM_TWO_CHECKPOINT_ID);
    this.checkpoints.activate(checkpoint.id, this.pair.activeSlimeId);
    this.progression = { ...checkpoint.progression };
    this.emitProgress(true);
  }

  private syncRoomThreeOccupancy(): void {
    if (
      this.stateValue !== 'playing' ||
      this.progression.roomId !== 'cultivation-room-2'
    ) return;

    let bobEnteredRoomThree = false;
    let goopEnteredRoomThree = false;
    for (const runtime of this.triggerRuntimes) {
      if (runtime.authoring.role === 'bob-room-3-entry') {
        bobEnteredRoomThree = runtime.trigger.occupants.has('bob');
      } else if (runtime.authoring.role === 'goop-room-3-entry') {
        goopEnteredRoomThree = runtime.trigger.occupants.has('goop');
      }
    }

    if (
      this.progression.bobEnteredRoomThree === bobEnteredRoomThree &&
      this.progression.goopEnteredRoomThree === goopEnteredRoomThree
    ) return;

    const next = {
      ...this.progression,
      bobEnteredRoomThree,
      goopEnteredRoomThree,
    };
    this.progression = next;
    if (next.bobEnteredRoomThree && next.goopEnteredRoomThree) {
      const checkpoint = this.requireCheckpoint(CULTIVATION_ROOM_THREE_CHECKPOINT_ID);
      this.checkpoints.activate(checkpoint.id, this.pair.activeSlimeId);
      this.progression = { ...checkpoint.progression };
      this.emitProgress(true);
      return;
    }
    this.emitProgress();
  }

  private clearTriggerOccupants(): void {
    for (const runtime of this.triggerRuntimes) runtime.trigger.clear();
  }

  private emitProgress(objectiveMayHaveChanged = false): void {
    const model = this.readModel;
    this.events.emit('progressChanged', model);
    if (objectiveMayHaveChanged) {
      this.events.emit('objectiveChanged', {
        roomId: model.roomId,
        objective: model.objective,
      });
    }
  }

  private requireCheckpoint(id: string) {
    const checkpoint = this.manifest.checkpoints.find((candidate) => candidate.id === id);
    if (!checkpoint) throw new Error(`Missing Cultivation checkpoint "${id}".`);
    return checkpoint;
  }

  private readonly isSpawnSafe = (
    position: THREE.Vector3,
    clearanceRadius: number,
  ): boolean => {
    const directions: readonly (readonly [number, number, number])[] = [
      [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0],
    ];
    for (const [x, y, z] of directions) {
      this.safetyDisplacement.set(x, y, z).multiplyScalar(0.02);
      if (
        this.collisionWorld.sweepSphere(
          position,
          this.safetyDisplacement,
          clearanceRadius,
          this.safetyHit,
        ) && this.safetyHit.fraction <= 1e-5
      ) return false;
    }
    return true;
  };
}
