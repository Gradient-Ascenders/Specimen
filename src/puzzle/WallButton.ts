import * as THREE from 'three';

import { EventBus } from '../core/EventBus.ts';
import {
  ColliderTransformMode,
  type CollisionWorld,
} from '../physics/CollisionWorld.ts';
import type { SurfaceRegistry } from '../physics/SurfaceRegistry.ts';
import { Trigger } from './Trigger.ts';

export interface WallButtonBody {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly radiusMetres: number;
  readonly attached: boolean;
  readonly supportCollider: THREE.Mesh | null;
}

export interface WallButtonOccupant<Body extends WallButtonBody = WallButtonBody> {
  readonly id: string;
  readonly body: Body;
}

export interface WallButtonEvents {
  changed: {
    readonly button: WallButton;
    readonly pressed: boolean;
    readonly occupantId: string | undefined;
  };
  pressed: { readonly button: WallButton; readonly occupantId: string };
  released: { readonly button: WallButton; readonly occupantId: string };
  reset: { readonly button: WallButton };
}

export interface WallButtonOptions<Body extends WallButtonBody = WallButtonBody> {
  readonly id: string;
  readonly collisionWorld: CollisionWorld;
  readonly surfaceRegistry: SurfaceRegistry;
  readonly position: THREE.Vector3;
  readonly rotation?: THREE.Euler;
  readonly surfaceSize: THREE.Vector3;
  readonly contactCentre: THREE.Vector3;
  readonly contactSize: THREE.Vector3;
  readonly requiredOccupant: WallButtonOccupant<Body>;
}

/**
 * Identity- and attachment-aware wall hold button.
 *
 * Spatial overlap is necessary but never sufficient: the configured body must
 * also be attached to this exact registered sticky surface. Active selection
 * is deliberately absent from the contract.
 */
export class WallButton<Body extends WallButtonBody = WallButtonBody> {
  readonly root = new THREE.Group();
  readonly events = new EventBus<WallButtonEvents>();
  readonly trigger: Trigger;
  readonly surfaceMesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  readonly id: string;

  private readonly collisionWorld: CollisionWorld;
  private readonly surfaceRegistry: SurfaceRegistry;
  private readonly requiredOccupant: WallButtonOccupant<Body>;
  private readonly contactCentre: THREE.Vector3;
  private readonly contactHalfSize: THREE.Vector3;
  private readonly localBodyPosition = new THREE.Vector3();
  private readonly inverseRootMatrix = new THREE.Matrix4();
  private readonly validOccupants = new Set<string>();
  private readonly pad: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  private readonly padRestX: number;
  private readonly unsubscribeOccupancy: () => void;
  private pressedValue = false;
  private occupantIdValue: string | undefined;
  private enabledValue = false;
  private disposed = false;

