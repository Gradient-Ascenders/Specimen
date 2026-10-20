import * as THREE from 'three';
import type { KinematicBody } from '../physics/KinematicBody.ts';
import type { Vector3State } from '../render/slime/SlimePresentationContract.ts';

export const CULTIVATION_VENT_ARRIVAL = Object.freeze({
  bob: Object.freeze({ x: -11, y: 24, z: 4 }),
  goop: Object.freeze({ x: -9, y: 21.5, z: 4 }),
  minimumSeconds: 2.2,
  cameraReturnSeconds: .65,
});

/** A short, physics-driven entrance through Room 1's actual 4m ceiling hole.
 * The regular bodies, falling/landing animation and audio remain authoritative.
 * No new scene, assets, lights or gameplay checkpoint are created.
 */
export class CultivationVentArrival {
  private playing = false;
  private elapsed = 0;
  private previousElapsed = 0;
  private returnStart: number | undefined;
  private readonly origin = new THREE.Vector3();
  private readonly spawn = new THREE.Vector3();
  private readonly impulse = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly cameraPosition = new THREE.Vector3();
  private readonly cameraOrientation = new THREE.Quaternion();
  private readonly look = new THREE.Matrix4();
  private readonly up = new THREE.Vector3(0, 1, 0);

  get active(): boolean { return this.playing; }
  get seconds(): number { return this.elapsed; }

  begin(room: THREE.Object3D, bob: KinematicBody, goop: KinematicBody): void {
    this.elapsed = this.previousElapsed = 0; this.returnStart = undefined;
    this.origin.set(0, 0, 0); room.localToWorld(this.origin);
    this.spawn.copy(CULTIVATION_VENT_ARRIVAL.goop); room.localToWorld(this.spawn);
    goop.teleport(this.spawn); goop.applyKnockback(this.impulse.set(0, -4, 0));
    this.spawn.copy(CULTIVATION_VENT_ARRIVAL.bob); room.localToWorld(this.spawn);
    bob.teleport(this.spawn); bob.applyKnockback(this.impulse.set(0, -3, 0));
    this.playing = true;
  }

  /** Called after normal body physics; pause/preparation never advance this clock. */
  update(dt: number, bob: KinematicBody, goop: KinematicBody): boolean {
    if (!this.playing) return false;
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError('Invalid vent-arrival timestep.');
    this.previousElapsed = this.elapsed; this.elapsed += dt;
    if (this.returnStart === undefined && this.elapsed >= CULTIVATION_VENT_ARRIVAL.minimumSeconds && bob.grounded && goop.grounded) {
      this.returnStart = this.elapsed;
    }
    if (this.returnStart !== undefined && this.elapsed >= this.returnStart + CULTIVATION_VENT_ARRIVAL.cameraReturnSeconds) {
      this.playing = false; return true;
    }
    return false;
  }

  /** The underlying follow rig continues updating, providing a smooth hand-back. */
  present(camera: THREE.PerspectiveCamera, alpha: number, bob: Vector3State, goop: Vector3State): void {
    if (!this.playing) return;
    const seconds = THREE.MathUtils.lerp(this.previousElapsed, this.elapsed, THREE.MathUtils.clamp(alpha, 0, 1));
    const u = this.returnStart === undefined ? 0 : THREE.MathUtils.clamp(
      (seconds - this.returnStart) / CULTIVATION_VENT_ARRIVAL.cameraReturnSeconds, 0, 1);
    const blend = u * u * (3 - 2 * u);
    this.target.set((bob.x + goop.x) / 2, (bob.y + goop.y) / 2 + .45, (bob.z + goop.z) / 2);
    // Remain inside the room (below the ceiling and in front of the first
    // suspended platform), even while both actors are above the vent opening.
    this.cameraPosition.set(this.origin.x - 1.5,
      this.origin.y + THREE.MathUtils.clamp(this.target.y - this.origin.y + 3.2, 4.5, 16.4),
      this.origin.z + 10.5);
    this.look.lookAt(this.cameraPosition, this.target, this.up);
    this.cameraOrientation.setFromRotationMatrix(this.look);
    camera.position.lerpVectors(this.cameraPosition, camera.position, blend);
    camera.quaternion.slerp(this.cameraOrientation, 1 - blend);
    camera.updateMatrixWorld(true);
  }

  cancel(): void { this.playing = false; this.elapsed = this.previousElapsed = 0; this.returnStart = undefined; }
}
