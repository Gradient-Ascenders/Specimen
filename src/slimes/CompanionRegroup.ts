import * as THREE from 'three';

import { CollisionHit, CollisionLayer, type CollisionWorld } from '../physics/CollisionWorld.ts';
import type { JumpInputState, KinematicBody } from '../physics/KinematicBody.ts';
import type { SlimePassiveInteraction } from './SlimeHUDState.ts';

export type CompanionId = 'bob' | 'goop' | 'volt';
type Point = readonly [number, number, number];

/** A deliberately authored walk, in the supplied room root's coordinates. */
export interface CompanionWalk {
  readonly points: readonly Point[];
  readonly bounds: readonly [Point, Point];
  /** Small, explicitly approved floor lips; never a puzzle jump or a gap. */
  readonly stepUps?: readonly Point[];
}

/**
 * Supplies locomotion and tap jumps at marked floor lips. Level owners decide when a walk is safe;
 * bodies, abilities, hazards and progression retain their existing authority.
 * Routes are resolved from the current pose each step, so recovery cannot
 * resume a stale waypoint or carry movement into a different room.
 */
export class CompanionRegroup {
  readonly movement = {
    bob: new THREE.Vector3(), goop: new THREE.Vector3(), volt: new THREE.Vector3(),
  };
  readonly jump: Record<CompanionId, JumpInputState> = {
    bob: {pressed: false, held: false, released: false},
    goop: {pressed: false, held: false, released: false},
    volt: {pressed: false, held: false, released: false},
  };
  private readonly states: Partial<Record<CompanionId, string>> = {};
  private statusKey = '||';
  private interactions: readonly SlimePassiveInteraction[] = [];
  private readonly local = new THREE.Vector3();
  private readonly nearest = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly origin = new THREE.Vector3();
  private readonly probe = new THREE.Vector3();
  private readonly down = new THREE.Vector3(0, -1, 0);
  private readonly hit = new CollisionHit();

  get passiveInteractions(): readonly SlimePassiveInteraction[] { return this.interactions; }

  beginStep(): void {
    for (const id of ['bob', 'goop', 'volt'] as const) {
      this.movement[id].set(0, 0, 0);
      this.jump[id].pressed = this.jump[id].released = false;
      delete this.states[id];
    }
  }

  /** Returns true only when the roster's short companion status changed. */
  commit(): boolean {
    const key = `${this.states.bob ?? ''}|${this.states.goop ?? ''}|${this.states.volt ?? ''}`;
    if (key === this.statusKey) return false;
    this.statusKey = key;
    this.interactions = (['bob', 'goop', 'volt'] as const).flatMap(slimeId =>
      this.states[slimeId] ? [{ slimeId, label: this.states[slimeId]!, kind: 'companion' as const }] : []);
    return true;
  }

  reset(): void { this.beginStep(); this.commit(); }

