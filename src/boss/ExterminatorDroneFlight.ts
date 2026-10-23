import * as THREE from 'three';
import { CollisionHit, CollisionLayer, type CollisionWorld } from '../physics/CollisionWorld.ts';
import { FINAL_ARENA, FINAL_BOSS_TUNING, FINAL_DRONE_FLIGHT as T } from './FinalBossConfig.ts';

interface FlightTarget {
  readonly position: THREE.Vector3Like;
  readonly velocity: THREE.Vector3Like;
}

interface FlightSlot {
  readonly velocity: THREE.Vector3;
  readonly aim: THREE.Vector3;
  readonly previous: THREE.Vector3;
  age: number;
  group: number;
  member: number;
}

/** Boss-local steering. Jumping changes a flight goal, never the navigation
 * mode or the drone's position. All departures/chases share bounded speed and
 * acceleration; physical decks are avoided/slid around, not a central hub. */
export class ExterminatorDroneFlight {
  private readonly slots: FlightSlot[];
  private groups: readonly number[] = [];
  private bearing = 0;
  private guardianSlots = 0;
  private readonly goal = new THREE.Vector3();
  private readonly desiredVelocity = new THREE.Vector3();
  private readonly difference = new THREE.Vector3();
  private readonly displacement = new THREE.Vector3();
  private readonly separation = new THREE.Vector3();
  private readonly hit = new CollisionHit();
  private readonly world: CollisionWorld;
  private readonly pursuers:number;
  private readonly collisionRadius:number;
  private readonly bearingOffset:number;

  constructor(world: CollisionWorld,options:{capacity?:number;pursuers?:number;collisionRadius?:number;bearingOffset?:number}={}) {
    this.world=world;this.pursuers=options.pursuers??FINAL_BOSS_TUNING.pursuers;this.collisionRadius=options.collisionRadius??T.collisionRadius;this.bearingOffset=options.bearingOffset??0;
    this.slots=Array.from({length:options.capacity??FINAL_BOSS_TUNING.droneCount},()=>({velocity:new THREE.Vector3(),aim:new THREE.Vector3(0,0,-1),previous:new THREE.Vector3(),age:0,group:-1,member:0}));
  }

  get guardianCount(): number { return this.guardianSlots; }
  isGuardian(index: number): boolean { return index < this.guardianSlots; }

  beginWave(groups: readonly number[], roots: readonly THREE.Object3D[], machine: THREE.Object3D, target: FlightTarget): void {
    this.reset();
    this.groups = groups;
    this.guardianSlots = groups.reduce((sum, n) => sum + n, 0);
    this.bearing = Math.atan2(target.position.z - machine.position.z, target.position.x - machine.position.x)+this.bearingOffset;
    machine.updateWorldMatrix(true, false);
    let group = 0, member = 0;
    for (let i = 0; i < roots.length; i++) {
      const root = roots[i]!, slot = this.slots[i]!;
      if (!root.visible) continue;
      if (i < this.guardianSlots) {
        slot.group = group; slot.member = member++;
        if (member === groups[group]) { group++; member = 0; }
      } else slot.member = i - this.guardianSlots;
      // Staggered ports on the actual hull, not disconnected world anchors.
      const layer = Math.floor(i / 6);
      root.position.set((i % 2 ? 1 : -1) * (3 + layer * .22), -.75 + layer * .38, 1.4 + Math.floor(i / 2) % 3 * 1.2)
        .applyMatrix4(machine.matrixWorld);
      slot.previous.copy(root.position);
      slot.aim.subVectors(target.position, root.position).normalize();
      root.updateMatrixWorld(true);
    }
  }

