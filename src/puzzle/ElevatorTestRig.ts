import * as THREE from 'three';

import {
  LaserHazard,
  type LaserContactTarget,
} from '../hazards/LaserHazard';
import { LaserHazardSystem } from '../hazards/LaserHazardSystem';
import type { CollisionWorld } from '../physics/CollisionWorld';
import type { KinematicBody } from '../physics/KinematicBody';
import type { SurfaceRegistry } from '../physics/SurfaceRegistry';
import { CheckpointManager } from './Checkpoints';
import {
  ElevatorSequence,
  type ElevatorSequenceState,
} from './ElevatorSequence';
import { MovingPlatform } from './MovingPlatform';
import { PuzzleRegistry } from './PuzzleRegistry';

const ELEVATOR_GROUP_ID = 'room4-elevator-test';
const ELEVATOR_CHECKPOINT_ID = 'room4-elevator-roof';
const REGRESSION_FIXED_DELTA_SECONDS = 1 / 60;
const POSITION_TOLERANCE_METRES = 0.006;

const PLATFORM_START = new THREE.Vector3(13, 0.6, -5);
const PLATFORM_END = new THREE.Vector3(13, 8.6, -5);
const PLATFORM_SIZE = new THREE.Vector3(4.8, 0.5, 4.8);
const TRAVEL_DURATION_SECONDS = 4.0;
const START_DELAY_SECONDS = 0.85;
const ARRIVAL_DELAY_SECONDS = 0.65;

export interface ElevatorTestRigDiagnostics {
  readonly activeCheckpointId: string;
  readonly checkpointGroupId: string;
  readonly state: ElevatorSequenceState;
  readonly progress: number;
  readonly stateElapsedSeconds: number;
  readonly sequenceElapsedSeconds: number;
  readonly startDelaySeconds: number;
  readonly travelDurationSeconds: number;
  readonly arrivalDelaySeconds: number;
  readonly platformY: number;
  readonly displacementY: number;
  readonly riderSupported: boolean;
  readonly supportColliderName: string;
  readonly connectedLaserState: string;
  readonly connectedLaserPhase: number;
  readonly recoveryCount: number;
}

/**
 * Development-only proof of the Room 4 carrier/reset contract.
 *
 * It uses the real KinematicBody, CollisionWorld, SurfaceRegistry,
 * CheckpointManager, PuzzleRegistry, MovingPlatform and #65 laser runtime.
 */
export class ElevatorTestRig {
  readonly root = new THREE.Group();

  private readonly player: KinematicBody;
  private readonly collisionWorld: CollisionWorld;
  private readonly surfaces: SurfaceRegistry;
  private readonly puzzleRegistry = new PuzzleRegistry();

  private readonly platform: MovingPlatform;
  private readonly sequence: ElevatorSequence;
  private readonly connectedLaser: LaserHazard;
  private readonly laserSystem: LaserHazardSystem;
  private readonly checkpoints: CheckpointManager;
  private readonly checkpointSpawn = new THREE.Vector3();
  private readonly harmlessRegressionTarget: LaserContactTarget;

  private recoveryCountValue = 0;

