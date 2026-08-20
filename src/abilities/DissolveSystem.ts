import type { SlimeManager } from '../slimes/SlimeManager.ts';
import { DissolveTarget } from './DissolveTarget.ts';

export interface DissolveBody {
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly radiusMetres: number;
}

export interface DissolveSystemDiagnostics {
  readonly permitted: boolean;
  readonly contactTargetId: string;
  readonly activeTargetId: string;
  readonly progress: number;
  readonly collisionEnabled: boolean;
  readonly completed: boolean;
  readonly completionCount: number;
}

/**
 * Ability coordinator for authored soluble geometry.
 *
 * SlimeManager remains authoritative for who may invoke dissolve. A target must
 * be contacted to begin an activation. Once an activation has begun, holding
 * the action may carry it through the collision-disable threshold even though
 * the collider itself has disappeared.
 */
export class DissolveSystem<Body extends DissolveBody> {
  private activeTarget: DissolveTarget | undefined;
  private contactTarget: DissolveTarget | undefined;

  constructor(
    private readonly slimeManager: SlimeManager<Body>,
    private readonly targets: readonly DissolveTarget[],
  ) {}

  update(deltaSeconds: number, activationHeld: boolean): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      throw new Error(
        'DissolveSystem deltaSeconds must be positive and finite.',
      );
    }

    this.contactTarget = undefined;

    const canDissolve =
      this.slimeManager.canActiveUseAbility('dissolve');
    const activeBody = this.slimeManager.activeBody;

    if (!canDissolve || !activeBody) {
      this.activeTarget = undefined;
      return;
    }

    for (const target of this.targets) {
      if (
        !target.completed &&
        target.isWithinActivationRange(
          activeBody.position,
          activeBody.radiusMetres,
        )
      ) {
        this.contactTarget = target;
        break;
      }
    }

    if (!activationHeld) {
      this.activeTarget = undefined;
      return;
    }

    if (!this.activeTarget || this.activeTarget.completed) {
      this.activeTarget = this.contactTarget;
    }

    if (!this.activeTarget) return;

    // Use the manager's invocation gate rather than bypassing configuration.
    // If active ownership/capability changes, the callback cannot execute.
    const invoked = this.slimeManager.invokeActiveAbility(
      'dissolve',
      () => {
        this.activeTarget?.advance(deltaSeconds);
      },
    );

    if (!invoked || this.activeTarget.completed) {
      this.activeTarget = undefined;
    }
  }

  getDiagnostics(): DissolveSystemDiagnostics {
    const target = this.activeTarget ?? this.contactTarget ?? this.targets[0];

    return {
      permitted: this.slimeManager.canActiveUseAbility('dissolve'),
      contactTargetId: this.contactTarget?.id ?? 'none',
      activeTargetId: this.activeTarget?.id ?? 'none',
      progress: target?.progress ?? 0,
      collisionEnabled: target?.collisionEnabled ?? false,
      completed: target?.completed ?? false,
      completionCount: target?.completionCount ?? 0,
    };
  }

  dispose(): void {
    this.activeTarget = undefined;
    this.contactTarget = undefined;
  }
}
