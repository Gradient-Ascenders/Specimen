import * as THREE from 'three';

const AXIS_EPSILON = 1e-9;
const CONTACT_EPSILON = 1e-7;
const BROADPHASE_CELL_SIZE_METRES = 10;
const MAX_GRID_CELLS_PER_COLLIDER = 256;

type BroadphaseZCells = Map<number, RegisteredCollider[]>;
type BroadphaseYCells = Map<number, BroadphaseZCells>;
type BroadphaseGrid = Map<number, BroadphaseYCells>;

interface RegisteredCollider {
  readonly mesh: THREE.Mesh;
  layerMask: number;
  transformMode: ColliderTransformMode;
  transformCacheValid: boolean;
  readonly localBounds: THREE.Box3;
  readonly inverseWorld: THREE.Matrix4;
  readonly normalMatrix: THREE.Matrix3;
  readonly worldBounds: THREE.Box3;
  readonly worldRadiusScale: THREE.Vector3;
  minimumWorldScale: number;
  broadphaseStamp: number;
}

export interface CollisionWorldOptions {
  /** Disable only for exhaustive reference benchmarks and correctness tests. */
  readonly broadphaseEnabled?: boolean;
}

export interface CollisionSweepDiagnostics {
  readonly registeredColliders: number;
  readonly eligibleColliders: number;
  readonly broadphaseCandidates: number;
  readonly narrowPhaseChecks: number;
}

export const ColliderTransformMode = {
  Static: 'static',
  Dynamic: 'dynamic',
} as const;

export type ColliderTransformMode =
  (typeof ColliderTransformMode)[keyof typeof ColliderTransformMode];

/**
 * Query layers for the shared authored-geometry registry.
 *
 * Solid level meshes normally belong to every blocking layer. Future triggers or
 * gameplay-only volumes must opt into their relevant layer rather than
 * becoming camera obstructions accidentally.
 */
export const CollisionLayer = {
  None: 0,
  Movement: 1 << 0,
  CameraObstruction: 1 << 1,
  Projectile: 1 << 2,
  LineOfSight: 1 << 3,
} as const;

export const DEFAULT_SOLID_COLLISION_LAYERS =
  CollisionLayer.Movement |
  CollisionLayer.CameraObstruction |
  CollisionLayer.Projectile |
  CollisionLayer.LineOfSight;

/**
 * Reusable result container for collision queries.
 *
 * Callers own one of these and reuse it across fixed updates so collision
 * queries do not allocate garbage every frame.
 */
export class CollisionHit {
  object: THREE.Mesh | null = null;
  fraction = 1;
  distance = 0;
  readonly point = new THREE.Vector3();
  readonly normal = new THREE.Vector3();

  reset(): void {
    this.object = null;
    this.fraction = 1;
    this.distance = 0;
    this.point.set(0, 0, 0);
    this.normal.set(0, 1, 0);
  }
}

/**
 * Static/query collision registry used by the custom kinematic controller.
 *
 * The current Sprint 1 grey-box registers authored BoxGeometry meshes. Each
 * sphere sweep transforms the query into a collider's local space and sweeps
 * the sphere centre against the box expanded by the sphere radius. This gives
 * reliable continuous collision against the authored floor, walls, ledges and
 * slope without introducing a general rigid-body physics engine.
 *
 * Static collider transforms are cached after first use. Authored kinematic
 * objects must be registered as dynamic so their cache is refreshed for every
 * query. Non-uniform scaling is handled conservatively by expanding with the
 * smallest world scale component.
 *
 * Static colliders are indexed in a coarse 10-metre grid that matches the
 * authored room-scale layout. The much smaller dynamic set is refreshed and
 * AABB-tested per query. Candidates still enter the narrow phase in registry
 * order so equal hits retain their existing deterministic winner.
 */
export class CollisionWorld {
  private readonly colliders: RegisteredCollider[] = [];
  private readonly broadphaseEnabled: boolean;
  private readonly staticBroadphaseGrid: BroadphaseGrid = new Map();
  private readonly globalStaticColliders: RegisteredCollider[] = [];
  private readonly staticMaximumRadiusScale = new THREE.Vector3(1, 1, 1);
  private staticBroadphaseDirty = false;
  private broadphaseStamp = 0;

