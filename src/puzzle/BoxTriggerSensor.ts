import * as THREE from 'three';

import type { Trigger } from './Trigger.ts';

export interface SphereTriggerOccupant {
  readonly id: string;
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly radiusMetres: number;
}

/**
 * Physics-adapter for the existing physics-agnostic Trigger.
 *
 * It evaluates every supplied persistent body, not only the player-controlled
 * one. This is what lets an inactive slime continue occupying a pressure plate.
 */
export class BoxTriggerSensor {
  private readonly centre = new THREE.Vector3();
  private readonly halfSize = new THREE.Vector3();
  private readonly closestPoint = new THREE.Vector3();
  private readonly occupantIds = new Set<string>();

  constructor(
    centre: THREE.Vector3,
    size: THREE.Vector3,
  ) {
    if (
      !Number.isFinite(size.x) ||
      !Number.isFinite(size.y) ||
      !Number.isFinite(size.z) ||
      size.x <= 0 ||
      size.y <= 0 ||
      size.z <= 0
    ) {
      throw new Error('BoxTriggerSensor size must be positive and finite.');
    }

    this.centre.copy(centre);
    this.halfSize.copy(size).multiplyScalar(0.5);
  }

  setCentre(centre: THREE.Vector3): void {
    this.centre.copy(centre);
  }

  update(
    trigger: Trigger,
    occupants: Iterable<SphereTriggerOccupant>,
  ): void {
    this.occupantIds.clear();

    for (const occupant of occupants) {
      if (!occupant.id || occupant.radiusMetres <= 0) continue;
      if (this.intersectsSphere(occupant)) {
        this.occupantIds.add(occupant.id);
      }
    }

    trigger.setOccupants(this.occupantIds);
  }

  private intersectsSphere(occupant: SphereTriggerOccupant): boolean {
    this.closestPoint.set(
      THREE.MathUtils.clamp(
        occupant.position.x,
        this.centre.x - this.halfSize.x,
        this.centre.x + this.halfSize.x,
      ),
      THREE.MathUtils.clamp(
        occupant.position.y,
        this.centre.y - this.halfSize.y,
        this.centre.y + this.halfSize.y,
      ),
      THREE.MathUtils.clamp(
        occupant.position.z,
        this.centre.z - this.halfSize.z,
        this.centre.z + this.halfSize.z,
      ),
    );

    const dx = occupant.position.x - this.closestPoint.x;
    const dy = occupant.position.y - this.closestPoint.y;
    const dz = occupant.position.z - this.closestPoint.z;
    return (
      dx * dx + dy * dy + dz * dz <=
      occupant.radiusMetres * occupant.radiusMetres
    );
  }
}