  steer(
    id: CompanionId, body: KinematicBody, walk: CompanionWalk | undefined,
    world: CollisionWorld, root?: THREE.Object3D,
  ): THREE.Vector3 {
    const movement = this.movement[id];
    movement.set(0, 0, 0);
    delete this.states[id];
    if (!walk || !body.grounded || body.usingSurfaceGravity || body.chargingJump) return movement;
    this.local.copy(body.position);
    if (root) root.worldToLocal(this.local);
    const [min, max] = walk.bounds;
    if (this.local.x < min[0] || this.local.y < min[1] || this.local.z < min[2] ||
        this.local.x > max[0] || this.local.y > max[1] || this.local.z > max[2]) return movement;

    let nearestDistance = Infinity, segment = 0;
    for (let i = 0; i < walk.points.length - 1; i++) {
      const a = walk.points[i], b = walk.points[i + 1];
      const dx = b[0] - a[0], dz = b[2] - a[2];
      const t = THREE.MathUtils.clamp(((this.local.x - a[0]) * dx + (this.local.z - a[2]) * dz) /
        (dx * dx + dz * dz), 0, 1);
      const x = a[0] + dx * t, z = a[2] + dz * t;
      const distance = (x - this.local.x) ** 2 + (z - this.local.z) ** 2;
      // At a shared corner prefer the outgoing segment.
      if (distance <= nearestDistance + 1e-8) {
        nearestDistance = distance; segment = i;
        this.nearest.set(x, this.local.y, z);
      }
    }
    const end = walk.points.at(-1)!;
    const stoppingDistance = body.groundStoppingDistanceMetres;
    if (Math.hypot(end[0] - this.local.x, end[2] - this.local.z) < Math.max(.6, stoppingDistance + .1)) return movement;
    // First join the lane sideways; never cut diagonally across room obstacles.
    if (nearestDistance > .16) this.target.copy(this.nearest);
    else {
      let next = segment + 1;
      const corner = walk.points[next];
      if (next < walk.points.length - 1 && Math.hypot(corner[0] - this.local.x, corner[2] - this.local.z) < .4) next++;
      this.target.set(walk.points[next][0], this.local.y, walk.points[next][2]);
    }
    if (root) root.localToWorld(this.target);
    movement.copy(this.target).sub(body.position).setY(0);
    const distance = movement.length();
    if (distance < .05) return movement.set(0, 0, 0);
    movement.divideScalar(distance);

    // Look beyond stopping distance. A shut door, removed floor or newly
    // obstructed route yields zero input instead of walking into danger.
    const lookAhead = Math.min(distance, Math.max(.9, stoppingDistance + .2));
    this.origin.copy(body.position);
    this.probe.copy(movement).multiplyScalar(lookAhead);
    let obstructed = world.sweepSphere(this.origin, this.probe, body.radiusMetres, this.hit,
      CollisionLayer.Movement, body.supportCollider ?? undefined) && this.hit.normal.y < .1;
    const step = walk.stepUps?.find(point => Math.hypot(point[0] - this.local.x, point[2] - this.local.z) < 1.7);
    if (obstructed && step) {
      // Confirm the marked lip has solid floor beyond it and less than 40 cm
      // rise. A closing door or a missing landing cannot turn into a jump.
      const beyond = this.hit.distance + body.radiusMetres + .15;
      this.probe.copy(movement).multiplyScalar(beyond).add(this.origin); this.probe.y += .6;
      const landing = world.raycast(this.probe, this.down, body.radiusMetres + 1.2, this.hit, CollisionLayer.Movement);
      const rise = this.hit.point.y - (body.position.y - body.radiusMetres - .01);
      const safeLanding = landing && this.hit.normal.y > .7 && rise >= -.08 && rise <= .4 &&
        (id === 'goop' || this.hit.object?.userData.textureRole !== 'acid-floor');
      this.origin.y += .45;
      this.probe.copy(movement).multiplyScalar(lookAhead);
      const clearAbove = !world.sweepSphere(this.origin, this.probe, body.radiusMetres, this.hit,
        CollisionLayer.Movement, body.supportCollider ?? undefined);
      this.origin.copy(body.position);
      if (safeLanding && clearAbove) {
        this.jump[id].pressed = this.jump[id].released = true;
        obstructed = false;
      }
    }
    this.probe.copy(movement).multiplyScalar(lookAhead);
    this.probe.add(this.origin).y += .25;
    const supported = world.raycast(this.probe, this.down, body.radiusMetres + .85, this.hit, CollisionLayer.Movement);
    const hazardous = id !== 'goop' && this.hit.object?.userData.textureRole === 'acid-floor';
    if (obstructed || !supported || hazardous || this.hit.normal.y < .7) {
      movement.set(0, 0, 0);
      this.jump[id].pressed = this.jump[id].released = false;
      this.states[id] = 'Waiting for a clear path';
    } else this.states[id] = 'Catching up';
    return movement;
  }
}
