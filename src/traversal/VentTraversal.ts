import * as THREE from 'three';

export type VentHandoffMode = 'free' | 'sticky';

/**
 * Authored, orientation-independent data for getting a sphere through a vent
 * opening. The controller owns all motion; this class deliberately contains
 * no scene or player references so it can be reused by any level.
 */
export interface VentTraversalOptions {
  readonly id: string;
  readonly entryCenter: THREE.Vector3;
  /** Direction from the room into the duct. */
  readonly entryDirection: THREE.Vector3;
  /** Point the body is gently drawn toward while clearing the opening. */
  readonly entryTarget: THREE.Vector3;
  /** A point on the plane that proves the body has fully cleared the opening. */
  readonly clearancePoint: THREE.Vector3;
  readonly entryRadiusMetres: number;
  readonly entrySpeedMetresPerSecond: number;
  readonly alignmentStrength: number;
  readonly steeringFactor: number;
  readonly emergencyTimeoutSeconds: number;
  readonly reentryCooldownSeconds: number;
  readonly requiresStickyAttachment?: boolean;
  readonly handoffMode: VentHandoffMode;
  readonly handoffSearchDirection?: THREE.Vector3;
  readonly handoffSearchDistanceMetres?: number;
  readonly requiredHandoffSurfaceTag?: string;
}

export class VentTraversal {
  readonly id: string;
  readonly entryCenter: THREE.Vector3;
  readonly entryDirection: THREE.Vector3;
  readonly entryTarget: THREE.Vector3;
  readonly clearancePoint: THREE.Vector3;
  readonly entryRadiusMetres: number;
  readonly entrySpeedMetresPerSecond: number;
  readonly alignmentStrength: number;
  readonly steeringFactor: number;
  readonly emergencyTimeoutSeconds: number;
  readonly reentryCooldownSeconds: number;
  readonly requiresStickyAttachment: boolean;
  readonly handoffMode: VentHandoffMode;
  readonly handoffSearchDirection: THREE.Vector3 | undefined;
  readonly handoffSearchDistanceMetres: number;
  readonly requiredHandoffSurfaceTag: string | undefined;

  constructor(options: VentTraversalOptions) {
    if (!options.id.trim()) throw new Error('Vent traversal id is required.');
    if (options.entryDirection.lengthSq() <= 1e-8) {
      throw new Error(`${options.id} needs a non-zero entry direction.`);
    }
    for (const [name, value] of [
      ['entryRadiusMetres', options.entryRadiusMetres],
      ['entrySpeedMetresPerSecond', options.entrySpeedMetresPerSecond],
      ['alignmentStrength', options.alignmentStrength],
      ['steeringFactor', options.steeringFactor],
      ['emergencyTimeoutSeconds', options.emergencyTimeoutSeconds],
      ['reentryCooldownSeconds', options.reentryCooldownSeconds],
    ] as const) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${options.id} ${name} must be positive and finite.`);
      }
    }

    this.id = options.id;
    this.entryCenter = options.entryCenter.clone();
    this.entryDirection = options.entryDirection.clone().normalize();
    this.entryTarget = options.entryTarget.clone();
    this.clearancePoint = options.clearancePoint.clone();
    this.entryRadiusMetres = options.entryRadiusMetres;
    this.entrySpeedMetresPerSecond = options.entrySpeedMetresPerSecond;
    this.alignmentStrength = options.alignmentStrength;
    this.steeringFactor = THREE.MathUtils.clamp(options.steeringFactor, 0, 1);
    this.emergencyTimeoutSeconds = options.emergencyTimeoutSeconds;
    this.reentryCooldownSeconds = options.reentryCooldownSeconds;
    this.requiresStickyAttachment = options.requiresStickyAttachment ?? false;
    this.handoffMode = options.handoffMode;
    this.handoffSearchDirection = options.handoffSearchDirection?.clone().normalize();
    this.handoffSearchDistanceMetres = options.handoffSearchDistanceMetres ?? 0;
    this.requiredHandoffSurfaceTag = options.requiredHandoffSurfaceTag;
  }

  containsEntry(position: THREE.Vector3, bodyRadiusMetres: number): boolean {
    return position.distanceToSquared(this.entryCenter) <=
      (this.entryRadiusMetres + bodyRadiusMetres) ** 2;
  }

  hasCleared(position: THREE.Vector3): boolean {
    return (
      (position.x - this.clearancePoint.x) * this.entryDirection.x +
      (position.y - this.clearancePoint.y) * this.entryDirection.y +
      (position.z - this.clearancePoint.z) * this.entryDirection.z
    ) >= 0;
  }
}