  update(dt: number, time: number, roots: readonly THREE.Object3D[], target: FlightTarget, boss: THREE.Vector3Like): void {
    for (let i = 0; i < roots.length; i++) {
      const root = roots[i]!, slot = this.slots[i]!;
      if (!root.visible) { slot.velocity.set(0, 0, 0); continue; }
      slot.previous.copy(root.position);
      slot.age += dt;
      this.difference.subVectors(target.position, root.position).normalize();
      slot.aim.lerp(this.difference, 1 - Math.exp(-9 * dt)).normalize();
      if (slot.age < .12 + i * .045) continue;

      if (this.isGuardian(i)) {
        const size = this.groups[slot.group]!;
        const angle = this.bearing + (slot.group - (this.groups.length - 1) / 2) * T.groupSeparationRadians
          + (slot.member - (size - 1) / 2) * .075 + Math.sin(time * .35) * .025;
        this.goal.set(boss.x + Math.cos(angle) * T.guardianRadius,
          boss.y - 2 + (slot.member % 2 - .5) * 1.8 + Math.sin(time * 1.5 + i) * .3,
          boss.z + Math.sin(angle) * T.guardianRadius);
      } else {
        const angle = this.bearing + slot.member * Math.PI * 2 / this.pursuers + time * T.pursuitAngularSpeed;
        // Short bounded lead keeps pace with running; vertical jumps remain a
        // continuous altitude target, not a switch back to the boss formation.
        this.goal.set(target.position.x + THREE.MathUtils.clamp(target.velocity.x * .2, -2.5, 2.5) + Math.cos(angle) * T.pursuitRadius,
          THREE.MathUtils.clamp(target.position.y + T.hoverOffset, FINAL_ARENA.floorY + 4.6, FINAL_ARENA.ceilingY - 5),
          target.position.z + THREE.MathUtils.clamp(target.velocity.z * .2, -2.5, 2.5) + Math.sin(angle) * T.pursuitRadius);
        const radial = Math.hypot(this.goal.x, this.goal.z - FINAL_ARENA.centreZ), limit = FINAL_ARENA.radius - 3;
        if (radial > limit) {
          this.goal.x *= limit / radial;
          this.goal.z = FINAL_ARENA.centreZ + (this.goal.z - FINAL_ARENA.centreZ) * limit / radial;
        }
      }

      this.desiredVelocity.subVectors(this.goal, root.position).multiplyScalar(1.7);
      // A little separation prevents three flanking drones from collapsing
      // into one target, without rebuilding a navigation graph every frame.
      for (let j = 0; j < roots.length; j++) {
        if (i === j || !roots[j]!.visible) continue;
        this.separation.subVectors(root.position, roots[j]!.position);
        const distance = this.separation.length();
        if (distance > .001 && distance < 2.7) this.desiredVelocity.addScaledVector(this.separation, (1 - distance / 2.7) * 7 / distance);
      }
      this.desiredVelocity.y = THREE.MathUtils.clamp(this.desiredVelocity.y, -T.maximumVerticalSpeed, T.maximumVerticalSpeed);
      this.desiredVelocity.clampLength(0, T.maximumSpeed);
      this.displacement.copy(this.desiredVelocity).multiplyScalar(T.avoidanceSeconds);
      if (this.world.sweepSphere(root.position, this.displacement, this.collisionRadius, this.hit, CollisionLayer.Movement)) {
        const into = this.desiredVelocity.dot(this.hit.normal);
        if (into < 0) this.desiredVelocity.addScaledVector(this.hit.normal, -into);
      }
      this.difference.subVectors(this.desiredVelocity, slot.velocity).clampLength(0, T.maximumAcceleration * dt);
      slot.velocity.add(this.difference);
      this.displacement.copy(slot.velocity).multiplyScalar(dt);
      this.move(root, slot);
      root.updateMatrixWorld(true);
    }
  }

  copyAimDirection(index: number, out: THREE.Vector3): THREE.Vector3 { return out.copy(this.slots[index]!.aim); }

  /** Offset only the visible child; the squad root and collider remain at the
   * current fixed-step pose even on high-refresh displays. */
  copyPresentationOffset(index: number, current: THREE.Vector3, alpha: number, out: THREE.Vector3): THREE.Vector3 {
    return out.subVectors(this.slots[index]!.previous, current).multiplyScalar(1 - THREE.MathUtils.clamp(alpha, 0, 1));
  }

  reset(): void {
    this.groups = []; this.guardianSlots = 0; this.bearing = 0;
    for (const slot of this.slots) { slot.velocity.set(0, 0, 0); slot.age = 0; slot.group = -1; slot.member = 0; }
  }

  private move(root: THREE.Object3D, slot: FlightSlot): void {
    for (let pass = 0; pass < 2; pass++) {
      if (!this.world.sweepSphere(root.position, this.displacement, this.collisionRadius, this.hit, CollisionLayer.Movement)) {
        root.position.add(this.displacement); return;
      }
      root.position.copy(this.hit.point).addScaledVector(this.hit.normal, .002);
      this.displacement.multiplyScalar(1 - this.hit.fraction);
      const into = this.displacement.dot(this.hit.normal);
      if (into < 0) this.displacement.addScaledVector(this.hit.normal, -into);
      const velocityInto = slot.velocity.dot(this.hit.normal);
      if (velocityInto < 0) slot.velocity.addScaledVector(this.hit.normal, -velocityInto);
    }
  }
}