  constructor(options: WallButtonOptions<Body>) {
    validateOptions(options);
    this.id = options.id;
    this.collisionWorld = options.collisionWorld;
    this.surfaceRegistry = options.surfaceRegistry;
    this.requiredOccupant = options.requiredOccupant;
    this.contactCentre = options.contactCentre.clone();
    this.contactHalfSize = options.contactSize.clone().multiplyScalar(0.5);

    this.root.name = `${this.id}-wall-button`;
    this.root.position.copy(options.position);
    if (options.rotation) this.root.rotation.copy(options.rotation);
    this.root.userData.wallButtonId = this.id;

    this.surfaceMesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        options.surfaceSize.x,
        options.surfaceSize.y,
        options.surfaceSize.z,
      ),
      new THREE.MeshStandardMaterial({
        color: 0x3d484d,
        roughness: 0.72,
        metalness: 0.42,
      }),
    );
    this.surfaceMesh.name = `${this.id}-attachment-surface`;
    this.surfaceMesh.userData.surfaceTag = 'sticky';
    this.surfaceMesh.userData.authoringRole = 'wall-button-attachment-surface';
    this.surfaceMesh.userData.wallButtonId = this.id;
    this.surfaceMesh.userData.movementFaceMode = 'vertical-sides';
    this.root.add(this.surfaceMesh);

    this.padRestX = options.surfaceSize.x * 0.9;
    this.pad = new THREE.Mesh(
      new THREE.BoxGeometry(
        options.surfaceSize.x * 0.45,
        options.surfaceSize.y * 0.82,
        options.surfaceSize.z * 0.82,
      ),
      new THREE.MeshStandardMaterial({
        color: 0xd66b36,
        emissive: 0x4b1608,
        emissiveIntensity: 0.35,
        roughness: 0.5,
        metalness: 0.22,
      }),
    );
    this.pad.name = `${this.id}-pad`;
    this.pad.position.x = this.padRestX;
    this.pad.userData.authoringRole = 'wall-button-presentation';
    this.root.add(this.pad);

    this.trigger = new Trigger(`${this.id}-valid-occupant`);
    this.unsubscribeOccupancy = this.trigger.events.on(
      'occupancyChanged',
      ({ occupants }) => this.applyOccupancy(occupants),
    );

    this.collisionWorld.register(
      this.surfaceMesh,
      undefined,
      ColliderTransformMode.Static,
    );
    try {
      this.surfaceRegistry.register(this.surfaceMesh);
    } catch (error) {
      this.collisionWorld.unregister(this.surfaceMesh);
      throw error;
    }
  }

  get isPressed(): boolean {
    return this.pressedValue;
  }

  get occupantId(): string | undefined {
    return this.occupantIdValue;
  }

  get enabled(): boolean {
    return this.enabledValue;
  }

  setEnabled(enabled: boolean): void {
    if (this.disposed || this.enabledValue === enabled) return;
    this.enabledValue = enabled;
    if (!enabled) this.trigger.clear();
  }

  update(occupants: Iterable<WallButtonOccupant<Body>>): void {
    if (this.disposed) throw new Error(`Cannot update disposed wall button "${this.id}".`);
    this.validOccupants.clear();

    if (this.enabledValue) {
      this.root.updateWorldMatrix(true, false);
      this.inverseRootMatrix.copy(this.root.matrixWorld).invert();
      for (const occupant of occupants) {
        if (
          occupant.id !== this.requiredOccupant.id ||
          occupant.body !== this.requiredOccupant.body
        ) continue;
        const body = occupant.body;
        if (
          body.attached &&
          body.supportCollider === this.surfaceMesh &&
          this.intersectsContactRegion(body)
        ) {
          this.validOccupants.add(occupant.id);
        }
      }
    }

    this.trigger.setOccupants(this.validOccupants);
  }

  reset(): void {
    if (this.disposed) return;
    this.enabledValue = false;
    this.trigger.clear();
    this.events.emit('reset', { button: this });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.enabledValue = false;
    this.unsubscribeOccupancy();
    this.trigger.dispose();
    this.collisionWorld.unregister(this.surfaceMesh);
    this.surfaceRegistry.unregister(this.surfaceMesh);
    this.events.clear();
    this.root.removeFromParent();
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      object.material.dispose();
    });
    this.root.clear();
  }

  private intersectsContactRegion(body: WallButtonBody): boolean {
    this.localBodyPosition
      .set(body.position.x, body.position.y, body.position.z)
      .applyMatrix4(this.inverseRootMatrix);
    const closestX = THREE.MathUtils.clamp(
      this.localBodyPosition.x,
      this.contactCentre.x - this.contactHalfSize.x,
      this.contactCentre.x + this.contactHalfSize.x,
    );
    const closestY = THREE.MathUtils.clamp(
      this.localBodyPosition.y,
      this.contactCentre.y - this.contactHalfSize.y,
      this.contactCentre.y + this.contactHalfSize.y,
    );
    const closestZ = THREE.MathUtils.clamp(
      this.localBodyPosition.z,
      this.contactCentre.z - this.contactHalfSize.z,
      this.contactCentre.z + this.contactHalfSize.z,
    );
    const dx = this.localBodyPosition.x - closestX;
    const dy = this.localBodyPosition.y - closestY;
    const dz = this.localBodyPosition.z - closestZ;
    return dx * dx + dy * dy + dz * dz <= body.radiusMetres * body.radiusMetres;
  }

  private applyOccupancy(occupants: ReadonlySet<string>): void {
    const nextOccupant = occupants.has(this.requiredOccupant.id)
      ? this.requiredOccupant.id
      : undefined;
    const nextPressed = nextOccupant !== undefined;
    if (this.pressedValue === nextPressed && this.occupantIdValue === nextOccupant) return;

    const previousOccupant = this.occupantIdValue;
    this.pressedValue = nextPressed;
    this.occupantIdValue = nextOccupant;
    this.pad.position.x = this.padRestX - (nextPressed ? 0.055 : 0);
    this.pad.material.color.setHex(nextPressed ? 0x74db8d : 0xd66b36);
    this.pad.material.emissive.setHex(nextPressed ? 0x124b25 : 0x4b1608);

    this.events.emit('changed', {
      button: this,
      pressed: nextPressed,
      occupantId: nextOccupant,
    });
    if (nextOccupant) {
      this.events.emit('pressed', { button: this, occupantId: nextOccupant });
    } else if (previousOccupant) {
      this.events.emit('released', { button: this, occupantId: previousOccupant });
    }
  }
}

function validateOptions(options: WallButtonOptions): void {
  if (!options.id || !options.requiredOccupant.id) {
    throw new Error('Wall button and required occupant IDs must be non-empty.');
  }
  for (const [label, vector] of [
    ['position', options.position],
    ['surface size', options.surfaceSize],
    ['contact centre', options.contactCentre],
    ['contact size', options.contactSize],
  ] as const) {
    if (![vector.x, vector.y, vector.z].every(Number.isFinite)) {
      throw new Error(`Wall button ${label} must be finite.`);
    }
  }
  if (
    options.surfaceSize.x <= 0 || options.surfaceSize.y <= 0 || options.surfaceSize.z <= 0 ||
    options.contactSize.x <= 0 || options.contactSize.y <= 0 || options.contactSize.z <= 0
  ) {
    throw new Error('Wall button surface and contact sizes must be positive.');
  }
  if (
    !Number.isFinite(options.requiredOccupant.body.radiusMetres) ||
    options.requiredOccupant.body.radiusMetres <= 0
  ) {
    throw new Error('Wall button required occupant radius must be positive and finite.');
  }
}
