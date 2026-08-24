import * as THREE from 'three';

import {
  LaserHazard,
  type LaserContactTarget,
} from './LaserHazard.ts';

export interface LaserHazardSystemOptions {
  readonly id: string;
  readonly hazards: readonly LaserHazard[];
  /**
   * Called once when the target enters any enabled beam.
   *
   * Level integration should route this to:
   * `checkpointManager.recover(playerController)`.
   */
  readonly requestRecovery: (
    hazard: LaserHazard,
    target: LaserContactTarget,
  ) => void;
}

/**
 * Fixed-step owner for a related authored laser set.
 *
 * Register this object once with PuzzleRegistry in the active checkpoint group.
 * Its reset method restores every beam in authored order.
 */
export class LaserHazardSystem {
  readonly root = new THREE.Group();
  readonly id: string;

  private readonly hazardsValue: readonly LaserHazard[];
  private readonly requestRecovery: (
    hazard: LaserHazard,
    target: LaserContactTarget,
  ) => void;

  private contactLatched = false;
  private recoveryRequestCountValue = 0;
  private lastFailureHazardIdValue = 'none';
  private lastFailureTargetIdValue = 'none';

  constructor(options: LaserHazardSystemOptions) {
    if (!options.id) {
      throw new Error('Laser hazard system IDs cannot be empty.');
    }
    if (options.hazards.length === 0) {
      throw new Error(
        `Laser hazard system "${options.id}" requires at least one beam.`,
      );
    }

    const ids = new Set<string>();
    for (const hazard of options.hazards) {
      if (ids.has(hazard.id)) {
        throw new Error(
          `Laser hazard system "${options.id}" contains duplicate beam ID "${hazard.id}".`,
        );
      }
      ids.add(hazard.id);
    }

    this.id = options.id;
    this.root.name = `${this.id}-laser-hazard-system`;
    this.hazardsValue = [...options.hazards];
    this.requestRecovery = options.requestRecovery;

    for (const hazard of this.hazardsValue) {
      this.root.add(hazard.root);
    }
  }

  get hazards(): readonly LaserHazard[] {
    return this.hazardsValue;
  }

  get recoveryRequestCount(): number {
    return this.recoveryRequestCountValue;
  }

  get lastFailureHazardId(): string {
    return this.lastFailureHazardIdValue;
  }

  get lastFailureTargetId(): string {
    return this.lastFailureTargetIdValue;
  }

  /**
   * Advance every authored beam, then perform one group-level lethal-contact
   * check. The first contact wins; crossing beams cannot request duplicate
   * checkpoint recoveries in the same fixed step.
   */
  update(
    deltaSeconds: number,
    target: LaserContactTarget,
  ): void {
    this.advanceHazards(deltaSeconds);

    let touchingHazard: LaserHazard | undefined;
    for (const hazard of this.hazardsValue) {
      if (!hazard.intersects(target)) continue;
      touchingHazard = hazard;
      break;
    }
    this.resolveContact(touchingHazard, target);
  }

  /**
   * Advance each beam once, then evaluate every persistent target against the
   * resulting authoritative pose. Hazard order and target order are stable;
   * the first contact owns the single recovery request for this fixed step.
   */
  updateTargets(
    deltaSeconds: number,
    targets: readonly LaserContactTarget[],
  ): void {
    this.advanceHazards(deltaSeconds);

    let touchingHazard: LaserHazard | undefined;
    let touchingTarget: LaserContactTarget | undefined;
    for (const hazard of this.hazardsValue) {
      for (const target of targets) {
        if (!hazard.intersects(target)) continue;
        touchingHazard = hazard;
        touchingTarget = target;
        break;
      }
      if (touchingHazard) break;
    }
    this.resolveContact(touchingHazard, touchingTarget);
  }

  private advanceHazards(deltaSeconds: number): void {
    for (const hazard of this.hazardsValue) {
      hazard.update(deltaSeconds);
    }
  }

  private resolveContact(
    touchingHazard: LaserHazard | undefined,
    touchingTarget: LaserContactTarget | undefined,
  ): void {
    if (!touchingHazard || !touchingTarget) {
      this.contactLatched = false;
      return;
    }

    if (this.contactLatched) return;

    this.contactLatched = true;
    this.recoveryRequestCountValue += 1;
    this.lastFailureHazardIdValue = touchingHazard.id;
    this.lastFailureTargetIdValue = touchingTarget.id ?? 'anonymous';

    // Checkpoint recovery may synchronously reset this system through its
    // PuzzleRegistry group before recovering the player. Do no further work
    // after the callback in this fixed step.
    this.requestRecovery(touchingHazard, touchingTarget);
  }

  /** Restore authored beam state and re-arm lethal contact detection. */
  reset(): void {
    for (const hazard of this.hazardsValue) hazard.reset();
    this.contactLatched = false;
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const hazard of this.hazardsValue) hazard.dispose();
    this.root.clear();
  }
}
