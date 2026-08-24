import * as THREE from 'three';

import { EventBus } from '../core/EventBus.ts';
import type { CollisionWorld } from '../physics/CollisionWorld.ts';
import type { SurfaceRegistry } from '../physics/SurfaceRegistry.ts';

const PROGRESS_EPSILON = 1e-10;

export type VerticalBlastDoorState =
  | 'closed'
  | 'opening'
  | 'open'
  | 'closing'
  | 'blocked'
  | 'reopening';

export interface BlastDoorObstacle {
  readonly id: string;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly radiusMetres: number;
}

export interface VerticalBlastDoorEvents {
  stateChanged: {
    readonly door: VerticalBlastDoor;
    readonly previousState: VerticalBlastDoorState;
    readonly state: VerticalBlastDoorState;
  };
  openingStarted: { readonly door: VerticalBlastDoor; readonly reopening: boolean };
  closingStarted: { readonly door: VerticalBlastDoor };
  fullyOpened: { readonly door: VerticalBlastDoor };
  fullyClosed: { readonly door: VerticalBlastDoor };
  obstructionDetected: { readonly door: VerticalBlastDoor; readonly occupantIds: readonly string[] };
  obstructionCleared: { readonly door: VerticalBlastDoor };
  reset: { readonly door: VerticalBlastDoor };
}

export interface VerticalBlastDoorOptions {
  readonly id: string;
  readonly collisionWorld: CollisionWorld;
  readonly surfaceRegistry: SurfaceRegistry;
  readonly closedPosition: THREE.Vector3;
  readonly rotation?: THREE.Euler;
  readonly panelSize: THREE.Vector3;
  readonly travelAxis: THREE.Vector3;
  readonly travelDistance: number;
  readonly openingDurationSeconds: number;
  readonly closingDurationSeconds: number;
  readonly obstructionCentre: THREE.Vector3;
  readonly obstructionSize: THREE.Vector3;
}

/** Fixed-step vertically translating door with body-safe closing and reopening. */
export class VerticalBlastDoor {
  readonly root = new THREE.Group();
  readonly events = new EventBus<VerticalBlastDoorEvents>();
  readonly collisionMesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  readonly id: string;

  private readonly collisionWorld: CollisionWorld;
  private readonly surfaceRegistry: SurfaceRegistry;
  private readonly panelHalfSize: THREE.Vector3;
  private readonly travelAxis: THREE.Vector3;
  private readonly travelDistance: number;
  private readonly openingDurationSeconds: number;
  private readonly closingDurationSeconds: number;
  private readonly obstructionCentre: THREE.Vector3;
  private readonly obstructionHalfSize: THREE.Vector3;
  private readonly localObstaclePosition = new THREE.Vector3();
  private readonly inverseRootMatrix = new THREE.Matrix4();
  private readonly currentPanelPosition = new THREE.Vector3();
  private readonly proposedPanelPosition = new THREE.Vector3();
  private readonly sweptMinimum = new THREE.Vector3();
  private readonly sweptMaximum = new THREE.Vector3();
  private readonly obstructingIds = new Set<string>();
  private readonly scratchObstructingIds = new Set<string>();
  private progressValue = 0;
  private targetOpen = false;
  private stateValue: VerticalBlastDoorState = 'closed';
  private transitionCountValue = 0;
  private collisionEnabledValue = false;
  private disposed = false;

