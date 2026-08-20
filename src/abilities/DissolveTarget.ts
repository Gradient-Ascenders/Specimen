import * as THREE from 'three';

import { EventBus } from '../core/EventBus.ts';
import type { CollisionWorld } from '../physics/CollisionWorld.ts';
import type { SurfaceRegistry } from '../physics/SurfaceRegistry.ts';

const SCALE_EPSILON = 1e-9;

export interface DissolveTargetEvents {
  collisionChanged: {
    readonly target: DissolveTarget;
    readonly collisionEnabled: boolean;
  };
  completed: {
    readonly target: DissolveTarget;
  };
}

export interface DissolveTargetOptions {
  readonly id: string;
  readonly mesh: THREE.Mesh;
  readonly collisionWorld: CollisionWorld;
  readonly surfaceRegistry: SurfaceRegistry;
  readonly dissolveDurationSeconds: number;
  readonly collisionDisableProgress: number;
  readonly activationRangeMetres?: number;
}

interface MaterialState {
  readonly material: THREE.Material;
  readonly opacity: number;
  readonly transparent: boolean;
  readonly depthWrite: boolean;
}

/**
 * One explicitly-authored soluble geometry target.
 *
 * Progress is authoritative. Presentation and collision are derived from that
 * same value so reset can restore the original mesh without rebuilding assets.
 */
export class DissolveTarget {
  readonly events = new EventBus<DissolveTargetEvents>();
  readonly id: string;
  readonly mesh: THREE.Mesh;

  private readonly collisionWorld: CollisionWorld;
  private readonly surfaceRegistry: SurfaceRegistry;
  private readonly dissolveDurationSecondsValue: number;
  private readonly collisionDisableProgressValue: number;
  private readonly activationRangeMetresValue: number;
  private readonly authoredVisible: boolean;
  private readonly originalMaterial: THREE.Material | THREE.Material[];
  private readonly materialStates: MaterialState[];

  private readonly localBounds: THREE.Box3;
  private readonly inverseWorld = new THREE.Matrix4();
  private readonly localPoint = new THREE.Vector3();
  private readonly closestPoint = new THREE.Vector3();

  private progressValue = 0;
  private completedValue = false;
  private collisionEnabledValue = true;
  private completionCountValue = 0;
  private disposed = false;

  constructor(options: DissolveTargetOptions) {
    if (!options.id) throw new Error('Dissolve target IDs cannot be empty.');
    if (
      !Number.isFinite(options.dissolveDurationSeconds) ||
      options.dissolveDurationSeconds <= 0
    ) {
      throw new Error('Dissolve duration must be positive and finite.');
    }
    if (
      !Number.isFinite(options.collisionDisableProgress) ||
      options.collisionDisableProgress <= 0 ||
      options.collisionDisableProgress >= 1
    ) {
      throw new Error(
        'Dissolve collision threshold must be within the open interval (0, 1).',
      );
    }

    const activationRangeMetres = options.activationRangeMetres ?? 0.12;
    if (
      !Number.isFinite(activationRangeMetres) ||
      activationRangeMetres < 0
    ) {
      throw new Error(
        'Dissolve activation range must be non-negative and finite.',
      );
    }

    if (!options.mesh.geometry.boundingBox) {
      options.mesh.geometry.computeBoundingBox();
    }
    const bounds = options.mesh.geometry.boundingBox;
    if (!bounds) {
      throw new Error(
        `Dissolve target "${options.id}" has no geometry bounding box.`,
      );
    }

    this.id = options.id;
    this.mesh = options.mesh;
    this.collisionWorld = options.collisionWorld;
    this.surfaceRegistry = options.surfaceRegistry;
    this.dissolveDurationSecondsValue = options.dissolveDurationSeconds;
    this.collisionDisableProgressValue = options.collisionDisableProgress;
    this.activationRangeMetresValue = activationRangeMetres;
    this.authoredVisible = this.mesh.visible;
    this.localBounds = bounds.clone();

    // Soluble presentation gets private material instances so fade state never
    // mutates a material shared by unrelated authored geometry.
    this.originalMaterial = this.mesh.material;
    const clonedMaterial = Array.isArray(this.mesh.material)
      ? this.mesh.material.map((material) => material.clone())
      : this.mesh.material.clone();
    this.mesh.material = clonedMaterial;

    const materials = Array.isArray(clonedMaterial)
      ? clonedMaterial
      : [clonedMaterial];
    this.materialStates = materials.map((material) => ({
      material,
      opacity: material.opacity,
      transparent: material.transparent,
      depthWrite: material.depthWrite,
    }));

    this.ensureCollisionEnabled(true);
    this.applyPresentation();
  }

  get progress(): number {
    return this.progressValue;
  }

  get completed(): boolean {
    return this.completedValue;
  }

  get collisionEnabled(): boolean {
    return this.collisionEnabledValue;
  }

  get dissolveDurationSeconds(): number {
    return this.dissolveDurationSecondsValue;
  }

  get collisionDisableProgress(): number {
    return this.collisionDisableProgressValue;
  }

  get activationRangeMetres(): number {
    return this.activationRangeMetresValue;
  }

  /** Debug/evidence counter intentionally survives reset cycles. */
  get completionCount(): number {
    return this.completionCountValue;
  }

