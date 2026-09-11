import * as THREE from 'three';

import type {
  SentinelAttackCancelReason,
  SentinelAttackContext,
} from '../SentinelBossTypes.ts';
import {
  TimedSentinelAttack,
  type TimedSentinelAttackDurations,
} from './SentinelAttack.ts';

const EPSILON = 1e-9;

export interface SentinelShockwaveReadModel {
  readonly radiusMetres: number;
  readonly previousRadiusMetres: number;
  readonly maximumRadiusMetres: number;
  readonly ringThicknessMetres: number;
  readonly waveHeightMetres: number;
}

interface MutableShockwaveReadModel {
  radiusMetres: number;
  previousRadiusMetres: number;
  readonly maximumRadiusMetres: number;
  readonly ringThicknessMetres: number;
  readonly waveHeightMetres: number;
}

export interface SentinelShockwaveAttackOptions {
  readonly id: string;
  readonly origin: THREE.Vector3;
  readonly maximumRadiusMetres: number;
  readonly ringThicknessMetres?: number;
  readonly waveHeightMetres?: number;
  readonly durations: TimedSentinelAttackDurations;
}

/**
 * Expanding, jumpable radial hazard. The swept radial interval is evaluated
 * every fixed step so a fast ring cannot tunnel through the Specimen body.
 */
export class SentinelShockwaveAttack extends TimedSentinelAttack {
  readonly origin: THREE.Vector3;
  readonly shockwaveReadModel: SentinelShockwaveReadModel;

  private readonly activeSeconds: number;
  private readonly shockwaveModel: MutableShockwaveReadModel;
  private activeElapsedSeconds = 0;
  private contactLatched = false;

  constructor(options: SentinelShockwaveAttackOptions) {
    super(options.id, options.durations);
    if (
      !Number.isFinite(options.maximumRadiusMetres) ||
      options.maximumRadiusMetres <= 0
    ) {
      throw new Error('Sentinel shockwave maximum radius must be positive and finite.');
    }
    const ringThicknessMetres = options.ringThicknessMetres ?? 0.45;
    const waveHeightMetres = options.waveHeightMetres ?? 0.65;
    if (
      !Number.isFinite(ringThicknessMetres) ||
      ringThicknessMetres <= 0 ||
      !Number.isFinite(waveHeightMetres) ||
      waveHeightMetres <= 0
    ) {
      throw new Error('Sentinel shockwave thickness/height must be positive and finite.');
    }

    this.origin = options.origin.clone();
    this.activeSeconds = options.durations.activeSeconds;
    this.shockwaveModel = {
      radiusMetres: 0,
      previousRadiusMetres: 0,
      maximumRadiusMetres: options.maximumRadiusMetres,
      ringThicknessMetres,
      waveHeightMetres,
    };
    this.shockwaveReadModel = this.shockwaveModel;
  }

  protected onTelegraphStart(): void {
    this.clearWave();
  }

  protected onActiveStart(): void {
    this.clearWave();
  }

  protected onActiveUpdate(
    deltaSeconds: number,
    context: SentinelAttackContext,
  ): void {
    this.shockwaveModel.previousRadiusMetres =
      this.shockwaveModel.radiusMetres;
    this.activeElapsedSeconds = Math.min(
      this.activeSeconds,
      this.activeElapsedSeconds + deltaSeconds,
    );
    this.shockwaveModel.radiusMetres =
      this.shockwaveModel.maximumRadiusMetres *
      (this.activeElapsedSeconds / this.activeSeconds);

    if (this.contactLatched) return;
    if (!this.intersectsSpecimen(context)) return;
    this.contactLatched = true;
    context.requestFailure();
  }

  protected onRecoveryStart(): void {
    this.shockwaveModel.previousRadiusMetres =
      this.shockwaveModel.radiusMetres;
    this.shockwaveModel.radiusMetres = 0;
  }

  protected onCancel(_reason: SentinelAttackCancelReason): void {
    this.clearWave();
  }

  protected onReset(): void {
    this.clearWave();
  }

  private intersectsSpecimen(context: SentinelAttackContext): boolean {
    const target = context.specimen;
    const currentDx = target.position.x - this.origin.x;
    const currentDz = target.position.z - this.origin.z;
    const previousDx = target.previousPosition.x - this.origin.x;
    const previousDz = target.previousPosition.z - this.origin.z;
    const currentDistance = Math.hypot(currentDx, currentDz);
    const previousDistance = Math.hypot(previousDx, previousDz);

    const targetMinimumRadius =
      Math.min(currentDistance, previousDistance) - target.radiusMetres;
    const targetMaximumRadius =
      Math.max(currentDistance, previousDistance) + target.radiusMetres;
    const halfThickness = this.shockwaveModel.ringThicknessMetres * 0.5;
    const sweptMinimumRadius = Math.max(
      0,
      this.shockwaveModel.previousRadiusMetres - halfThickness,
    );
    const sweptMaximumRadius =
      this.shockwaveModel.radiusMetres + halfThickness;
    if (
      targetMaximumRadius < sweptMinimumRadius - EPSILON ||
      targetMinimumRadius > sweptMaximumRadius + EPSILON
    ) {
      return false;
    }

    // A jump clears the wave once the bottom of the Specimen sphere is above
    // the authored lethal height. This remains gameplay authority independent
    // of whatever ring mesh/shader #134 eventually renders.
    const lowestY = Math.min(
      target.position.y,
      target.previousPosition.y,
    ) - target.radiusMetres;
    return (
      lowestY <=
      this.origin.y + this.shockwaveModel.waveHeightMetres + EPSILON
    );
  }

  private clearWave(): void {
    this.activeElapsedSeconds = 0;
    this.contactLatched = false;
    this.shockwaveModel.radiusMetres = 0;
    this.shockwaveModel.previousRadiusMetres = 0;
  }
}