  private readonly localStart = new THREE.Vector3();
  private readonly localEnd = new THREE.Vector3();
  private readonly localDisplacement = new THREE.Vector3();
  private readonly candidateNormalLocal = new THREE.Vector3();
  private readonly candidateNormalWorld = new THREE.Vector3();
  private readonly worldEnd = new THREE.Vector3();
  private readonly sweepBounds = new THREE.Box3();

  private lastEligibleColliderCount = 0;
  private lastBroadphaseCandidateCount = 0;
  private lastNarrowPhaseCheckCount = 0;

  private slabEnter = 0;
  private slabExit = 1;
  private slabUpdatedEnter = false;
  private slabNormalSign = 0;

  constructor(options: CollisionWorldOptions = {}) {
    this.broadphaseEnabled = options.broadphaseEnabled ?? true;
  }

  register(
    mesh: THREE.Mesh,
    layerMask = DEFAULT_SOLID_COLLISION_LAYERS,
    transformMode: ColliderTransformMode = ColliderTransformMode.Dynamic,
  ): void {
    if (this.colliders.some((collider) => collider.mesh === mesh)) return;

    this.validateLayerMask(layerMask);
    this.validateTransformMode(transformMode);

    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const boundingBox = mesh.geometry.boundingBox;
    if (!boundingBox) {
      throw new Error(`Collider ${mesh.name || '<unnamed>'} has no bounding box.`);
    }

    this.colliders.push({
      mesh,
      layerMask,
      transformMode,
      transformCacheValid: false,
      localBounds: boundingBox.clone(),
      inverseWorld: new THREE.Matrix4(),
      normalMatrix: new THREE.Matrix3(),
      worldBounds: new THREE.Box3(),
      worldRadiusScale: new THREE.Vector3(1, 1, 1),
      minimumWorldScale: 0,
      broadphaseStamp: 0,
    });
    if (transformMode === ColliderTransformMode.Static) {
      this.staticBroadphaseDirty = true;
    }
  }

  registerAll(
    meshes: readonly THREE.Mesh[],
    layerMask = DEFAULT_SOLID_COLLISION_LAYERS,
    transformMode: ColliderTransformMode = ColliderTransformMode.Dynamic,
  ): void {
    for (const mesh of meshes) this.register(mesh, layerMask, transformMode);
  }

  unregister(mesh: THREE.Mesh): void {
    const index = this.colliders.findIndex((collider) => collider.mesh === mesh);
    if (index >= 0) {
      if (this.colliders[index]?.transformMode === ColliderTransformMode.Static) {
        this.staticBroadphaseDirty = true;
      }
      this.colliders.splice(index, 1);
    }
  }

  setLayerMask(mesh: THREE.Mesh, layerMask: number): void {
    this.validateLayerMask(layerMask);
    const collider = this.colliders.find((candidate) => candidate.mesh === mesh);
    if (!collider) {
      throw new Error(`Collider ${mesh.name || '<unnamed>'} is not registered.`);
    }
    collider.layerMask = layerMask;
  }

  /** Change how a registered collider's transform cache is maintained. */
  setTransformMode(mesh: THREE.Mesh, transformMode: ColliderTransformMode): void {
    this.validateTransformMode(transformMode);
    const collider = this.getRegisteredCollider(mesh);
    if (
      collider.transformMode === ColliderTransformMode.Static ||
      transformMode === ColliderTransformMode.Static
    ) {
      this.staticBroadphaseDirty = true;
    }
    collider.transformMode = transformMode;
    collider.transformCacheValid = false;
  }

  /**
   * Invalidate a static collider after an intentional one-off transform
   * change. Frequently moving gameplay geometry should use Dynamic mode.
   */
  invalidateTransform(mesh: THREE.Mesh): void {
    const collider = this.getRegisteredCollider(mesh);
    collider.transformCacheValid = false;
    if (collider.transformMode === ColliderTransformMode.Static) {
      this.staticBroadphaseDirty = true;
    }
  }

