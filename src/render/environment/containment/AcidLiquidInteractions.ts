import * as THREE from 'three';
import type { AcidSurfaceMaterial } from './AcidSurfaceMaterial.ts';

export interface AcidContactBody {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly velocity: { readonly x: number; readonly y: number; readonly z: number };
  readonly radiusMetres: number;
  readonly lastContactImpactSpeedMetresPerSecond?: number;
}

/** Read-only contact sampler. Fixed body slots and cached bounds avoid frame allocations. */
export class AcidLiquidInteractions {
  private readonly bounds: THREE.Box3;
  private readonly slots = Array.from({ length: 2 }, () => ({
    touching: false, initialized: false, x: 0, y: 0, z: 0, verticalSpeed: 0, cooldown: 0,
  }));

  constructor(privateMaterial: AcidSurfaceMaterial, surface: THREE.Mesh) {
    this.material = privateMaterial;
    surface.updateWorldMatrix(true, false);
    surface.geometry.computeBoundingBox();
    this.bounds = surface.geometry.boundingBox!.clone().applyMatrix4(surface.matrixWorld);
  }
  private readonly material: AcidSurfaceMaterial;

  update(deltaSeconds: number, bodies: readonly AcidContactBody[]): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new Error('Invalid acid contact timestep.');
    for (let i = 0; i < this.slots.length; i++) {
      const state = this.slots[i], body = bodies[i];
      if (!body) { state.initialized = false; state.touching = false; continue; }
      const p = body.position;
      const dx = p.x - state.x, dy = p.y - state.y, dz = p.z - state.z;
      const teleported = state.initialized && dx * dx + dy * dy + dz * dz > 9;
      const within = p.x >= this.bounds.min.x && p.x <= this.bounds.max.x && p.z >= this.bounds.min.z && p.z <= this.bounds.max.z;
      const touching = within && Math.abs(p.y - body.radiusMetres - this.bounds.max.y) <= 0.14;
      state.cooldown = Math.max(0, state.cooldown - deltaSeconds);
      if (touching && !teleported) {
        if (!state.touching) {
          const impact = Math.max(0, -state.verticalSpeed, body.lastContactImpactSpeedMetresPerSecond ?? 0);
          this.material.disturb(p.x, p.z, this.bounds.max.y, Math.min(1.7, 0.65 + impact * 0.09));
          state.cooldown = 0.14;
        } else if (state.cooldown === 0 && Math.hypot(body.velocity.x, body.velocity.z) > 0.15) {
          this.material.disturb(p.x, p.z, this.bounds.max.y, 0.3);
          state.cooldown = 0.14;
        }
      } else if (state.touching && !teleported && body.velocity.y > 0.5) {
        this.material.disturb(state.x, state.z, this.bounds.max.y, 0.45);
      }
      state.touching = touching;
      state.initialized = true;
      state.x = p.x; state.y = p.y; state.z = p.z; state.verticalSpeed = body.velocity.y;
    }
  }

  /** Level 1's existing fail volume precedes contact: project its fall pulse onto the basin. */
  fallPulse(body: AcidContactBody): void {
    const p = body.position;
    if (p.x < this.bounds.min.x || p.x > this.bounds.max.x || p.z < this.bounds.min.z || p.z > this.bounds.max.z) return;
    this.material.disturb(p.x, p.z, this.bounds.max.y, Math.min(1.7, 0.9 + Math.max(0, -body.velocity.y) * 0.05));
  }

  reset(): void {
    for (const slot of this.slots) { slot.touching = false; slot.initialized = false; slot.cooldown = 0; slot.verticalSpeed = 0; }
    this.material.clearInteractions();
  }
}
