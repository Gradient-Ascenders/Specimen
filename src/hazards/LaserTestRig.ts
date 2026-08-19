import * as THREE from 'three';

import {
  type CheckpointRecoveryTarget,
  CheckpointManager,
} from '../puzzle/Checkpoints';
import { PuzzleRegistry } from '../puzzle/PuzzleRegistry';
import {
  LaserHazard,
  type LaserContactTarget,
} from './LaserHazard';
import { LaserHazardSystem } from './LaserHazardSystem';

const LASER_TEST_GROUP_ID = 'laser-test-room3';
const LASER_TEST_CHECKPOINT_ID = 'laser-test-room3-entry';
const REGRESSION_FIXED_DELTA_SECONDS = 1 / 60;
const VECTOR_EPSILON_SQ = 1e-12;

interface LaserTestPlayer
  extends LaserContactTarget,
    CheckpointRecoveryTarget {}

interface HazardSnapshot {
  readonly id: string;
  readonly enabled: boolean;
  readonly sequenceState: string;
  readonly stepIndex: number;
  readonly elapsedSeconds: number;
  readonly phaseProgress: number;
  readonly start: readonly [number, number, number];
  readonly end: readonly [number, number, number];
}

export interface LaserTestRigOptions {
  readonly player: LaserTestPlayer;
  readonly checkpointSpawn: THREE.Vector3;
}

export interface LaserTestRigDiagnostics {
  readonly activeCheckpointId: string;
  readonly recoveryRequestCount: number;
  readonly lastFailureHazardId: string;
  readonly staticEnabled: boolean;
  readonly staticStart: readonly [number, number, number];
  readonly staticEnd: readonly [number, number, number];
  readonly singleSweepState: string;
  readonly singleSweepPhase: number;
  readonly alternatingPhaseA: number;
  readonly alternatingPhaseB: number;
  readonly crossingPhaseA: number;
  readonly crossingPhaseB: number;
  readonly finalBurstState: string;
  readonly finalBurstPhase: number;
}

/**
 * Development-only composition used to prove #65 independently from Level 1
 * room art. It deliberately uses the real checkpoint/puzzle reset contracts.
 */
export class LaserTestRig {
  readonly root = new THREE.Group();

  private readonly player: LaserTestPlayer;
  private readonly checkpointSpawn: THREE.Vector3;
  private readonly puzzleRegistry = new PuzzleRegistry();
  private readonly checkpoints: CheckpointManager;

  private readonly staticLaser: LaserHazard;
  private readonly singleSweep: LaserHazard;
  private readonly alternatingA: LaserHazard;
  private readonly alternatingB: LaserHazard;
  private readonly crossingA: LaserHazard;
  private readonly crossingB: LaserHazard;
  private readonly finalBurst: LaserHazard;
  private readonly laserSystem: LaserHazardSystem;

  private readonly regressionPosition = new THREE.Vector3(1000, 1000, 1000);
  private readonly regressionTarget: LaserContactTarget;

