import * as THREE from 'three';
import { EventBus } from '../core/EventBus.ts';
import type { ReadonlyVector3State } from '../physics/KinematicBody.ts';

export const SPECIMEN_DASH = Object.freeze({ durationSeconds: 0.18, cooldownSeconds: 1.2,
  speedMultiplier: 2.3, accelerationMultiplier: 10 });

/** Supplies a short locomotion request; the body still owns sweeps, gravity and contacts. */
export class SpecimenDash {
  readonly events = new EventBus<{ started: Record<string, never>; dodged: Record<string, never> }>();
  private readonly direction = new THREE.Vector3();
  private remaining = 0;
  private cooldown = 0;
  private dodgeConfirmed = false;
  get readModel() { return { active: this.remaining > 0, cooldownRemainingSeconds: this.cooldown,
    cooldownProgress: 1 - this.cooldown / SPECIMEN_DASH.cooldownSeconds }; }
  get movementDirection(): ReadonlyVector3State { return this.direction; }
  get locomotion() { return this.remaining > 0 ? SPECIMEN_DASH : undefined; }

  update(dt: number, controls: { enabled: boolean; pressed: boolean; cancelled: boolean;
    movement: ReadonlyVector3State; forward: ReadonlyVector3State; up: ReadonlyVector3State }): void {
    if (!Number.isFinite(dt) || dt <= 0) throw new Error('Specimen dash requires a positive finite step.');
    this.remaining = Math.max(0, this.remaining - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!controls.enabled || controls.cancelled) { this.cancel(); return; }
    if (!controls.pressed || this.cooldown > 1e-9) return;
    this.direction.copy(controls.movement);
    if (this.direction.lengthSq() < 1e-6) this.direction.copy(controls.forward);
    const normalSpeed = this.direction.dot(controls.up);
    this.direction.x -= controls.up.x * normalSpeed;
    this.direction.y -= controls.up.y * normalSpeed;
    this.direction.z -= controls.up.z * normalSpeed;
    if (this.direction.lengthSq() < 1e-6) return;
    this.direction.normalize();
    this.remaining = SPECIMEN_DASH.durationSeconds;
    this.cooldown = SPECIMEN_DASH.cooldownSeconds;
    this.dodgeConfirmed = false;
    this.events.emit('started', {});
  }
  /** Called only when a live attack would have hurt the player without I-frames. */
  confirmDodge(): boolean {
    if (this.remaining <= 0 || this.dodgeConfirmed) return false;
    this.dodgeConfirmed = true;
    this.events.emit('dodged', {});
    return true;
  }
  cancel(): void { this.remaining = 0; }
  reset(): void { this.remaining = this.cooldown = 0; }
}
