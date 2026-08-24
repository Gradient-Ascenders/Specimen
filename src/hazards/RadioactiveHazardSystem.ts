import * as THREE from 'three';

import { EventBus } from '../core/EventBus.ts';
import type { RadiationResponse } from '../slimes/SlimeRoster.ts';

export interface RadioactiveHazardDefinition {
  readonly id: string;
  readonly centre: THREE.Vector3;
  readonly size: THREE.Vector3;
}

export interface RadiationContactTarget {
  readonly id: string;
  readonly kind: 'slime' | 'drone';
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly radiusMetres: number;
  readonly response: RadiationResponse | 'signal';
}

export interface RadiationFailure {
  readonly hazardId: string;
  readonly targetId: string;
}

export interface RadioactiveHazardEvents {
  contacted: {
    readonly hazardId: string;
    readonly targetId: string;
    readonly targetKind: RadiationContactTarget['kind'];
    readonly response: RadiationContactTarget['response'];
  };
}

interface RadioactiveHazardVolume {
  readonly id: string;
  readonly minimum: THREE.Vector3;
  readonly maximum: THREE.Vector3;
}

/**
 * Reusable identity-aware radiation authority.
 *
 * Only explicitly supplied targets participate, so moving platforms and other
 * puzzle geometry may overlap a volume without becoming player victims.
 */
export class RadioactiveHazardSystem {
  readonly events = new EventBus<RadioactiveHazardEvents>();

  private readonly hazards: readonly RadioactiveHazardVolume[];
  private readonly requestFailure: (failure: RadiationFailure) => boolean;
  private readonly activeContacts = new Set<string>();
  private readonly nextContacts = new Set<string>();
  private failureLatched = false;
  private failureRequestCountValue = 0;
  private lastFailureIdValue = 'none';

  constructor(
    definitions: readonly RadioactiveHazardDefinition[],
    requestFailure: (failure: RadiationFailure) => boolean,
  ) {
    if (definitions.length === 0) {
      throw new Error('A radioactive hazard system requires at least one volume.');
    }
    const ids = new Set<string>();
    this.hazards = definitions.map((definition) => {
      if (!definition.id || ids.has(definition.id)) {
        throw new Error('Radioactive hazard IDs must be unique and non-empty.');
      }
      if (
        !Number.isFinite(definition.size.x) || definition.size.x <= 0 ||
        !Number.isFinite(definition.size.y) || definition.size.y <= 0 ||
        !Number.isFinite(definition.size.z) || definition.size.z <= 0
      ) {
        throw new Error('Radioactive hazard sizes must be positive and finite.');
      }
      ids.add(definition.id);
      const halfSize = definition.size.clone().multiplyScalar(0.5);
      return {
        id: definition.id,
        minimum: definition.centre.clone().sub(halfSize),
        maximum: definition.centre.clone().add(halfSize),
      };
    });
    this.requestFailure = requestFailure;
  }

  get failureRequestCount(): number {
    return this.failureRequestCountValue;
  }

  get lastFailureId(): string {
    return this.lastFailureIdValue;
  }

  update(targets: Iterable<RadiationContactTarget>): void {
    this.nextContacts.clear();

    for (const target of targets) {
      if (!target.id || target.radiusMetres <= 0) continue;
      for (const hazard of this.hazards) {
        if (!this.intersects(hazard, target)) continue;

        const contactKey = `${hazard.id}:${target.kind}:${target.id}`;
        this.nextContacts.add(contactKey);
        if (!this.activeContacts.has(contactKey)) {
          this.events.emit('contacted', {
            hazardId: hazard.id,
            targetId: target.id,
            targetKind: target.kind,
            response: target.response,
          });
        }

        if (target.response !== 'lethal' || this.failureLatched) continue;
        const failure = { hazardId: hazard.id, targetId: target.id };
        if (!this.requestFailure(failure)) continue;
        this.failureLatched = true;
        this.failureRequestCountValue += 1;
        this.lastFailureIdValue = `${hazard.id}:${target.id}`;
      }
    }

    this.activeContacts.clear();
    for (const key of this.nextContacts) this.activeContacts.add(key);
  }

  reset(): void {
    this.activeContacts.clear();
    this.nextContacts.clear();
    this.failureLatched = false;
  }

  dispose(): void {
    this.reset();
    this.events.clear();
  }

  private intersects(
    hazard: RadioactiveHazardVolume,
    target: RadiationContactTarget,
  ): boolean {
    const x = THREE.MathUtils.clamp(target.position.x, hazard.minimum.x, hazard.maximum.x);
    const y = THREE.MathUtils.clamp(target.position.y, hazard.minimum.y, hazard.maximum.y);
    const z = THREE.MathUtils.clamp(target.position.z, hazard.minimum.z, hazard.maximum.z);
    const dx = target.position.x - x;
    const dy = target.position.y - y;
    const dz = target.position.z - z;
    return dx * dx + dy * dy + dz * dz <= target.radiusMetres * target.radiusMetres;
  }
}
