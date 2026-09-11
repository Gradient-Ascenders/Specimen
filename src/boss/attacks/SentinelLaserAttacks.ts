import * as THREE from 'three';

import { LaserHazard } from '../../hazards/LaserHazard.ts';
import { LaserHazardSystem } from '../../hazards/LaserHazardSystem.ts';
import type {
  SentinelAttackCancelReason,
  SentinelAttackContext,
} from '../SentinelBossTypes.ts';
import {
  TimedSentinelAttack,
  type TimedSentinelAttackDurations,
} from './SentinelAttack.ts';

export interface SentinelSweepLaserAttackOptions {
  readonly id: string;
  readonly start: THREE.Vector3;
  readonly end: THREE.Vector3;
  readonly axisWorld: THREE.Vector3;
  readonly fromAngleRadians: number;
  readonly toAngleRadians: number;
  readonly beamRadiusMetres?: number;
  readonly durations: TimedSentinelAttackDurations;
}

export class SentinelSweepLaserAttack extends TimedSentinelAttack {
  readonly root = new THREE.Group();
  readonly hazard: LaserHazard;

  private readonly system: LaserHazardSystem;

  constructor(options: SentinelSweepLaserAttackOptions) {
    super(options.id, options.durations);
    this.root.name = `${options.id}-sentinel-sweep-laser`;
    this.hazard = new LaserHazard({
      id: `${options.id}-beam`,
      start: options.start,
      end: options.end,
      enabled: true,
      beamRadiusMetres: options.beamRadiusMetres,
      timeline: {
        axisWorld: options.axisWorld,
        repeat: false,
        steps: [{
          kind: 'sweep',
          durationSeconds: options.durations.activeSeconds,
          enabled: true,
          fromAngleRadians: options.fromAngleRadians,
          toAngleRadians: options.toAngleRadians,
        }],
      },
    });
    this.system = new LaserHazardSystem({
      id: `${options.id}-system`,
      hazards: [this.hazard],
      requestRecovery: () => {
        this.context?.requestFailure();
      },
    });
    this.root.add(this.system.root);
    this.disableBeams();
  }

  protected onTelegraphStart(): void {
    this.resetBeams();
  }

  protected onActiveStart(): void {
    this.system.reset();
    this.hazard.setCircuitGateEnabled(true);
  }

  protected onActiveUpdate(
    deltaSeconds: number,
    context: SentinelAttackContext,
  ): void {
    this.system.updateTargets(deltaSeconds, [context.specimen]);
  }

  protected onRecoveryStart(): void {
    this.disableBeams();
  }

  protected onCancel(_reason: SentinelAttackCancelReason): void {
    this.resetBeams();
  }

  protected onReset(): void {
    this.resetBeams();
  }

  protected onDispose(): void {
    this.system.dispose();
    this.root.removeFromParent();
    this.root.clear();
  }

  private resetBeams(): void {
    this.system.reset();
    this.disableBeams();
  }

  private disableBeams(): void {
    this.hazard.setCircuitGateEnabled(false);
  }
}

export interface SentinelRotatingLaserAttackOptions {
  readonly id: string;
  readonly origin: THREE.Vector3;
  readonly beamLengthMetres: number;
  readonly beamCount: number;
  readonly axisWorld?: THREE.Vector3;
  readonly rotationRadians: number;
  readonly beamRadiusMetres?: number;
  readonly durations: TimedSentinelAttackDurations;
}

export class SentinelRotatingLaserAttack extends TimedSentinelAttack {
  readonly root = new THREE.Group();
  readonly hazards: readonly LaserHazard[];

  private readonly system: LaserHazardSystem;

  constructor(options: SentinelRotatingLaserAttackOptions) {
    super(options.id, options.durations);
    if (!Number.isInteger(options.beamCount) || options.beamCount < 1) {
      throw new Error('Sentinel rotating laser beamCount must be a positive integer.');
    }
    if (
      !Number.isFinite(options.beamLengthMetres) ||
      options.beamLengthMetres <= 0 ||
      !Number.isFinite(options.rotationRadians)
    ) {
      throw new Error('Sentinel rotating laser geometry must be finite and positive.');
    }

    const axis = (options.axisWorld ?? new THREE.Vector3(0, 1, 0))
      .clone()
      .normalize();
    const baseDirection = new THREE.Vector3(0, 0, options.beamLengthMetres);
    const hazards: LaserHazard[] = [];
    try {
      for (let index = 0; index < options.beamCount; index += 1) {
        const angle = (Math.PI * 2 * index) / options.beamCount;
        const direction = baseDirection
          .clone()
          .applyAxisAngle(axis, angle);
        const end = options.origin.clone().add(direction);
        hazards.push(new LaserHazard({
          id: `${options.id}-beam-${index + 1}`,
          start: options.origin,
          end,
          enabled: true,
          beamRadiusMetres: options.beamRadiusMetres,
          timeline: {
            axisWorld: axis,
            repeat: false,
            steps: [{
              kind: 'sweep',
              durationSeconds: options.durations.activeSeconds,
              enabled: true,
              fromAngleRadians: 0,
              toAngleRadians: options.rotationRadians,
            }],
          },
        }));
      }
      this.system = new LaserHazardSystem({
        id: `${options.id}-system`,
        hazards,
        requestRecovery: () => {
          this.context?.requestFailure();
        },
      });
    } catch (error) {
      for (const hazard of hazards) hazard.dispose();
      throw error;
    }
    this.hazards = hazards;
    this.root.name = `${options.id}-sentinel-rotating-laser`;
    this.root.add(this.system.root);
    this.disableBeams();
  }

  protected onTelegraphStart(): void {
    this.resetBeams();
  }

  protected onActiveStart(): void {
    this.system.reset();
    for (const hazard of this.hazards) {
      hazard.setCircuitGateEnabled(true);
    }
  }

  protected onActiveUpdate(
    deltaSeconds: number,
    context: SentinelAttackContext,
  ): void {
    this.system.updateTargets(deltaSeconds, [context.specimen]);
  }

  protected onRecoveryStart(): void {
    this.disableBeams();
  }

  protected onCancel(_reason: SentinelAttackCancelReason): void {
    this.resetBeams();
  }

  protected onReset(): void {
    this.resetBeams();
  }

  protected onDispose(): void {
    this.system.dispose();
    this.root.removeFromParent();
    this.root.clear();
  }

  private resetBeams(): void {
    this.system.reset();
    this.disableBeams();
  }

  private disableBeams(): void {
    for (const hazard of this.hazards) {
      hazard.setCircuitGateEnabled(false);
    }
  }
}
