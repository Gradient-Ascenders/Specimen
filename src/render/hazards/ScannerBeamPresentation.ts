import * as THREE from 'three';
import type { CollisionWorld } from '../../physics/CollisionWorld.ts';
import { BeamOcclusion } from './BeamOcclusion.ts';

/** Work caps, independent of graphics preset and fixed-step catch-up count. */
export const SCANNER_BEAM_REFRESH_SECONDS = .1;
export const SCANNER_BEAMS_PER_FRAME = 2;

export interface ScannerBeamBinding {
  readonly mesh: THREE.Mesh;
  readonly ignoredCollider: THREE.Mesh;
  readonly enabled: () => boolean;
}

/** Owns only cached geometry/visibility, never colliders, detection or resources. */
export class ScannerBeamPresentation {
  private readonly occlusion = new BeamOcclusion();
  private readonly frustum = new THREE.Frustum();
  private readonly projectionView = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();
  private readonly origin = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly states;
  private elapsed = 0;
  private cursor = 0;
  private readonly world: CollisionWorld;

  constructor(world: CollisionWorld, bindings: readonly ScannerBeamBinding[]) {
    this.world = world;
    this.states = bindings.map(binding => {
      binding.mesh.geometry.computeBoundingSphere();
      binding.mesh.visible = false;
      return { ...binding, bounds: binding.mesh.geometry.boundingSphere!.clone(),
        matrix: new THREE.Matrix4(), revision: -1, refreshedAt: -Infinity,
        inView: false, valid: false, eligible: false };
    });
  }

  /** Once before the main draw, after camera and room visibility have settled.
   * A frame without fixed updates still handles camera entry/blocker changes.
   * Unchanged poses retain their geometry indefinitely. Changed poses/blockers
   * are sampled at 10 Hz; round-robin servicing bounds catch-up work and avoids
   * starvation. An invalid/newly visible beam waits hidden for a fresh sample.
   */
  update(deltaSeconds: number, camera: THREE.Camera): void {
    this.elapsed += Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    camera.updateWorldMatrix(true, false);
    this.projectionView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projectionView, camera.coordinateSystem);
    let visible = 0;
    for (const state of this.states) {
      const mesh = state.mesh;
      let inView = state.enabled() && mesh.layers.test(camera.layers);
      for (let parent = mesh.parent; inView && parent; parent = parent.parent) inView = parent.visible;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      inView &&= materials.some(material => material.visible && material.opacity > 0);
      if (inView) {
        mesh.updateWorldMatrix(true, false);
        this.sphere.copy(state.bounds).applyMatrix4(mesh.matrixWorld);
        inView = this.frustum.intersectsSphere(this.sphere);
      }
      if (!inView || !state.inView) state.valid = false;
      state.inView = inView;
      state.eligible = false;
      mesh.visible = inView && state.valid;
      if (inView) visible++;
    }
    if (!visible) return; // No collision snapshot or sweeps outside presentation scope.

    this.world.withStableQueryTransforms(() => {
      const revision = this.world.getLineOfSightRevision();
      for (const state of this.states) {
        state.eligible = state.inView && (!state.valid ||
          (this.elapsed - state.refreshedAt + 1e-9 >= SCANNER_BEAM_REFRESH_SECONDS &&
            (state.revision !== revision || !state.matrix.equals(state.mesh.matrixWorld))));
      }
      let refreshed = 0;
      for (let inspected = 0; inspected < this.states.length && refreshed < SCANNER_BEAMS_PER_FRAME; inspected++) {
        const index = this.cursor;
        this.cursor = (this.cursor + 1) % this.states.length;
        const state = this.states[index];
        if (!state.eligible) continue;
        this.origin.setFromMatrixPosition(state.mesh.matrixWorld);
        this.occlusion.clipGeometry(this.world, this.origin, this.rotation,
          state.mesh.geometry, state.ignoredCollider, state.mesh.matrixWorld);
        state.matrix.copy(state.mesh.matrixWorld);
        state.revision = revision;
        state.refreshedAt = this.elapsed;
        state.valid = true;
        state.mesh.visible = true;
        refreshed++;
      }
    });
  }

  reset(): void {
    this.elapsed = 0; this.cursor = 0;
    for (const state of this.states) {
      state.valid = state.inView = state.eligible = false;
      state.refreshedAt = -Infinity; state.revision = -1;
      state.mesh.visible = false;
    }
  }
}
