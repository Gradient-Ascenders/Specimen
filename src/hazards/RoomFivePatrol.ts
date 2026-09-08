import * as THREE from 'three';

/** Independent, resettable clocks: power loss pauses rather than rewinds patrols. */
export class RoomFivePatrol {
  readonly position = new THREE.Vector3();
  readonly direction = new THREE.Vector3();
  elapsed = 0;
  private readonly along = new THREE.Vector3();
  private readonly outward = new THREE.Vector3();
  readonly origin: THREE.Vector3;
  private readonly forward: THREE.Vector3;
  readonly initialPhase: number;
  readonly periodSeconds: number;
  constructor(origin: THREE.Vector3, forward: THREE.Vector3,
    initialPhase: number, periodSeconds = 12) {
    this.origin = origin; this.forward = forward;
    this.initialPhase = initialPhase; this.periodSeconds = periodSeconds;
    this.along.set(forward.z, 0, -forward.x).normalize();
    this.outward.set(-forward.x, 0, -forward.z).normalize();
    this.reset();
  }
  update(dt: number, enabled: boolean): void {
    if (enabled) this.elapsed = (this.elapsed + dt) % this.periodSeconds;
    const phase = this.initialPhase + this.elapsed / this.periodSeconds * Math.PI * 2;
    // A small racetrack stays on the guarded side of the authored cover.
    this.position.copy(this.origin).addScaledVector(this.along, Math.sin(phase))
      .addScaledVector(this.outward, (1 - Math.cos(phase)) * 1.2);
    this.position.y += Math.cos(phase) * .2;
    // Broad outward look creates a readable crossing window, not random tracking.
    const lookAway = 1 - THREE.MathUtils.smoothstep(Math.cos(phase), -.3, 0);
    this.direction.copy(this.forward).applyAxisAngle(UP, lookAway * 1.8);
  }
  reset(): void { this.elapsed = 0; this.update(0, false); }
}
const UP = new THREE.Vector3(0, 1, 0);
