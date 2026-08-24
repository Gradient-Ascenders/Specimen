import * as THREE from 'three';

import { Trigger } from '../puzzle/Trigger.ts';

const SCALE_EPSILON = 1e-9;

export type RadioactiveFloorSlimeId = 'bob' | 'goop';

export interface RadioactiveFloorOccupant {
  readonly id: RadioactiveFloorSlimeId;
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly radiusMetres: number;
}

export interface RadioactiveFloorHazardOptions {
  readonly id: string;
  readonly mesh: THREE.Mesh;
  readonly lethalSlimeIds: readonly RadioactiveFloorSlimeId[];
  /** Covers the controller's authored skin width while standing on the mesh. */
  readonly contactPaddingMetres?: number;
  readonly requestRecovery: (slimeId: RadioactiveFloorSlimeId) => void;
}

/**
 * Gameplay detection for an authored radioactive floor mesh.
 *
 * The visual/collision mesh remains the single authored shape. Occupants are
 * transformed into its local box so presentation and lethal contact cannot
 * drift apart when a room is translated. Trigger owns enter latching, which
 * prevents one contact from requesting recovery every fixed step.
 */
export class RadioactiveFloorHazard {
  readonly id: string;
  readonly mesh: THREE.Mesh;
  readonly trigger: Trigger;

  private readonly lethalSlimeIds: ReadonlySet<RadioactiveFloorSlimeId>;
  private readonly contactPaddingMetres: number;
  private readonly localBounds: THREE.Box3;
  private readonly inverseWorld = new THREE.Matrix4();
  private readonly localPosition = new THREE.Vector3();
  private readonly closestPoint = new THREE.Vector3();
  private readonly touchingIds = new Set<RadioactiveFloorSlimeId>();
  private readonly unsubscribeEntered: () => void;
  private failureCountValue = 0;

  constructor(options: RadioactiveFloorHazardOptions) {
    if (!options.id) {
      throw new Error('Radioactive floor hazard IDs cannot be empty.');
    }
    if (options.lethalSlimeIds.length === 0) {
      throw new Error(
        `Radioactive floor hazard "${options.id}" requires a lethal slime.`,
      );
    }
    const contactPaddingMetres = options.contactPaddingMetres ?? 0.05;
    if (
      !Number.isFinite(contactPaddingMetres) ||
      contactPaddingMetres < 0
    ) {
      throw new Error(
        'Radioactive floor contact padding must be non-negative and finite.',
      );
    }

    this.id = options.id;
    this.mesh = options.mesh;
    this.trigger = new Trigger(`${this.id}-contact-trigger`);
    this.lethalSlimeIds = new Set(options.lethalSlimeIds);
    this.contactPaddingMetres = contactPaddingMetres;

    if (!this.mesh.geometry.boundingBox) {
      this.mesh.geometry.computeBoundingBox();
    }
    const bounds = this.mesh.geometry.boundingBox;
    if (!bounds) {
      throw new Error(
        `Radioactive floor hazard "${this.id}" has no geometry bounds.`,
      );
    }
    this.localBounds = bounds.clone();

    this.unsubscribeEntered = this.trigger.events.on(
      'entered',
      ({ occupantId }) => {
        if (
          occupantId !== 'bob' &&
          occupantId !== 'goop'
        ) {
          return;
        }
        this.failureCountValue += 1;
        options.requestRecovery(occupantId);
      },
    );
  }

  get failureCount(): number {
    return this.failureCountValue;
  }

  update(occupants: Iterable<RadioactiveFloorOccupant>): void {
    this.touchingIds.clear();
    this.mesh.updateWorldMatrix(true, false);
    this.inverseWorld.copy(this.mesh.matrixWorld).invert();

    const elements = this.mesh.matrixWorld.elements;
    const scaleX = Math.hypot(elements[0], elements[1], elements[2]);
    const scaleY = Math.hypot(elements[4], elements[5], elements[6]);
    const scaleZ = Math.hypot(elements[8], elements[9], elements[10]);
    const minimumScale = Math.min(scaleX, scaleY, scaleZ);
    if (minimumScale <= SCALE_EPSILON) {
      this.trigger.clear();
      return;
    }

    for (const occupant of occupants) {
      if (!this.lethalSlimeIds.has(occupant.id)) continue;
      if (
        !Number.isFinite(occupant.radiusMetres) ||
        occupant.radiusMetres <= 0
      ) {
        continue;
      }
      if (this.intersects(occupant, minimumScale)) {
        this.touchingIds.add(occupant.id);
      }
    }

    this.trigger.setOccupants(this.touchingIds);
  }

  reset(): void {
    this.trigger.clear();
  }

  dispose(): void {
    this.unsubscribeEntered();
    this.trigger.dispose();
    this.touchingIds.clear();
  }

  private intersects(
    occupant: RadioactiveFloorOccupant,
    minimumScale: number,
  ): boolean {
    this.localPosition
      .set(
        occupant.position.x,
        occupant.position.y,
        occupant.position.z,
      )
      .applyMatrix4(this.inverseWorld);
    this.closestPoint.set(
      THREE.MathUtils.clamp(
        this.localPosition.x,
        this.localBounds.min.x,
        this.localBounds.max.x,
      ),
      THREE.MathUtils.clamp(
        this.localPosition.y,
        this.localBounds.min.y,
        this.localBounds.max.y,
      ),
      THREE.MathUtils.clamp(
        this.localPosition.z,
        this.localBounds.min.z,
        this.localBounds.max.z,
      ),
    );

    const localRadius =
      (occupant.radiusMetres + this.contactPaddingMetres) / minimumScale;
    return (
      this.localPosition.distanceToSquared(this.closestPoint) <=
      localRadius * localRadius
    );
  }
}