  clear(): void {
    this.colliders.length = 0;
    this.staticBroadphaseGrid.clear();
    this.globalStaticColliders.length = 0;
    this.staticBroadphaseDirty = false;
  }

  get colliderCount(): number {
    return this.colliders.length;
  }

  getLastSweepDiagnostics(): CollisionSweepDiagnostics {
    return {
      registeredColliders: this.colliders.length,
      eligibleColliders: this.lastEligibleColliderCount,
      broadphaseCandidates: this.lastBroadphaseCandidateCount,
      narrowPhaseChecks: this.lastNarrowPhaseCheckCount,
    };
  }

  get lastSweepEligibleColliderCount(): number {
    return this.lastEligibleColliderCount;
  }

  get lastSweepBroadphaseCandidateCount(): number {
    return this.lastBroadphaseCandidateCount;
  }

  get lastSweepNarrowPhaseCheckCount(): number {
    return this.lastNarrowPhaseCheckCount;
  }

  /**
   * Sweep a sphere from `origin` along `displacement` and write the closest
   * blocking hit into `outHit`.
   *
   * The returned fraction is in [0, 1] along the requested displacement. A
   * contact at fraction 0 is valid when the sphere begins touching a surface
   * and attempts to move further into it. Tangential/away motion from an
   * existing contact is ignored, which is what allows stable floor and wall
   * sliding.
   */
  sweepSphere(
    origin: THREE.Vector3,
    displacement: THREE.Vector3,
    radius: number,
    outHit: CollisionHit,
    queryMask = CollisionLayer.Movement,
    ignoredCollider?: THREE.Mesh,
  ): boolean {
    if (!Number.isFinite(radius) || radius <= 0) {
      throw new Error('Sphere sweep radius must be a positive finite number.');
    }

    this.validateLayerMask(queryMask);
    outHit.reset();
    this.resetSweepDiagnostics();

    if (queryMask === CollisionLayer.None) return false;

    const displacementLength = displacement.length();
    if (displacementLength <= AXIS_EPSILON) return false;

    let closestFraction = Number.POSITIVE_INFINITY;
    let closestCollider: RegisteredCollider | undefined;

    this.worldEnd.copy(origin).add(displacement);
    if (this.broadphaseEnabled) {
      this.prepareBroadphaseCandidates(
        origin,
        radius,
        queryMask,
        ignoredCollider,
      );
    }

    for (const collider of this.colliders) {
      if ((collider.layerMask & queryMask) === 0) continue;

      const mesh = collider.mesh;
      if (mesh === ignoredCollider) continue;
      if (!mesh.visible) continue;

      this.lastEligibleColliderCount += 1;
      if (
        this.broadphaseEnabled &&
        collider.broadphaseStamp !== this.broadphaseStamp
      ) {
        continue;
      }
      this.lastBroadphaseCandidateCount += 1;

      if (
        !this.broadphaseEnabled &&
        (collider.transformMode === ColliderTransformMode.Dynamic ||
          !collider.transformCacheValid)
      ) {
        this.refreshTransformCache(collider);
      }

      this.localStart.copy(origin).applyMatrix4(collider.inverseWorld);
      this.localEnd.copy(this.worldEnd).applyMatrix4(collider.inverseWorld);
      this.localDisplacement.subVectors(this.localEnd, this.localStart);

      const minimumScale = collider.minimumWorldScale;
      if (minimumScale <= AXIS_EPSILON) continue;
      this.lastNarrowPhaseCheckCount += 1;

      // A world-space sphere transformed through non-uniform scale becomes an
      // ellipsoid. Expanding by radius / minScale is conservative and avoids
      // missing collisions without requiring an ellipsoid solver.
      const localRadius = radius / minimumScale;
      const fraction = this.sweepExpandedLocalBox(
        collider.localBounds,
        localRadius,
        this.localStart,
        this.localDisplacement,
        this.candidateNormalLocal,
      );

      if (fraction === undefined || fraction >= closestFraction) continue;

      this.candidateNormalWorld
        .copy(this.candidateNormalLocal)
        .applyMatrix3(collider.normalMatrix)
        .normalize();

      // Thin vertical panels still have mathematical caps and narrow edge
      // strips. An authored side-only panel must expose only its two broad
      // faces to movement, otherwise Bob can stand on a cap or attach to one
      // of the almost invisible edges. Camera obstruction deliberately keeps
      // the complete visual box.
      if (
        (queryMask & CollisionLayer.Movement) !== 0 &&
        mesh.userData.movementFaceMode === 'vertical-sides' &&
        !this.isBroadVerticalPanelFace(collider)
      ) {
        continue;
      }

      closestFraction = fraction;
      closestCollider = collider;
      outHit.normal.copy(this.candidateNormalWorld);
    }

    if (!closestCollider || !Number.isFinite(closestFraction)) return false;

    outHit.object = closestCollider.mesh;
    outHit.fraction = THREE.MathUtils.clamp(closestFraction, 0, 1);
    outHit.distance = displacementLength * outHit.fraction;
    outHit.point.copy(origin).addScaledVector(displacement, outHit.fraction);
    return true;
  }

