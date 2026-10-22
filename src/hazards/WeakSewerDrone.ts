import * as THREE from 'three';
import type { DissolveTarget } from '../abilities/DissolveTarget.ts';
import type { DissolveSystem } from '../abilities/DissolveSystem.ts';

/** The damaged Cultivation sewer scout's shared combat/emergence contract. */
export const WEAK_SEWER_DRONE = Object.freeze({ hits: 3, emergenceSeconds: 1.5,
  fireIntervalSeconds: .65, warningSeconds: .4, projectileDamage: 30, projectileSpeed: 120,
  riseMetres: 4, attackRangeMetres: 40 });
export type WeakSewerDronePhase = 'dormant' | 'rebooting' | 'active' | 'destroyed';
export interface WeakSewerDroneSnapshot { state: WeakSewerDronePhase; elapsed: number; hits: number }

export class WeakSewerDroneState {
  state: WeakSewerDronePhase = 'dormant';
  elapsed = 0;
  hits = 0;
  update(dt: number, near: boolean): void {
    if (this.state === 'dormant' && near) this.state = 'rebooting';
    if (this.state === 'rebooting') {
      this.elapsed += dt;
      if (this.elapsed + 1e-9 >= WEAK_SEWER_DRONE.emergenceSeconds) this.state = 'active';
    }
  }
  hit(): void {
    if (this.state === 'destroyed') return;
    this.hits = Math.min(WEAK_SEWER_DRONE.hits, this.hits + 1);
    if (this.hits === WEAK_SEWER_DRONE.hits) this.destroy();
    else { this.state = 'active'; this.elapsed = WEAK_SEWER_DRONE.emergenceSeconds; }
  }
  destroy(): void { this.state = 'destroyed'; this.hits = WEAK_SEWER_DRONE.hits; }
  reset(destroyed = false): void { this.state = destroyed ? 'destroyed' : 'dormant'; this.elapsed = 0; this.hits = destroyed ? 3 : 0; }
  capture(): WeakSewerDroneSnapshot { return { state: this.state, elapsed: this.elapsed, hits: this.hits }; }
  restore(value: WeakSewerDroneSnapshot): void {
    if (!['dormant', 'rebooting', 'active', 'destroyed'].includes(value.state) || !Number.isFinite(value.elapsed) || value.elapsed < 0 ||
      !Number.isInteger(value.hits) || value.hits < 0 || value.hits > 3 || (value.state === 'destroyed') !== (value.hits === 3)) throw new Error('Invalid sewer drone state');
    this.state = value.state; this.elapsed = value.elapsed; this.hits = value.hits;
  }
}

/** Reuse the sewer's damaged-eye pulse for a stable, non-shadowed lamp slot. */
export const sewerDroneLampPower = (seconds: number): number => Math.sin(seconds * 35) > 0 ? 1 : .18;

/** Same damped rise, hover and aim rotation as the original sewer enemy. */
export class SewerDroneMotion {
  time = 0;
  private readonly aim = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly forward = new THREE.Vector3(0, 0, -1);
  update(dt: number, body: THREE.Mesh, state: WeakSewerDroneState, origin: THREE.Vector3,
    target: { readonly x: number; readonly y: number; readonly z: number }): void {
    if (state.state !== 'rebooting' && state.state !== 'active') return;
    this.time += dt;
    const lift = THREE.MathUtils.smoothstep(state.elapsed, 0, WEAK_SEWER_DRONE.emergenceSeconds);
    body.position.y = THREE.MathUtils.damp(body.position.y, origin.y + lift * (WEAK_SEWER_DRONE.riseMetres + Math.sin(this.time * 2.2) * .18), 6, dt);
    this.aim.set(target.x, target.y, target.z); body.parent!.worldToLocal(this.aim);
    this.aim.sub(body.position).normalize();
    this.rotation.setFromUnitVectors(this.forward, this.aim);
    body.quaternion.slerp(this.rotation, 1 - Math.exp(-8 * dt));
  }
  reset(): void { this.time = 0; }
}

/** Three separate accepted acid reactions, rearmed only after burn completion. */
export function bindWeakSewerDroneBurns(system: DissolveSystem, target: DissolveTarget, state: WeakSewerDroneState): () => void {
  const sound = system.setCompletionSound(target, () => state.hits >= 3 ? 'world-drone-dissolve-01' : 'goop-dissolve-complete-01');
  const started = system.events.on('burnStarted', event => { if (event.target === target) state.hit(); });
  const completed = system.events.on('burnCompleted', event => { if (event.target === target && state.hits < 3) target.reset(); });
  return () => { sound(); started(); completed(); };
}
