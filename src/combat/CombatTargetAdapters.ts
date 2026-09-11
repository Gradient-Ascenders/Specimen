import * as THREE from 'three';

import type { SecurityDrone } from '../hazards/SecurityDrone.ts';
import type {
  CombatImpact,
  CombatImpactResult,
  CombatTarget,
} from './CombatTargetRegistry.ts';

export type CombatTargetKind =
  | 'ordinary'
  | 'reinforced'
  | 'weak-point';

export interface FixtureCombatTargetSnapshot {
  readonly healthUnits: number;
  readonly enabled: boolean;
  readonly weakPointOpen: boolean;
  readonly destroyed: boolean;
}

export interface FixtureCombatTargetOptions {
  readonly id: string;
  readonly hitMeshes: readonly THREE.Mesh[];
  readonly kind?: CombatTargetKind;
  readonly healthUnits?: number;
  readonly initiallyEnabled?: boolean;
  readonly weakPointInitiallyOpen?: boolean;
  readonly splashAnchor?: THREE.Object3D;
  readonly onDestroyed?: () => void;
  readonly onReset?: () => void;
}

/**
 * Small reset-safe target authority used by development fixtures and as the
 * behaviour core for authored adapters.
 */
export class FixtureCombatTarget implements CombatTarget {
  readonly id: string;
  readonly hitMeshes: readonly THREE.Mesh[];

  private readonly kind: CombatTargetKind;
  private readonly initialHealth: number;
  private readonly initiallyEnabled: boolean;
  private readonly weakPointInitiallyOpen: boolean;
  private readonly splashAnchor: THREE.Object3D;
  private readonly onDestroyed: (() => void) | undefined;
  private readonly onReset: (() => void) | undefined;

  private healthValue: number;
  private enabledValue: boolean;
  private weakPointOpenValue: boolean;
  private destroyedValue = false;

  constructor(options: FixtureCombatTargetOptions) {
    if (!options.id.trim()) throw new Error('Combat fixture ID must be non-empty.');
    if (options.hitMeshes.length === 0) {
      throw new Error('Combat fixture requires at least one hit mesh.');
    }
    const healthUnits = options.healthUnits ?? 1;
    if (!Number.isFinite(healthUnits) || healthUnits <= 0) {
      throw new Error('Combat fixture health must be positive and finite.');
    }

    this.id = options.id;
    this.hitMeshes = [...options.hitMeshes];
    this.kind = options.kind ?? 'ordinary';
    this.initialHealth = healthUnits;
    this.initiallyEnabled = options.initiallyEnabled ?? true;
    this.weakPointInitiallyOpen = options.weakPointInitiallyOpen ?? true;
    this.splashAnchor = options.splashAnchor ?? this.hitMeshes[0]!;
    this.onDestroyed = options.onDestroyed;
    this.onReset = options.onReset;

    this.healthValue = this.initialHealth;
    this.enabledValue = this.initiallyEnabled;
    this.weakPointOpenValue = this.weakPointInitiallyOpen;
  }

  get healthUnits(): number {
    return this.healthValue;
  }

  get destroyed(): boolean {
    return this.destroyedValue;
  }

  get enabled(): boolean {
    return this.enabledValue;
  }

  get weakPointOpen(): boolean {
    return this.weakPointOpenValue;
  }

  setEnabled(enabled: boolean): void {
    this.enabledValue = enabled;
  }

  setWeakPointOpen(open: boolean): void {
    this.weakPointOpenValue = open;
  }

  isCombatActive(): boolean {
    return this.enabledValue && !this.destroyedValue;
  }

  copySplashWorldPosition(target: THREE.Vector3): THREE.Vector3 {
    return this.splashAnchor.getWorldPosition(target);
  }

  applyImpact(impact: CombatImpact): CombatImpactResult {
    if (!this.isCombatActive()) {
      return {
        accepted: false,
        destroyed: this.destroyedValue,
        rejectionReason: 'inactive',
      };
    }

    if (this.kind === 'reinforced') {
      if (impact.kind !== 'direct' || !impact.fullyCharged) {
        return {
          accepted: false,
          destroyed: false,
          rejectionReason: 'armour',
        };
      }
    } else if (this.kind === 'weak-point') {
      if (!this.weakPointOpenValue) {
        return {
          accepted: false,
          destroyed: false,
          rejectionReason: 'weak-point-closed',
        };
      }
      if (impact.kind !== 'direct') {
        return {
          accepted: false,
          destroyed: false,
          rejectionReason: 'splash-not-allowed',
        };
      }
    }

    if (!Number.isFinite(impact.damageUnits) || impact.damageUnits <= 0) {
      return {
        accepted: false,
        destroyed: false,
        rejectionReason: 'invulnerable',
      };
    }

    this.healthValue = Math.max(0, this.healthValue - impact.damageUnits);
    if (this.healthValue === 0 && !this.destroyedValue) {
      this.destroyedValue = true;
      this.onDestroyed?.();
    }

    return {
      accepted: true,
      destroyed: this.destroyedValue,
    };
  }