  private resetSweepDiagnostics(): void {
    this.lastEligibleColliderCount = 0;
    this.lastBroadphaseCandidateCount = 0;
    this.lastNarrowPhaseCheckCount = 0;
  }

  private prepareBroadphaseCandidates(
    origin: THREE.Vector3,
    radius: number,
    queryMask: number,
    ignoredCollider: THREE.Mesh | undefined,
  ): void {
    this.advanceBroadphaseStamp();
    this.ensureStaticBroadphase();

    this.sweepBounds.min.set(
      Math.min(origin.x, this.worldEnd.x),
      Math.min(origin.y, this.worldEnd.y),
      Math.min(origin.z, this.worldEnd.z),
    );
    this.sweepBounds.max.set(
      Math.max(origin.x, this.worldEnd.x),
      Math.max(origin.y, this.worldEnd.y),
      Math.max(origin.z, this.worldEnd.z),
    );

    this.markStaticBroadphaseCandidates(radius);
    for (const collider of this.colliders) {
      if (collider.transformMode !== ColliderTransformMode.Dynamic) continue;
      if ((collider.layerMask & queryMask) === 0) continue;
      if (collider.mesh === ignoredCollider || !collider.mesh.visible) continue;

      this.refreshTransformCache(collider);
      this.refreshWorldBounds(collider);
      if (this.intersectsExpandedSweep(collider, radius)) {
        collider.broadphaseStamp = this.broadphaseStamp;
      }
    }
  }

  private advanceBroadphaseStamp(): void {
    this.broadphaseStamp = (this.broadphaseStamp + 1) >>> 0;
    if (this.broadphaseStamp !== 0) return;

    this.broadphaseStamp = 1;
    for (const collider of this.colliders) collider.broadphaseStamp = 0;
  }

  private ensureStaticBroadphase(): void {
    if (!this.staticBroadphaseDirty) return;

    this.staticBroadphaseGrid.clear();
    this.globalStaticColliders.length = 0;
    this.staticMaximumRadiusScale.set(1, 1, 1);
    for (const collider of this.colliders) {
      if (collider.transformMode !== ColliderTransformMode.Static) continue;
      if (!collider.transformCacheValid) this.refreshTransformCache(collider);
      this.refreshWorldBounds(collider);
      this.staticMaximumRadiusScale.max(collider.worldRadiusScale);
      this.insertStaticCollider(collider);
    }
    this.staticBroadphaseDirty = false;
  }

  private refreshWorldBounds(collider: RegisteredCollider): void {
    collider.worldBounds
      .copy(collider.localBounds)
      .applyMatrix4(collider.mesh.matrixWorld);
  }