  /**
   * Contact/activation test against the authored mesh bounds.
   *
   * The player remains a world-space sphere. The sphere centre is transformed
   * into target-local space and its radius is conservatively expanded by the
   * smallest world scale, matching the collision world's transform policy.
   */
  isWithinActivationRange(
    position: { readonly x: number; readonly y: number; readonly z: number },
    radiusMetres: number,
  ): boolean {
    if (this.disposed || this.completedValue) return false;
    if (!Number.isFinite(radiusMetres) || radiusMetres <= 0) return false;

    this.mesh.updateWorldMatrix(true, false);
    this.inverseWorld.copy(this.mesh.matrixWorld).invert();
    this.localPoint
      .set(position.x, position.y, position.z)
      .applyMatrix4(this.inverseWorld);

    const elements = this.mesh.matrixWorld.elements;
    const scaleX = Math.hypot(elements[0], elements[1], elements[2]);
    const scaleY = Math.hypot(elements[4], elements[5], elements[6]);
    const scaleZ = Math.hypot(elements[8], elements[9], elements[10]);
    const minimumScale = Math.min(scaleX, scaleY, scaleZ);
    if (minimumScale <= SCALE_EPSILON) return false;

    const localRadius =
      (radiusMetres + this.activationRangeMetresValue) / minimumScale;

    this.closestPoint.set(
      THREE.MathUtils.clamp(
        this.localPoint.x,
        this.localBounds.min.x,
        this.localBounds.max.x,
      ),
      THREE.MathUtils.clamp(
        this.localPoint.y,
        this.localBounds.min.y,
        this.localBounds.max.y,
      ),
      THREE.MathUtils.clamp(
        this.localPoint.z,
        this.localBounds.min.z,
        this.localBounds.max.z,
      ),
    );

    return (
      this.localPoint.distanceToSquared(this.closestPoint) <=
      localRadius * localRadius
    );
  }

  /** Advance bounded progress while Goop is deliberately activating the target. */
  advance(deltaSeconds: number): void {
    if (this.disposed || this.completedValue) return;
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      throw new Error(
        'Dissolve deltaSeconds must be positive and finite.',
      );
    }

    const previousProgress = this.progressValue;
    this.progressValue = THREE.MathUtils.clamp(
      this.progressValue +
        deltaSeconds / this.dissolveDurationSecondsValue,
      0,
      1,
    );

    if (
      previousProgress < this.collisionDisableProgressValue &&
      this.progressValue >= this.collisionDisableProgressValue
    ) {
      this.ensureCollisionEnabled(false);
    }

    this.applyPresentation();

    if (!this.completedValue && this.progressValue >= 1) {
      this.completedValue = true;
      this.mesh.visible = false;
      this.completionCountValue += 1;
      this.events.emit('completed', { target: this });
    }
  }

  /** Restore authored visibility, collision, and zero progress without reload. */
  reset(): void {
    if (this.disposed) return;

    this.progressValue = 0;
    this.completedValue = false;
    this.ensureCollisionEnabled(true);
    this.applyPresentation();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.collisionWorld.unregister(this.mesh);
    this.surfaceRegistry.unregister(this.mesh);
    this.events.clear();

    for (const state of this.materialStates) {
      state.material.dispose();
    }
    this.mesh.material = this.originalMaterial;
  }

  private ensureCollisionEnabled(enabled: boolean): void {
    if (enabled) {
      this.collisionWorld.register(this.mesh);
      this.surfaceRegistry.register(this.mesh);
    } else {
      this.collisionWorld.unregister(this.mesh);
      this.surfaceRegistry.unregister(this.mesh);
    }

    if (this.collisionEnabledValue === enabled) return;
    this.collisionEnabledValue = enabled;
    this.events.emit('collisionChanged', {
      target: this,
      collisionEnabled: enabled,
    });
  }

  private applyPresentation(): void {
    const fade = 1 - this.progressValue * 0.9;
    this.mesh.visible = this.authoredVisible && !this.completedValue;

    for (const state of this.materialStates) {
      const material = state.material;
      material.opacity = state.opacity * fade;
      material.transparent =
        this.progressValue > 0 ? true : state.transparent;
      material.depthWrite =
        this.progressValue > 0 ? false : state.depthWrite;
      material.needsUpdate = true;
    }
  }
}

/**
 * Only explicitly-marked meshes enter the dissolve runtime.
 *
 * Arbitrary level meshes are ignored even if Goop is touching them.
 */
export function createAuthoredDissolveTarget(
  mesh: THREE.Mesh,
  collisionWorld: CollisionWorld,
  surfaceRegistry: SurfaceRegistry,
): DissolveTarget | undefined {
  if (mesh.userData.soluble !== true) return undefined;

  const id =
    typeof mesh.userData.solubleId === 'string' &&
    mesh.userData.solubleId.length > 0
      ? mesh.userData.solubleId
      : mesh.name;

  return new DissolveTarget({
    id,
    mesh,
    collisionWorld,
    surfaceRegistry,
    dissolveDurationSeconds: Number(
      mesh.userData.dissolveDurationSeconds ?? 1.8,
    ),
    collisionDisableProgress: Number(
      mesh.userData.dissolveCollisionDisableProgress ?? 0.72,
    ),
    activationRangeMetres: Number(
      mesh.userData.dissolveActivationRangeMetres ?? 0.12,
    ),
  });
}