  constructor(options: VerticalBlastDoorOptions) {
    validateOptions(options);
    this.id = options.id;
    this.collisionWorld = options.collisionWorld;
    this.surfaceRegistry = options.surfaceRegistry;
    this.panelHalfSize = options.panelSize.clone().multiplyScalar(0.5);
    this.travelAxis = options.travelAxis.clone().normalize();
    this.travelDistance = options.travelDistance;
    this.openingDurationSeconds = options.openingDurationSeconds;
    this.closingDurationSeconds = options.closingDurationSeconds;
    this.obstructionCentre = options.obstructionCentre.clone();
    this.obstructionHalfSize = options.obstructionSize.clone().multiplyScalar(0.5);

    this.root.name = `${this.id}-vertical-blast-door`;
    this.root.position.copy(options.closedPosition);
    if (options.rotation) this.root.rotation.copy(options.rotation);
    this.root.userData.blastDoorId = this.id;

    this.collisionMesh = new THREE.Mesh(
      new THREE.BoxGeometry(options.panelSize.x, options.panelSize.y, options.panelSize.z),
      new THREE.MeshStandardMaterial({
        color: 0x66777e,
        emissive: 0x182126,
        emissiveIntensity: 0.16,
        roughness: 0.48,
        metalness: 0.68,
      }),
    );
    this.collisionMesh.name = `${this.id}-panel`;
    this.collisionMesh.userData.surfaceTag = 'default';
    this.collisionMesh.userData.authoringRole = 'vertical-blast-door-panel';
    this.collisionMesh.userData.blastDoorId = this.id;
    this.collisionMesh.userData.movementFaceMode = 'vertical-sides';
    this.root.add(this.collisionMesh);

    this.addFrame(options.panelSize);
    this.applyProgress();
    this.collisionWorld.register(this.collisionMesh);
    try {
      this.surfaceRegistry.register(this.collisionMesh);
      this.collisionEnabledValue = true;
    } catch (error) {
      this.collisionWorld.unregister(this.collisionMesh);
      throw error;
    }
  }

  get state(): VerticalBlastDoorState {
    return this.stateValue;
  }

  get progress(): number {
    return this.progressValue;
  }

  get desiredOpen(): boolean {
    return this.targetOpen;
  }

  get collisionEnabled(): boolean {
    return this.collisionEnabledValue;
  }

  get transitionCount(): number {
    return this.transitionCountValue;
  }

  get obstructionIds(): ReadonlySet<string> {
    return this.obstructingIds;
  }

  setOpen(open: boolean): void {
    if (this.disposed || this.targetOpen === open) return;
    this.targetOpen = open;
    if (open) {
      this.clearObstruction();
      this.setState(this.progressValue >= 1 - PROGRESS_EPSILON ? 'open' : 'opening');
    } else {
      this.setState(this.progressValue <= PROGRESS_EPSILON ? 'closed' : 'closing');
    }
  }

  update(deltaSeconds: number, obstacles: Iterable<BlastDoorObstacle>): void {
    if (this.disposed) throw new Error(`Cannot update disposed blast door "${this.id}".`);
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new Error('Blast door deltaSeconds must be non-negative and finite.');
    }

    if (this.targetOpen) {
      this.clearObstruction();
      this.advanceOpening(deltaSeconds, false);
      return;
    }

    if (this.progressValue <= PROGRESS_EPSILON) {
      this.progressValue = 0;
      this.applyProgress();
      this.clearObstruction();
      this.setState('closed');
      return;
    }

    const proposedProgress = Math.max(
      0,
      this.progressValue - deltaSeconds / this.closingDurationSeconds,
    );
    const obstructed = this.collectObstructions(obstacles, proposedProgress);
    if (obstructed) {
      if (this.obstructingIds.size === 0) {
        for (const id of this.scratchObstructingIds) this.obstructingIds.add(id);
        this.events.emit('obstructionDetected', {
          door: this,
          occupantIds: [...this.obstructingIds],
        });
        this.setState('blocked');
        return;
      }
      this.syncObstructionIds();
      this.advanceOpening(deltaSeconds, true);
      return;
    }