  private insertStaticCollider(collider: RegisteredCollider): void {
    const minimumX = this.worldToCell(collider.worldBounds.min.x);
    const minimumY = this.worldToCell(collider.worldBounds.min.y);
    const minimumZ = this.worldToCell(collider.worldBounds.min.z);
    const maximumX = this.worldToCell(collider.worldBounds.max.x);
    const maximumY = this.worldToCell(collider.worldBounds.max.y);
    const maximumZ = this.worldToCell(collider.worldBounds.max.z);
    const cellCount =
      (maximumX - minimumX + 1) *
      (maximumY - minimumY + 1) *
      (maximumZ - minimumZ + 1);

    if (cellCount > MAX_GRID_CELLS_PER_COLLIDER) {
      this.globalStaticColliders.push(collider);
      return;
    }

    for (let x = minimumX; x <= maximumX; x += 1) {
      let yCells = this.staticBroadphaseGrid.get(x);
      if (!yCells) {
        yCells = new Map();
        this.staticBroadphaseGrid.set(x, yCells);
      }
      for (let y = minimumY; y <= maximumY; y += 1) {
        let zCells = yCells.get(y);
        if (!zCells) {
          zCells = new Map();
          yCells.set(y, zCells);
        }
        for (let z = minimumZ; z <= maximumZ; z += 1) {
          let cell = zCells.get(z);
          if (!cell) {
            cell = [];
            zCells.set(z, cell);
          }
          cell.push(collider);
        }
      }
    }
  }

  private markStaticBroadphaseCandidates(radius: number): void {
    const minimumX = this.worldToCell(
      this.sweepBounds.min.x - radius * this.staticMaximumRadiusScale.x,
    );
    const minimumY = this.worldToCell(
      this.sweepBounds.min.y - radius * this.staticMaximumRadiusScale.y,
    );
    const minimumZ = this.worldToCell(
      this.sweepBounds.min.z - radius * this.staticMaximumRadiusScale.z,
    );
    const maximumX = this.worldToCell(
      this.sweepBounds.max.x + radius * this.staticMaximumRadiusScale.x,
    );
    const maximumY = this.worldToCell(
      this.sweepBounds.max.y + radius * this.staticMaximumRadiusScale.y,
    );
    const maximumZ = this.worldToCell(
      this.sweepBounds.max.z + radius * this.staticMaximumRadiusScale.z,
    );
    const queryCellCount =
      (maximumX - minimumX + 1) *
      (maximumY - minimumY + 1) *
      (maximumZ - minimumZ + 1);

    if (queryCellCount > this.colliders.length) {
      for (const collider of this.colliders) {
        if (
          collider.transformMode === ColliderTransformMode.Static &&
          this.intersectsExpandedSweep(collider, radius)
        ) {
          collider.broadphaseStamp = this.broadphaseStamp;
        }
      }
      return;
    }

    for (const collider of this.globalStaticColliders) {
      collider.broadphaseStamp = this.broadphaseStamp;
    }
    for (let x = minimumX; x <= maximumX; x += 1) {
      const yCells = this.staticBroadphaseGrid.get(x);
      if (!yCells) continue;
      for (let y = minimumY; y <= maximumY; y += 1) {
        const zCells = yCells.get(y);
        if (!zCells) continue;
        for (let z = minimumZ; z <= maximumZ; z += 1) {
          const cell = zCells.get(z);
          if (!cell) continue;
          for (const collider of cell) {
            collider.broadphaseStamp = this.broadphaseStamp;
          }
        }
      }
    }
  }

  private worldToCell(coordinate: number): number {
    return Math.floor(coordinate / BROADPHASE_CELL_SIZE_METRES);
  }

  private intersectsExpandedSweep(
    collider: RegisteredCollider,
    radius: number,
  ): boolean {
    const bounds = collider.worldBounds;
    const radiusScale = collider.worldRadiusScale;
    return (
      bounds.max.x + radius * radiusScale.x >= this.sweepBounds.min.x &&
      bounds.min.x - radius * radiusScale.x <= this.sweepBounds.max.x &&
      bounds.max.y + radius * radiusScale.y >= this.sweepBounds.min.y &&
      bounds.min.y - radius * radiusScale.y <= this.sweepBounds.max.y &&
      bounds.max.z + radius * radiusScale.z >= this.sweepBounds.min.z &&
      bounds.min.z - radius * radiusScale.z <= this.sweepBounds.max.z
    );
  }