  constructor(options: LaserTestRigOptions) {
    this.player = options.player;
    this.checkpointSpawn = options.checkpointSpawn.clone();
    this.root.name = 'laser-hazard-development-rig';

    // Room 3 baseline: one isolated, static beam across the authored floor.
    // The main player spawns at z=5 and can inspect the beam at z=3.6 before
    // moving forward into it.
    this.staticLaser = new LaserHazard({
      id: 'room3-first-static-laser',
      start: new THREE.Vector3(-7.4, 0.62, 3.6),
      end: new THREE.Vector3(-0.6, 0.62, 3.6),
      enabled: true,
      beamRadiusMetres: 0.055,
    });

    // Pattern showcase is placed above ordinary traversal so it remains
    // readable without interfering with the static Room 3 failure lesson.
    this.singleSweep = new LaserHazard({
      id: 'room4-single-sweep-demo',
      start: new THREE.Vector3(-6.8, 4.1, 0.8),
      end: new THREE.Vector3(-3.3, 4.1, 0.8),
      timeline: {
        axisWorld: new THREE.Vector3(0, 1, 0),
        repeat: false,
        steps: [
          {
            kind: 'hold',
            durationSeconds: 0.45,
            enabled: false,
            angleRadians: -0.55,
          },
          {
            kind: 'sweep',
            durationSeconds: 1.0,
            enabled: true,
            fromAngleRadians: -0.55,
            toAngleRadians: 0.55,
          },
          {
            kind: 'hold',
            durationSeconds: 0.35,
            enabled: false,
            angleRadians: 0.55,
          },
        ],
      },
    });

    this.alternatingA = new LaserHazard({
      id: 'room4-alternating-a-demo',
      start: new THREE.Vector3(-2.7, 4.4, 1.5),
      end: new THREE.Vector3(0.3, 4.4, 1.5),
      timeline: {
        axisWorld: new THREE.Vector3(0, 1, 0),
        repeat: true,
        steps: [
          {
            kind: 'sweep',
            durationSeconds: 0.9,
            enabled: true,
            fromAngleRadians: -0.45,
            toAngleRadians: 0.45,
          },
          {
            kind: 'hold',
            durationSeconds: 0.9,
            enabled: false,
            angleRadians: 0.45,
          },
        ],
      },
    });

    this.alternatingB = new LaserHazard({
      id: 'room4-alternating-b-demo',
      start: new THREE.Vector3(-2.7, 4.75, 0.8),
      end: new THREE.Vector3(0.3, 4.75, 0.8),
      timeline: {
        axisWorld: new THREE.Vector3(0, 1, 0),
        repeat: true,
        steps: [
          {
            kind: 'hold',
            durationSeconds: 0.9,
            enabled: false,
            angleRadians: -0.45,
          },
          {
            kind: 'sweep',
            durationSeconds: 0.9,
            enabled: true,
            fromAngleRadians: 0.45,
            toAngleRadians: -0.45,
          },
        ],
      },
    });

    this.crossingA = new LaserHazard({
      id: 'room4-crossing-a-demo',
      start: new THREE.Vector3(2.0, 4.2, 1.2),
      end: new THREE.Vector3(5.2, 4.2, 1.2),
      timeline: {
        axisWorld: new THREE.Vector3(0, 1, 0),
        repeat: true,
        steps: [
          {
            kind: 'sweep',
            durationSeconds: 1.2,
            enabled: true,
            fromAngleRadians: -0.62,
            toAngleRadians: 0.62,
          },
          {
            kind: 'sweep',
            durationSeconds: 1.2,
            enabled: true,
            fromAngleRadians: 0.62,
            toAngleRadians: -0.62,
          },
        ],
      },
    });

    this.crossingB = new LaserHazard({
      id: 'room4-crossing-b-demo',
      start: new THREE.Vector3(5.2, 4.55, 1.2),
      end: new THREE.Vector3(2.0, 4.55, 1.2),
      timeline: {
        axisWorld: new THREE.Vector3(0, 1, 0),
        repeat: true,
        steps: [
          {
            kind: 'sweep',
            durationSeconds: 1.2,
            enabled: true,
            fromAngleRadians: 0.62,
            toAngleRadians: -0.62,
          },
          {
            kind: 'sweep',
            durationSeconds: 1.2,
            enabled: true,
            fromAngleRadians: -0.62,
            toAngleRadians: 0.62,
          },
        ],
      },
    });

    this.finalBurst = new LaserHazard({
      id: 'room4-final-burst-demo',
      start: new THREE.Vector3(6.4, 4.15, 1.2),
      end: new THREE.Vector3(9.2, 4.15, 1.2),
      timeline: {
        axisWorld: new THREE.Vector3(0, 1, 0),
        repeat: false,
        steps: [
          {
            kind: 'hold',
            durationSeconds: 0.35,
            enabled: false,
            angleRadians: 0,
          },
          {
            kind: 'hold',
            durationSeconds: 0.12,
            enabled: true,
            angleRadians: 0,
          },
          {
            kind: 'hold',
            durationSeconds: 0.10,
            enabled: false,
            angleRadians: 0,
          },
          {
            kind: 'hold',
            durationSeconds: 0.12,
            enabled: true,
            angleRadians: 0,
          },
          {
            kind: 'hold',
            durationSeconds: 0.10,
            enabled: false,
            angleRadians: 0,
          },
          {
            kind: 'hold',
            durationSeconds: 0.12,
            enabled: true,
            angleRadians: 0,
          },
          {
            kind: 'hold',
            durationSeconds: 0.25,
            enabled: false,
            angleRadians: 0,
          },
        ],
      },
    });

    this.laserSystem = new LaserHazardSystem({
      id: 'laser-development-runtime',
      hazards: [
        this.staticLaser,
        this.singleSweep,
        this.alternatingA,
        this.alternatingB,
        this.crossingA,
        this.crossingB,
        this.finalBurst,
      ],
      requestRecovery: () => {
        this.checkpoints.recover(this.player);
      },
    });

    this.root.add(this.laserSystem.root);
    this.puzzleRegistry.register(
      'laser-development-runtime',
      this.laserSystem,
      LASER_TEST_GROUP_ID,
    );

    this.checkpoints = new CheckpointManager(
      {
        id: LASER_TEST_CHECKPOINT_ID,
        spawnPosition: this.checkpointSpawn,
        puzzleGroupId: LASER_TEST_GROUP_ID,
        clearanceRadius: this.player.radiusMetres,
      },
      this.isCheckpointSpawnSafe,
      this.puzzleRegistry,
    );

    this.regressionTarget = {
      position: this.regressionPosition,
      radiusMetres: this.player.radiusMetres,
    };
  }

