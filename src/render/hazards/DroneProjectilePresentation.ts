import * as THREE from 'three';

import {
  DEFAULT_DRONE_PROJECTILE_CONFIG,
  type DroneProjectileReadState,
} from '../../hazards/DroneProjectileSystem.ts';

/** Minimal pooled travel proxy; final tracer/impact art remains deferred. */
export class DroneProjectilePresentation {
  readonly mesh: THREE.InstancedMesh;

  private readonly states: readonly DroneProjectileReadState[];
  private readonly transform = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private disposed = false;

  constructor(
    states: readonly DroneProjectileReadState[],
    radiusMetres = DEFAULT_DRONE_PROJECTILE_CONFIG.radiusMetres,
  ) {
    if (!Number.isFinite(radiusMetres) || radiusMetres <= 0) {
      throw new Error('Drone projectile presentation radius must be positive and finite.');
    }
    this.states = states;
    this.mesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(radiusMetres, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff3048, toneMapped: false }),
      states.length,
    );
    this.mesh.name = 'cultivation-room-3-drone-projectiles';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.userData.presentationOnly = true;
  }

  update(interpolationAlpha: number): void {
    if (this.disposed) return;
    const alpha = THREE.MathUtils.clamp(interpolationAlpha, 0, 1);
    let visibleCount = 0;
    for (const state of this.states) {
      if (!state.active) continue;
      this.position.set(
        THREE.MathUtils.lerp(state.previousPosition.x, state.position.x, alpha),
        THREE.MathUtils.lerp(state.previousPosition.y, state.position.y, alpha),
        THREE.MathUtils.lerp(state.previousPosition.z, state.position.z, alpha),
      );
      this.transform.makeTranslation(this.position.x, this.position.y, this.position.z);
      this.mesh.setMatrixAt(visibleCount, this.transform);
      visibleCount += 1;
    }
    this.mesh.count = visibleCount;
    if (visibleCount > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }

  reset(): void {
    if (this.disposed) return;
    this.mesh.count = 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.disposed = true;
  }
}