  constructor(
    player: KinematicBody,
    collisionWorld: CollisionWorld,
    surfaces: SurfaceRegistry,
  ) {
    this.player = player;
    this.collisionWorld = collisionWorld;
    this.surfaces = surfaces;
    this.root.name = 'room4-elevator-development-rig';

    this.platform = new MovingPlatform({
      id: 'room4-cargo-elevator',
      start: PLATFORM_START,
      end: PLATFORM_END,
      size: PLATFORM_SIZE,
      travelDurationSeconds: TRAVEL_DURATION_SECONDS,
    });

    this.sequence = new ElevatorSequence({
      id: 'room4-cargo-elevator',
      platform: this.platform,
      checkpointGroupId: ELEVATOR_GROUP_ID,
      startDelaySeconds: START_DELAY_SECONDS,
      arrivalDelaySeconds: ARRIVAL_DELAY_SECONDS,
      autoStartOnRider: true,
    });

    this.root.add(this.sequence.root);

    this.collisionWorld.register(this.platform.collisionMesh);
    this.surfaces.register(this.platform.collisionMesh);

    const roofY =
      PLATFORM_START.y +
      PLATFORM_SIZE.y * 0.5 +
      this.player.radiusMetres +
      0.012;
    this.checkpointSpawn.set(
      PLATFORM_START.x,
      roofY,
      PLATFORM_START.z,
    );

    // A readable scripted hazard shares the exact Room 4 reset group. It is
    // intentionally offset from the platform path in the harness so carrier
    // testing is not interrupted; actual shaft placement belongs to #21/#67.
    this.connectedLaser = new LaserHazard({
      id: 'room4-elevator-connected-laser-demo',
      start: new THREE.Vector3(10.0, 4.8, -2.9),
      end: new THREE.Vector3(16.0, 4.8, -2.9),
      timeline: {
        axisWorld: new THREE.Vector3(0, 1, 0),
        repeat: true,
        steps: [
          {
            kind: 'hold',
            durationSeconds: 0.4,
            enabled: false,
            angleRadians: -0.4,
          },
          {
            kind: 'sweep',
            durationSeconds: 0.9,
            enabled: true,
            fromAngleRadians: -0.4,
            toAngleRadians: 0.4,
          },
          {
            kind: 'hold',
            durationSeconds: 0.3,
            enabled: false,
            angleRadians: 0.4,
          },
          {
            kind: 'sweep',
            durationSeconds: 0.9,
            enabled: true,
            fromAngleRadians: 0.4,
            toAngleRadians: -0.4,
          },
        ],
      },
    });

    this.laserSystem = new LaserHazardSystem({
      id: 'room4-elevator-connected-hazards',
      hazards: [this.connectedLaser],
      requestRecovery: () => {
        this.recoveryCountValue += 1;
        this.checkpoints.recover(this.player);
      },
    });
    this.root.add(this.laserSystem.root);

    // Registration order is authored reset order: elevator pose/sequence,
    // then connected hazards, then CheckpointManager recovers the player.
    this.puzzleRegistry.register(
      'room4-cargo-elevator-sequence',
      this.sequence,
      ELEVATOR_GROUP_ID,
    );
    this.puzzleRegistry.register(
      'room4-elevator-connected-hazards',
      this.laserSystem,
      ELEVATOR_GROUP_ID,
    );

    this.checkpoints = new CheckpointManager(
      {
        id: ELEVATOR_CHECKPOINT_ID,
        spawnPosition: this.checkpointSpawn,
        puzzleGroupId: ELEVATOR_GROUP_ID,
        clearanceRadius: this.player.radiusMetres,
      },
      this.isSpawnSafe,
      this.puzzleRegistry,
    );

    const farAway = new THREE.Vector3(1000, 1000, 1000);
    this.harmlessRegressionTarget = {
      position: farAway,
      radiusMetres: this.player.radiusMetres,
    };
  }

  /** Place the actual player at the elevator-roof checkpoint. */
  enter(): void {
    this.checkpoints.reset();
    this.checkpoints.recover(this.player);
  }

  /**
   * Simulate fall/laser failure through the active Room 4 checkpoint contract.
   */
  recover(): void {
    this.recoveryCountValue += 1;
    this.checkpoints.recover(this.player);
  }

  /**
   * Fixed-step order: body updates first in main.ts, then this moves the
   * platform and applies its displacement only if the body is still supported.
   */
  update(deltaSeconds: number): void {
    this.sequence.update(deltaSeconds, this.player);
    this.laserSystem.update(deltaSeconds, this.player);
  }

  /** Reset Room 4 mutable state without changing whichever harness owns player. */
  resetRuntimeOnly(): void {
    this.puzzleRegistry.resetGroup(ELEVATOR_GROUP_ID);
    this.checkpoints.reset();
  }