  captureState(): FixtureCombatTargetSnapshot {
    return {
      healthUnits: this.healthValue,
      enabled: this.enabledValue,
      weakPointOpen: this.weakPointOpenValue,
      destroyed: this.destroyedValue,
    };
  }

  restoreState(snapshot: FixtureCombatTargetSnapshot): void {
    if (
      !Number.isFinite(snapshot.healthUnits) ||
      snapshot.healthUnits < 0 ||
      snapshot.healthUnits > this.initialHealth ||
      typeof snapshot.enabled !== 'boolean' ||
      typeof snapshot.weakPointOpen !== 'boolean' ||
      typeof snapshot.destroyed !== 'boolean'
    ) {
      throw new Error(`Invalid combat target snapshot for "${this.id}".`);
    }

    this.healthValue = snapshot.healthUnits;
    this.enabledValue = snapshot.enabled;
    this.weakPointOpenValue = snapshot.weakPointOpen;
    this.destroyedValue = snapshot.destroyed;

    if (this.destroyedValue) {
      this.onDestroyed?.();
    } else {
      this.onReset?.();
    }
  }

  reset(): void {
    this.healthValue = this.initialHealth;
    this.enabledValue = this.initiallyEnabled;
    this.weakPointOpenValue = this.weakPointInitiallyOpen;
    this.destroyedValue = false;
    this.onReset?.();
  }
}

export interface CombatDroneOwner {
  /** Disable/enable AI and owned firing. */
  setEnabled(enabled: boolean): void;
  /** Remove/restore authoritative body collision. */
  setCollisionEnabled(enabled: boolean): void;
  /** Hide/restore presentation through the owner. */
  setVisible(visible: boolean): void;
  /** Clear all hostile shots owned by this drone. */
  clearOwnedProjectiles(): void;
}

export interface CombatDroneTargetOptions {
  readonly id: string;
  readonly hitMeshes: readonly THREE.Mesh[];
  readonly owner: CombatDroneOwner;
  readonly healthUnits?: number;
  readonly kind?: Exclude<CombatTargetKind, 'weak-point'>;
  readonly splashAnchor?: THREE.Object3D;
}

/**
 * Opt-in drone adapter. Existing SecurityDrone instances are not globally made
 * destructible; room/boss authoring must explicitly wrap compatible owners.
 */
export class CombatDroneTarget extends FixtureCombatTarget {
  constructor(options: CombatDroneTargetOptions) {
    super({
      id: options.id,
      hitMeshes: options.hitMeshes,
      kind: options.kind ?? 'ordinary',
      healthUnits: options.healthUnits ?? 2,
      splashAnchor: options.splashAnchor,
      onDestroyed: () => {
        options.owner.clearOwnedProjectiles();
        options.owner.setEnabled(false);
        options.owner.setCollisionEnabled(false);
        options.owner.setVisible(false);
      },
      onReset: () => {
        options.owner.clearOwnedProjectiles();
        options.owner.setVisible(true);
        options.owner.setCollisionEnabled(true);
        options.owner.setEnabled(true);
      },
    });
  }
}


export interface SecurityDroneCombatTargetOptions {
  readonly drone: SecurityDrone;
  readonly healthUnits?: number;
  readonly kind?: Exclude<CombatTargetKind, 'weak-point'>;
  readonly id?: string;
  readonly hitMeshes?: readonly THREE.Mesh[];
}

/**
 * Concrete opt-in adapter for the existing SecurityDrone owner.
 *
 * Registration remains explicit, so legacy room drones keep their original
 * non-destructible behavior unless room/boss authoring wraps them here.
 */
export class SecurityDroneCombatTarget extends CombatDroneTarget {
  constructor(options: SecurityDroneCombatTargetOptions) {
    const drone = options.drone;
    super({
      id: options.id ?? `${drone.id}-combat-target`,
      hitMeshes: options.hitMeshes ?? [drone.collider],
      healthUnits: options.healthUnits,
      kind: options.kind,
      splashAnchor: drone.root,
      owner: {
        setEnabled: (enabled) => {
          drone.setEnabled(enabled);
        },
        setCollisionEnabled: (enabled) => {
          drone.setCollisionEnabled(enabled);
        },
        setVisible: (visible) => {
          drone.setPresentationVisible(visible);
        },
        clearOwnedProjectiles: () => {
          drone.clearOwnedProjectiles();
        },
      },
    });
  }
}