    this.clearObstruction();
    this.progressValue = proposedProgress;
    this.applyProgress();
    if (this.progressValue <= PROGRESS_EPSILON) {
      this.progressValue = 0;
      this.applyProgress();
      this.setState('closed');
    } else {
      this.setState('closing');
    }
  }

  reset(): void {
    if (this.disposed) return;
    this.targetOpen = false;
    this.progressValue = 0;
    this.obstructingIds.clear();
    this.scratchObstructingIds.clear();
    this.applyProgress();
    this.setState('closed');
    this.events.emit('reset', { door: this });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.collisionWorld.unregister(this.collisionMesh);
    this.surfaceRegistry.unregister(this.collisionMesh);
    this.collisionEnabledValue = false;
    this.obstructingIds.clear();
    this.scratchObstructingIds.clear();
    this.events.clear();
    this.root.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      if (Array.isArray(object.material)) {
        for (const material of object.material) materials.add(material);
      } else {
        materials.add(object.material);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.root.clear();
  }

  private advanceOpening(deltaSeconds: number, reopening: boolean): void {
    this.progressValue = Math.min(
      1,
      this.progressValue + deltaSeconds / this.openingDurationSeconds,
    );
    this.applyProgress();
    if (reopening) {
      this.setState('reopening');
    } else if (this.progressValue >= 1 - PROGRESS_EPSILON) {
      this.progressValue = 1;
      this.applyProgress();
      this.setState('open');
    } else {
      this.setState('opening');
    }
  }

  private collectObstructions(
    obstacles: Iterable<BlastDoorObstacle>,
    proposedProgress: number,
  ): boolean {
    this.scratchObstructingIds.clear();
    this.root.updateWorldMatrix(true, false);
    this.inverseRootMatrix.copy(this.root.matrixWorld).invert();
    this.currentPanelPosition.copy(this.travelAxis).multiplyScalar(
      this.travelDistance * this.progressValue,
    );
    this.proposedPanelPosition.copy(this.travelAxis).multiplyScalar(
      this.travelDistance * proposedProgress,
    );
    this.sweptMinimum.set(
      Math.min(this.currentPanelPosition.x, this.proposedPanelPosition.x) - this.panelHalfSize.x,
      Math.min(this.currentPanelPosition.y, this.proposedPanelPosition.y) - this.panelHalfSize.y,
      Math.min(this.currentPanelPosition.z, this.proposedPanelPosition.z) - this.panelHalfSize.z,
    );
    this.sweptMaximum.set(
      Math.max(this.currentPanelPosition.x, this.proposedPanelPosition.x) + this.panelHalfSize.x,
      Math.max(this.currentPanelPosition.y, this.proposedPanelPosition.y) + this.panelHalfSize.y,
      Math.max(this.currentPanelPosition.z, this.proposedPanelPosition.z) + this.panelHalfSize.z,
    );

    for (const obstacle of obstacles) {
      if (!obstacle.id || !Number.isFinite(obstacle.radiusMetres) || obstacle.radiusMetres <= 0) continue;
      this.localObstaclePosition
        .set(obstacle.position.x, obstacle.position.y, obstacle.position.z)
        .applyMatrix4(this.inverseRootMatrix);
      if (
        sphereIntersectsBox(
          this.localObstaclePosition,
          obstacle.radiusMetres,
          this.obstructionCentre,
          this.obstructionHalfSize,
        ) ||
        sphereIntersectsBounds(
          this.localObstaclePosition,
          obstacle.radiusMetres,
          this.sweptMinimum,
          this.sweptMaximum,
        )
      ) {
        this.scratchObstructingIds.add(obstacle.id);
      }
    }
    return this.scratchObstructingIds.size > 0;
  }

  private syncObstructionIds(): void {
    this.obstructingIds.clear();
    for (const id of this.scratchObstructingIds) this.obstructingIds.add(id);
  }

  private clearObstruction(): void {
    if (this.obstructingIds.size === 0) return;
    this.obstructingIds.clear();
    this.scratchObstructingIds.clear();
    this.events.emit('obstructionCleared', { door: this });
  }

  private applyProgress(): void {
    this.collisionMesh.position.copy(this.travelAxis).multiplyScalar(
      this.travelDistance * this.progressValue,
    );
    this.collisionMesh.updateWorldMatrix(true, false);
  }

  private setState(state: VerticalBlastDoorState): void {
    if (this.stateValue === state) return;
    const previousState = this.stateValue;
    this.stateValue = state;
    this.transitionCountValue += 1;
    this.events.emit('stateChanged', { door: this, previousState, state });
    if (state === 'opening' || state === 'reopening') {
      this.events.emit('openingStarted', { door: this, reopening: state === 'reopening' });
    } else if (state === 'closing') {
      this.events.emit('closingStarted', { door: this });
    } else if (state === 'open') {
      this.events.emit('fullyOpened', { door: this });
    } else if (state === 'closed') {
      this.events.emit('fullyClosed', { door: this });
    }
  }

  private addFrame(panelSize: THREE.Vector3): void {
    const material = new THREE.MeshStandardMaterial({
      color: 0x344047,
      roughness: 0.62,
      metalness: 0.55,
    });
    const sideGeometry = new THREE.BoxGeometry(0.28, panelSize.y + 0.35, panelSize.z + 0.22);
    const left = new THREE.Mesh(sideGeometry, material);
    left.position.x = -panelSize.x * 0.5 - 0.14;
    const right = new THREE.Mesh(sideGeometry, material);
    right.position.x = panelSize.x * 0.5 + 0.14;
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(panelSize.x + 0.56, 0.28, panelSize.z + 0.22),
      material,
    );
    top.position.y = panelSize.y * 0.5 + 0.14;
    for (const frame of [left, right, top]) {
      frame.userData.authoringRole = 'vertical-blast-door-frame';
      frame.userData.blastDoorId = this.id;
    }
    this.root.add(left, right, top);
  }
}