  update(deltaSeconds: number): void {
    this.laserSystem.update(deltaSeconds, this.player);
  }

  get activeCheckpointId(): string {
    return this.checkpoints.activeCheckpointId;
  }

  get recoveryRequestCount(): number {
    return this.laserSystem.recoveryRequestCount;
  }

  get lastFailureHazardId(): string {
    return this.laserSystem.lastFailureHazardId;
  }

  toggleStaticLaser(): boolean {
    this.staticLaser.setEnabled(!this.staticLaser.enabled);
    return this.staticLaser.enabled;
  }

  resetSequences(): void {
    this.puzzleRegistry.resetGroup(LASER_TEST_GROUP_ID);
  }

  /**
   * Full harness reset through the same checkpoint path used after a laser hit.
   * This restores the active puzzle group, then clears/repositions the player.
   */
  reset(): void {
    this.checkpoints.reset();
    this.checkpoints.recover(this.player);
  }

  /**
   * Replays the actual authored patterns twice from reset at ten different
   * fixed-step offsets and verifies bit-for-bit authored state within a small
   * floating tolerance.
   */
  runDeterminismRegression(): string {
    this.resetSequences();
    const authoredState = this.captureSnapshots();

    for (let cycle = 0; cycle < 10; cycle += 1) {
      // Explicitly disturb a mutable static property so reset coverage includes
      // the enabled state as well as pattern transforms and timers.
      this.staticLaser.setEnabled(false);

      const steps = 19 + cycle * 23;
      this.simulateRegressionSteps(steps);
      this.resetSequences();
      this.assertSnapshotsEqual(
        authoredState,
        this.captureSnapshots(),
        `authored reset cycle ${cycle + 1}`,
      );

      this.simulateRegressionSteps(steps);
      const firstReplay = this.captureSnapshots();

      this.resetSequences();
      this.simulateRegressionSteps(steps);
      const secondReplay = this.captureSnapshots();

      this.assertSnapshotsEqual(
        firstReplay,
        secondReplay,
        `deterministic replay cycle ${cycle + 1}`,
      );

      this.resetSequences();
    }

    return 'PASS — 10 reset cycles and fixed-step pattern replays matched';
  }