  private isBroadVerticalPanelFace(collider: RegisteredCollider): boolean {
    if (Math.abs(this.candidateNormalWorld.y) > 0.5) return false;

    const bounds = collider.localBounds;
    const sizeX = bounds.max.x - bounds.min.x;
    const sizeY = bounds.max.y - bounds.min.y;
    const sizeZ = bounds.max.z - bounds.min.z;
    const thinnestAxis =
      sizeX <= sizeY && sizeX <= sizeZ
        ? 'x'
        : sizeY <= sizeZ
          ? 'y'
          : 'z';

    if (thinnestAxis === 'x') return Math.abs(this.candidateNormalLocal.x) > 0.5;
    if (thinnestAxis === 'y') return Math.abs(this.candidateNormalLocal.y) > 0.5;
    return Math.abs(this.candidateNormalLocal.z) > 0.5;
  }

  private refreshTransformCache(collider: RegisteredCollider): void {
    const mesh = collider.mesh;
    mesh.updateWorldMatrix(true, false);
    collider.inverseWorld.copy(mesh.matrixWorld).invert();
    collider.normalMatrix.getNormalMatrix(mesh.matrixWorld);

    const worldElements = mesh.matrixWorld.elements;
    const scaleX = Math.hypot(worldElements[0], worldElements[1], worldElements[2]);
    const scaleY = Math.hypot(worldElements[4], worldElements[5], worldElements[6]);
    const scaleZ = Math.hypot(worldElements[8], worldElements[9], worldElements[10]);
    collider.minimumWorldScale = Math.min(scaleX, scaleY, scaleZ);
    // The exact solver expands the local box by radius / minScale. Preserve
    // that conservative behaviour in the world-space broadphase, including
    // the extra reach introduced by rotation and non-uniform scale.
    if (collider.minimumWorldScale <= AXIS_EPSILON) {
      collider.worldRadiusScale.set(0, 0, 0);
    } else {
      collider.worldRadiusScale.set(
        (Math.abs(worldElements[0]) +
          Math.abs(worldElements[4]) +
          Math.abs(worldElements[8])) /
          collider.minimumWorldScale,
        (Math.abs(worldElements[1]) +
          Math.abs(worldElements[5]) +
          Math.abs(worldElements[9])) /
          collider.minimumWorldScale,
        (Math.abs(worldElements[2]) +
          Math.abs(worldElements[6]) +
          Math.abs(worldElements[10])) /
          collider.minimumWorldScale,
      );
    }
    collider.transformCacheValid = true;
  }

  private getRegisteredCollider(mesh: THREE.Mesh): RegisteredCollider {
    const collider = this.colliders.find((candidate) => candidate.mesh === mesh);
    if (!collider) {
      throw new Error(`Collider ${mesh.name || '<unnamed>'} is not registered.`);
    }
    return collider;
  }

  private validateLayerMask(layerMask: number): void {
    if (!Number.isInteger(layerMask) || layerMask < 0) {
      throw new Error('Collision layer mask must be a non-negative integer.');
    }
  }

  private validateTransformMode(transformMode: string): void {
    if (
      transformMode !== ColliderTransformMode.Static &&
      transformMode !== ColliderTransformMode.Dynamic
    ) {
      throw new Error(`Unknown collider transform mode "${transformMode}".`);
    }
  }