  runCarrierRegression(): string {
    this.enter();

    const initialRelativeY =
      this.player.position.y - this.platform.root.position.y;
    let maximumRelativeError = 0;
    let maximumVerticalVelocity = 0;
    let unsupportedAscendingSteps = 0;
    let simulatedSteps = 0;

    const maximumSteps = Math.ceil(
      (
        START_DELAY_SECONDS +
        TRAVEL_DURATION_SECONDS +
        ARRIVAL_DELAY_SECONDS +
        1
      ) / REGRESSION_FIXED_DELTA_SECONDS,
    );

    for (
      let step = 0;
      step < maximumSteps && !this.sequence.exitReady;
      step += 1
    ) {
      this.player.update(
        REGRESSION_FIXED_DELTA_SECONDS,
        0,
        0,
      );
      this.sequence.update(
        REGRESSION_FIXED_DELTA_SECONDS,
        this.player,
      );
      this.laserSystem.update(
        REGRESSION_FIXED_DELTA_SECONDS,
        this.harmlessRegressionTarget,
      );

      simulatedSteps += 1;

      if (
        this.sequence.state === 'ascending' &&
        !this.player.isSupportedBy(
          this.platform.collisionMesh,
        )
      ) {
        unsupportedAscendingSteps += 1;
      }

      const relativeY =
        this.player.position.y - this.platform.root.position.y;
      maximumRelativeError = Math.max(
        maximumRelativeError,
        Math.abs(relativeY - initialRelativeY),
      );
      maximumVerticalVelocity = Math.max(
        maximumVerticalVelocity,
        Math.abs(this.player.velocity.y),
      );
    }

    if (!this.sequence.exitReady) {
      throw new Error(
        'Elevator regression did not reach exitReady.',
      );
    }

    if (
      maximumRelativeError > POSITION_TOLERANCE_METRES ||
      unsupportedAscendingSteps !== 0
    ) {
      throw new Error(
        `Elevator carrier drifted: error=${maximumRelativeError.toFixed(4)} m, unsupported=${unsupportedAscendingSteps}.`,
      );
    }

    const firstPlatformY = this.platform.root.position.y;
    const firstPlayerY = this.player.position.y;
    const firstLaserPhase = this.connectedLaser.phaseProgress;

    // Recovery must restore elevator, timers, hazard pattern and player.
    this.recover();

    if (
      this.sequence.state !== 'waitingForRider' ||
      this.sequence.ascentProgress !== 0 ||
      this.sequence.sequenceElapsedSeconds !== 0 ||
      !this.platform.root.position.equals(PLATFORM_START) ||
      Math.abs(
        this.player.position.y - this.checkpointSpawn.y,
      ) > POSITION_TOLERANCE_METRES ||
      this.connectedLaser.sequenceStepIndex !== 0 ||
      this.connectedLaser.sequenceElapsedSeconds !== 0
    ) {
      throw new Error(
        'Elevator checkpoint recovery did not restore authored state.',
      );
    }

    // Replay the same number of fixed steps and compare final state.
    for (let step = 0; step < simulatedSteps; step += 1) {
      this.player.update(
        REGRESSION_FIXED_DELTA_SECONDS,
        0,
        0,
      );
      this.sequence.update(
        REGRESSION_FIXED_DELTA_SECONDS,
        this.player,
      );
      this.laserSystem.update(
        REGRESSION_FIXED_DELTA_SECONDS,
        this.harmlessRegressionTarget,
      );
    }

    if (
      Math.abs(
        this.platform.root.position.y - firstPlatformY,
      ) > 1e-10 ||
      Math.abs(this.player.position.y - firstPlayerY) > 1e-10 ||
      Math.abs(
        this.connectedLaser.phaseProgress - firstLaserPhase,
      ) > 1e-10
    ) {
      throw new Error(
        'Elevator fixed-step replay diverged after reset.',
      );
    }

    return [
      'PASS',
      `${simulatedSteps} fixed steps`,
      `max rider offset error ${maximumRelativeError.toFixed(4)} m`,
      `max player vertical velocity ${maximumVerticalVelocity.toFixed(4)} m/s`,
      'reset/replay matched',
    ].join(' — ');
  }

  getDiagnostics(): ElevatorTestRigDiagnostics {
    return {
      activeCheckpointId: this.checkpoints.activeCheckpointId,
      checkpointGroupId: this.sequence.checkpointGroupId,
      state: this.sequence.state,
      progress: this.sequence.ascentProgress,
      stateElapsedSeconds: this.sequence.stateElapsedSeconds,
      sequenceElapsedSeconds: this.sequence.sequenceElapsedSeconds,
      startDelaySeconds: this.sequence.startDelaySeconds,
      travelDurationSeconds: this.sequence.travelDurationSeconds,
      arrivalDelaySeconds: this.sequence.arrivalDelaySeconds,
      platformY: this.platform.root.position.y,
      displacementY: this.platform.displacement.y,
      riderSupported: this.player.isSupportedBy(
        this.platform.collisionMesh,
      ),
      supportColliderName: this.player.supportColliderName,
      connectedLaserState: this.connectedLaser.sequenceState,
      connectedLaserPhase: this.connectedLaser.phaseProgress,
      recoveryCount: this.recoveryCountValue,
    };
  }

  dispose(): void {
    this.collisionWorld.unregister(this.platform.collisionMesh);
    this.surfaces.unregister(this.platform.collisionMesh);
    this.laserSystem.dispose();
    this.platform.dispose();
    this.puzzleRegistry.clear();
    this.root.removeFromParent();
    this.root.clear();
  }

  private readonly isSpawnSafe = (
    position: THREE.Vector3,
    clearanceRadius: number,
  ): boolean => {
    if (
      !Number.isFinite(clearanceRadius) ||
      clearanceRadius <= 0 ||
      !position.equals(this.checkpointSpawn)
    ) {
      return false;
    }

    // The checkpoint is intentionally tangent to the registered elevator roof.
    // It is isolated from all other authored grey-box collision at x=13,z=-5.
    return true;
  };
}