  getDiagnostics(): LaserTestRigDiagnostics {
    return {
      activeCheckpointId: this.activeCheckpointId,
      recoveryRequestCount: this.recoveryRequestCount,
      lastFailureHazardId: this.lastFailureHazardId,
      staticEnabled: this.staticLaser.enabled,
      staticStart: [
        this.staticLaser.start.x,
        this.staticLaser.start.y,
        this.staticLaser.start.z,
      ],
      staticEnd: [
        this.staticLaser.end.x,
        this.staticLaser.end.y,
        this.staticLaser.end.z,
      ],
      singleSweepState: this.singleSweep.sequenceState,
      singleSweepPhase: this.singleSweep.phaseProgress,
      alternatingPhaseA: this.alternatingA.phaseProgress,
      alternatingPhaseB: this.alternatingB.phaseProgress,
      crossingPhaseA: this.crossingA.phaseProgress,
      crossingPhaseB: this.crossingB.phaseProgress,
      finalBurstState: this.finalBurst.sequenceState,
      finalBurstPhase: this.finalBurst.phaseProgress,
    };
  }

  dispose(): void {
    this.laserSystem.dispose();
    this.puzzleRegistry.clear();
    this.root.removeFromParent();
    this.root.clear();
  }

  private readonly isCheckpointSpawnSafe = (
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

    // The grey-box spawn is already an authored collision-safe body spawn.
    // Additionally prove that the Room 3 lesson beam does not overlap it.
    return !this.staticLaser.intersects({
      position,
      radiusMetres: clearanceRadius,
    });
  };

  private simulateRegressionSteps(steps: number): void {
    for (let step = 0; step < steps; step += 1) {
      this.laserSystem.update(
        REGRESSION_FIXED_DELTA_SECONDS,
        this.regressionTarget,
      );
    }
  }

  private captureSnapshots(): readonly HazardSnapshot[] {
    return this.laserSystem.hazards.map((hazard) => ({
      id: hazard.id,
      enabled: hazard.enabled,
      sequenceState: hazard.sequenceState,
      stepIndex: hazard.sequenceStepIndex,
      elapsedSeconds: hazard.sequenceElapsedSeconds,
      phaseProgress: hazard.phaseProgress,
      start: [hazard.start.x, hazard.start.y, hazard.start.z] as const,
      end: [hazard.end.x, hazard.end.y, hazard.end.z] as const,
    }));
  }

  private assertSnapshotsEqual(
    expected: readonly HazardSnapshot[],
    actual: readonly HazardSnapshot[],
    label: string,
  ): void {
    if (expected.length !== actual.length) {
      throw new Error(
        `Laser regression ${label} changed the authored beam count.`,
      );
    }

    for (let index = 0; index < expected.length; index += 1) {
      const left = expected[index];
      const right = actual[index];

      if (
        left.id !== right.id ||
        left.enabled !== right.enabled ||
        left.sequenceState !== right.sequenceState ||
        left.stepIndex !== right.stepIndex ||
        Math.abs(left.elapsedSeconds - right.elapsedSeconds) > 1e-10 ||
        Math.abs(left.phaseProgress - right.phaseProgress) > 1e-10 ||
        !this.tupleAlmostEqual(left.start, right.start) ||
        !this.tupleAlmostEqual(left.end, right.end)
      ) {
        throw new Error(
          `Laser regression ${label} diverged for "${left.id}".`,
        );
      }
    }
  }

  private tupleAlmostEqual(
    left: readonly [number, number, number],
    right: readonly [number, number, number],
  ): boolean {
    const dx = left[0] - right[0];
    const dy = left[1] - right[1];
    const dz = left[2] - right[2];
    return dx * dx + dy * dy + dz * dz <= VECTOR_EPSILON_SQ;
  }
}