  private sweepExpandedLocalBox(
    bounds: THREE.Box3,
    radius: number,
    start: THREE.Vector3,
    displacement: THREE.Vector3,
    outNormal: THREE.Vector3,
  ): number | undefined {
    const minX = bounds.min.x - radius;
    const minY = bounds.min.y - radius;
    const minZ = bounds.min.z - radius;
    const maxX = bounds.max.x + radius;
    const maxY = bounds.max.y + radius;
    const maxZ = bounds.max.z + radius;

    const startsInside =
      start.x >= minX - CONTACT_EPSILON &&
      start.x <= maxX + CONTACT_EPSILON &&
      start.y >= minY - CONTACT_EPSILON &&
      start.y <= maxY + CONTACT_EPSILON &&
      start.z >= minZ - CONTACT_EPSILON &&
      start.z <= maxZ + CONTACT_EPSILON;

    if (startsInside) {
      this.closestExpandedFaceNormal(
        start,
        minX,
        minY,
        minZ,
        maxX,
        maxY,
        maxZ,
        outNormal,
      );

      // Existing contact should only block movement that pushes further into
      // the collider. Tangential or separating motion must remain free so the
      // controller can slide along floors and walls without zero-time jitter.
      if (displacement.dot(outNormal) < -CONTACT_EPSILON) return 0;
      return undefined;
    }

    let enter = 0;
    let exit = 1;
    let enterAxis = -1;
    let enterSign = 0;

    if (!this.updateSlab(start.x, displacement.x, minX, maxX, enter, exit)) {
      return undefined;
    }
    enter = this.slabEnter;
    exit = this.slabExit;
    if (this.slabUpdatedEnter) {
      enterAxis = 0;
      enterSign = this.slabNormalSign;
    }

    if (!this.updateSlab(start.y, displacement.y, minY, maxY, enter, exit)) {
      return undefined;
    }
    enter = this.slabEnter;
    exit = this.slabExit;
    if (this.slabUpdatedEnter) {
      enterAxis = 1;
      enterSign = this.slabNormalSign;
    }

    if (!this.updateSlab(start.z, displacement.z, minZ, maxZ, enter, exit)) {
      return undefined;
    }
    enter = this.slabEnter;
    if (this.slabUpdatedEnter) {
      enterAxis = 2;
      enterSign = this.slabNormalSign;
    }

    if (enterAxis < 0 || enter < -CONTACT_EPSILON || enter > 1 + CONTACT_EPSILON) {
      return undefined;
    }

    outNormal.set(0, 0, 0);
    if (enterAxis === 0) outNormal.x = enterSign;
    if (enterAxis === 1) outNormal.y = enterSign;
    if (enterAxis === 2) outNormal.z = enterSign;

    // Boundary starts can produce an entry fraction extremely close to zero.
    // Apply the same inward-motion rule used for startsInside.
    if (enter <= CONTACT_EPSILON && displacement.dot(outNormal) >= -CONTACT_EPSILON) {
      return undefined;
    }

    return THREE.MathUtils.clamp(enter, 0, 1);
  }

  private updateSlab(
    start: number,
    displacement: number,
    minimum: number,
    maximum: number,
    currentEnter: number,
    currentExit: number,
  ): boolean {
    this.slabEnter = currentEnter;
    this.slabExit = currentExit;
    this.slabUpdatedEnter = false;
    this.slabNormalSign = 0;

    if (Math.abs(displacement) <= AXIS_EPSILON) {
      return start >= minimum && start <= maximum;
    }

    let near: number;
    let far: number;

    if (displacement > 0) {
      near = (minimum - start) / displacement;
      far = (maximum - start) / displacement;
      this.slabNormalSign = -1;
    } else {
      near = (maximum - start) / displacement;
      far = (minimum - start) / displacement;
      this.slabNormalSign = 1;
    }

    if (near > currentEnter) {
      this.slabEnter = near;
      this.slabUpdatedEnter = true;
    }
    this.slabExit = Math.min(currentExit, far);
    return this.slabEnter - this.slabExit <= CONTACT_EPSILON;
  }

  private closestExpandedFaceNormal(
    point: THREE.Vector3,
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
    outNormal: THREE.Vector3,
  ): void {
    let distance = point.x - minX;
    outNormal.set(-1, 0, 0);

    const maxXDistance = maxX - point.x;
    if (maxXDistance < distance) {
      distance = maxXDistance;
      outNormal.set(1, 0, 0);
    }

    const minYDistance = point.y - minY;
    if (minYDistance < distance) {
      distance = minYDistance;
      outNormal.set(0, -1, 0);
    }

    const maxYDistance = maxY - point.y;
    if (maxYDistance < distance) {
      distance = maxYDistance;
      outNormal.set(0, 1, 0);
    }

    const minZDistance = point.z - minZ;
    if (minZDistance < distance) {
      distance = minZDistance;
      outNormal.set(0, 0, -1);
    }

    const maxZDistance = maxZ - point.z;
    if (maxZDistance < distance) {
      outNormal.set(0, 0, 1);
    }
  }
}
