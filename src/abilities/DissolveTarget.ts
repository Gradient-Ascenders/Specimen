import * as THREE from 'three';

import { EventBus } from '../core/EventBus.ts';
import type { CollisionWorld } from '../physics/CollisionWorld.ts';
import type { SurfaceRegistry } from '../physics/SurfaceRegistry.ts';
import {
  DissolveMaterialBundle,
  type DissolveMaterialBundleDiagnostics,
} from '../render/dissolve/DissolveMaterial.ts';

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
  private readonly originalDepthMaterial: THREE.Material | undefined;
  private readonly originalDistanceMaterial: THREE.Material | undefined;
  private readonly dissolveMaterials: DissolveMaterialBundle;

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

    // Soluble presentation gets private shader/depth/distance materials so its
    // progress never mutates a material shared by unrelated authored geometry.
    this.originalMaterial = this.mesh.material;
    this.originalDepthMaterial = this.mesh.customDepthMaterial;
    this.originalDistanceMaterial = this.mesh.customDistanceMaterial;
    const sourceMaterials = Array.isArray(this.originalMaterial)
      ? this.originalMaterial
      : [this.originalMaterial];
    this.dissolveMaterials = new DissolveMaterialBundle(
      sourceMaterials,
      this.id,
    );
    this.mesh.material = Array.isArray(this.originalMaterial)
      ? [...this.dissolveMaterials.surfaceMaterials]
      : this.dissolveMaterials.surfaceMaterials[0];
    this.mesh.customDepthMaterial = this.dissolveMaterials.depthMaterial;
    this.mesh.customDistanceMaterial = this.dissolveMaterials.distanceMaterial;

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

  /** Read-only renderer diagnostics used by deterministic tests/debug evidence. */
  get renderDiagnostics(): DissolveMaterialBundleDiagnostics {
    return this.dissolveMaterials.diagnostics;
  }

  /** Copy the nearest point on the authored bounds to a caller-owned vector. */
  copyClosestWorldPoint(
    point: { readonly x: number; readonly y: number; readonly z: number },
    target: THREE.Vector3,
  ): THREE.Vector3 {
    this.mesh.updateWorldMatrix(true, false);
    this.inverseWorld.copy(this.mesh.matrixWorld).invert();
    this.localPoint
      .set(point.x, point.y, point.z)
      .applyMatrix4(this.inverseWorld);
    target.set(
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
    return target.applyMatrix4(this.mesh.matrixWorld);
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

  /** Advance bounded progress for one accepted fixed-step acid burn. */
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

    this.dissolveMaterials.dispose();
    this.mesh.material = this.originalMaterial;
    this.mesh.customDepthMaterial = this.originalDepthMaterial;
    this.mesh.customDistanceMaterial = this.originalDistanceMaterial;
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
    this.mesh.visible = this.authoredVisible && !this.completedValue;
    this.dissolveMaterials.setDissolveAmount(this.progressValue);
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
