import * as THREE from 'three';

import { Trigger } from '../puzzle/Trigger.ts';

export interface TriggerContactTarget {
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly radiusMetres: number;
}

export interface LevelTriggerVolumeOptions {
  readonly id: string;
  readonly centre: THREE.Vector3;
  readonly size: THREE.Vector3;
}

const PLAYER_OCCUPANT_ID = 'player-slime';
const OCCUPIED = [PLAYER_OCCUPANT_ID] as const;
const EMPTY: readonly string[] = [];

/**
 * Authored, non-solid trigger volume for one spherical player body.
 *
 * Trigger continues to own enter/exit event semantics. This adapter only
 * supplies its fixed-step occupancy snapshot using sphere-versus-AABB contact.
 */
export class LevelTriggerVolume {
  readonly trigger: Trigger;
  readonly centre: THREE.Vector3;
  readonly size: THREE.Vector3;

  private readonly minimum = new THREE.Vector3();
  private readonly maximum = new THREE.Vector3();

  constructor(options: LevelTriggerVolumeOptions) {
    if (!options.id) throw new Error('Level trigger IDs cannot be empty.');
    if (
      !Number.isFinite(options.size.x) ||
      !Number.isFinite(options.size.y) ||
      !Number.isFinite(options.size.z) ||
      options.size.x <= 0 ||
      options.size.y <= 0 ||
      options.size.z <= 0
    ) {
      throw new Error('Level trigger size must contain positive finite values.');
    }

    this.trigger = new Trigger(options.id);
    this.centre = options.centre.clone();
    this.size = options.size.clone();

    const halfSize = this.size.clone().multiplyScalar(0.5);
    this.minimum.copy(this.centre).sub(halfSize);
    this.maximum.copy(this.centre).add(halfSize);
  }

  get id(): string {
    return this.trigger.id;
  }

  get occupied(): boolean {
    return this.trigger.occupied;
  }

  update(target: TriggerContactTarget): void {
    this.trigger.setOccupants(
      this.intersects(target) ? OCCUPIED : EMPTY,
    );
  }

  reset(): void {
    this.trigger.clear();
  }

  dispose(): void {
    this.trigger.dispose();
  }

  private intersects(target: TriggerContactTarget): boolean {
    const x = THREE.MathUtils.clamp(
      target.position.x,
      this.minimum.x,
      this.maximum.x,
    );
    const y = THREE.MathUtils.clamp(
      target.position.y,
      this.minimum.y,
      this.maximum.y,
    );
    const z = THREE.MathUtils.clamp(
      target.position.z,
      this.minimum.z,
      this.maximum.z,
    );

    const dx = target.position.x - x;
    const dy = target.position.y - y;
    const dz = target.position.z - z;
    return dx * dx + dy * dy + dz * dz <=
      target.radiusMetres * target.radiusMetres;
  }
}