function sphereIntersectsBox(
  position: THREE.Vector3,
  radius: number,
  centre: THREE.Vector3,
  halfSize: THREE.Vector3,
): boolean {
  const x = THREE.MathUtils.clamp(position.x, centre.x - halfSize.x, centre.x + halfSize.x);
  const y = THREE.MathUtils.clamp(position.y, centre.y - halfSize.y, centre.y + halfSize.y);
  const z = THREE.MathUtils.clamp(position.z, centre.z - halfSize.z, centre.z + halfSize.z);
  const dx = position.x - x;
  const dy = position.y - y;
  const dz = position.z - z;
  return dx * dx + dy * dy + dz * dz <= radius * radius;
}

function sphereIntersectsBounds(
  position: THREE.Vector3,
  radius: number,
  minimum: THREE.Vector3,
  maximum: THREE.Vector3,
): boolean {
  const x = THREE.MathUtils.clamp(position.x, minimum.x, maximum.x);
  const y = THREE.MathUtils.clamp(position.y, minimum.y, maximum.y);
  const z = THREE.MathUtils.clamp(position.z, minimum.z, maximum.z);
  const dx = position.x - x;
  const dy = position.y - y;
  const dz = position.z - z;
  return dx * dx + dy * dy + dz * dz <= radius * radius;
}

function validateOptions(options: VerticalBlastDoorOptions): void {
  if (!options.id) throw new Error('Blast door ID must be non-empty.');
  for (const [label, vector] of [
    ['closed position', options.closedPosition],
    ['panel size', options.panelSize],
    ['travel axis', options.travelAxis],
    ['obstruction centre', options.obstructionCentre],
    ['obstruction size', options.obstructionSize],
  ] as const) {
    if (![vector.x, vector.y, vector.z].every(Number.isFinite)) {
      throw new Error(`Blast door ${label} must be finite.`);
    }
  }
  if (
    options.panelSize.x <= 0 || options.panelSize.y <= 0 || options.panelSize.z <= 0 ||
    options.obstructionSize.x <= 0 || options.obstructionSize.y <= 0 || options.obstructionSize.z <= 0
  ) {
    throw new Error('Blast door panel and obstruction sizes must be positive.');
  }
  if (options.travelAxis.lengthSq() <= PROGRESS_EPSILON) {
    throw new Error('Blast door travel axis must be non-zero.');
  }
  for (const [label, value] of [
    ['travel distance', options.travelDistance],
    ['opening duration', options.openingDurationSeconds],
    ['closing duration', options.closingDurationSeconds],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Blast door ${label} must be positive and finite.`);
    }
  }
}
