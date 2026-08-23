import * as THREE from 'three';

import { EventBus } from '../core/EventBus.ts';
import { DissolveTarget } from './DissolveTarget.ts';

export type BurnStartResult = 'started' | 'already-burning' | 'rejected';

export interface DissolveSystemEvents {
  burnStarted: { readonly target: DissolveTarget };
  burnCompleted: { readonly target: DissolveTarget };
  burnReset: { readonly target: DissolveTarget };
}

export interface DissolveSystemDiagnostics {
  readonly activeBurnCount: number;
  readonly activeBurnTargetIds: readonly string[];
  readonly completedBurnCount: number;
  readonly resetBurnCount: number;
}

/**
 * Fixed-step coordinator for accepted acid burns.
 *
 * Projectile collision decides whether a burn may begin. Once accepted, this
 * coordinator advances the existing DissolveTarget progress independently of
 * aiming, active-slime ownership, or later projectile hits. A target can have
 * at most one active burn, so repeated impacts never multiply its dissolve
 * rate.
 */
export class DissolveSystem {
  readonly events = new EventBus<DissolveSystemEvents>();

  private readonly targets: readonly DissolveTarget[];
  private readonly targetByMesh = new Map<THREE.Mesh, DissolveTarget>();
  private readonly burningTargets = new Set<DissolveTarget>();
  private completedBurnCountValue = 0;
  private resetBurnCountValue = 0;
  private disposed = false;

  constructor(targets: readonly DissolveTarget[]) {
    this.targets = [...targets];

    const targetIds = new Set<string>();
    for (const target of this.targets) {
      if (targetIds.has(target.id)) {
        throw new Error(`Duplicate dissolve target ID "${target.id}".`);
      }
      if (this.targetByMesh.has(target.mesh)) {
        throw new Error(
          `Dissolve mesh "${target.mesh.name || '<unnamed>'}" was registered twice.`,
        );
      }
      targetIds.add(target.id);
      this.targetByMesh.set(target.mesh, target);
    }
  }

  get registeredTargets(): readonly DissolveTarget[] {
    this.assertNotDisposed('read registered targets');
    return this.targets;
  }

  get activeBurnCount(): number {
    return this.burningTargets.size;
  }

  getTargetForMesh(mesh: THREE.Mesh): DissolveTarget | undefined {
    this.assertNotDisposed('resolve a dissolve target');
    return this.targetByMesh.get(mesh);
  }

  startBurn(target: DissolveTarget): BurnStartResult {
    this.assertNotDisposed('start a burn');
    if (!this.targetByMesh.has(target.mesh) || target.completed) {
      return 'rejected';
    }
    if (this.burningTargets.has(target)) return 'already-burning';

    this.burningTargets.add(target);
    this.events.emit('burnStarted', { target });
    return 'started';
  }

  update(deltaSeconds: number): void {
    this.assertNotDisposed('update burns');
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      throw new Error(
        'DissolveSystem deltaSeconds must be positive and finite.',
      );
    }

    for (const target of this.targets) {
      if (!this.burningTargets.has(target)) continue;

      target.advance(deltaSeconds);
      if (!target.completed) continue;

      this.burningTargets.delete(target);
      this.completedBurnCountValue += 1;
      this.events.emit('burnCompleted', { target });
    }
  }

  /** Cancel active reactions before PuzzleRegistry restores target progress. */
  reset(): void {
    this.assertNotDisposed('reset burns');
    for (const target of this.targets) {
      if (!this.burningTargets.delete(target)) continue;
      this.resetBurnCountValue += 1;
      this.events.emit('burnReset', { target });
    }
  }

  getDiagnostics(): DissolveSystemDiagnostics {
    this.assertNotDisposed('read diagnostics');
    return {
      activeBurnCount: this.burningTargets.size,
      activeBurnTargetIds: this.targets
        .filter((target) => this.burningTargets.has(target))
        .map((target) => target.id),
      completedBurnCount: this.completedBurnCountValue,
      resetBurnCount: this.resetBurnCountValue,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.burningTargets.clear();
    this.targetByMesh.clear();
    this.events.clear();
    this.disposed = true;
  }

  private assertNotDisposed(operation: string): void {
    if (this.disposed) {
      throw new Error(`Cannot ${operation} after DissolveSystem disposal.`);
    }
  }
}
