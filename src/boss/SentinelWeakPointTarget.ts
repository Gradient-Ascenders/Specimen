import * as THREE from 'three';

import type {
  CombatImpact,
  CombatImpactResult,
  CombatTarget,
} from '../combat/CombatTargetRegistry.ts';

export interface SentinelWeakPointAuthority {
  isWeakPointOpen(): boolean;
  copyWeakPointSplashPosition(target: THREE.Vector3): THREE.Vector3;
  applyWeakPointImpact(impact: CombatImpact): CombatImpactResult;
}

/**
 * Permanently registered boss target.
 *
 * Vulnerability changes authority state instead of unregistering/re-registering
 * hit geometry, keeping targeting identity stable for the whole encounter.
 */
export class SentinelWeakPointTarget implements CombatTarget {
  readonly id: string;
  readonly hitMeshes: readonly THREE.Mesh[];

  private readonly authority: SentinelWeakPointAuthority;

  constructor(options: {
    readonly id?: string;
    readonly hitMeshes: readonly THREE.Mesh[];
    readonly authority: SentinelWeakPointAuthority;
  }) {
    this.id = options.id ?? 'sentinel-weak-point';
    if (!this.id.trim()) {
      throw new Error('Sentinel weak-point target ID must be non-empty.');
    }
    if (options.hitMeshes.length === 0) {
      throw new Error('Sentinel weak point requires hit geometry.');
    }
    this.hitMeshes = [...options.hitMeshes];
    this.authority = options.authority;
  }

  isCombatActive(): boolean {
    // Keep closed armour hittable so gameplay/presentation can report a
    // deliberate weak-point-closed rejection instead of becoming a world hit.
    return true;
  }

  copySplashWorldPosition(target: THREE.Vector3): THREE.Vector3 {
    return this.authority.copyWeakPointSplashPosition(target);
  }

  applyImpact(impact: CombatImpact): CombatImpactResult {
    return this.authority.applyWeakPointImpact(impact);
  }
}
