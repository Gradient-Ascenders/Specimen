import * as THREE from 'three';
import type { DissolveTarget } from '../abilities/DissolveTarget.ts';
import type { DissolveSystem } from '../abilities/DissolveSystem.ts';
import type { KinematicBody } from '../physics/KinematicBody.ts';
import { ColliderTransformMode, CollisionLayer, DEFAULT_SOLID_COLLISION_LAYERS, type CollisionWorld } from '../physics/CollisionWorld.ts';
import type { SurfaceRegistry } from '../physics/SurfaceRegistry.ts';
import { LiftDroneFlightPresentation } from '../render/hazards/LiftDroneFlightPresentation.ts';
import { DroneBreakupPresentation } from '../render/hazards/DroneBreakupPresentation.ts';
import { SecurityDronePresentationResources } from '../render/hazards/SecurityDronePresentation.ts';
import { SlimeDamageSystem } from '../systems/SlimeDamageSystem.ts';
import { DroneProjectileSystem, type DroneProjectileTarget } from './DroneProjectileSystem.ts';
import { SecurityDrone, type SecurityDroneTarget } from './SecurityDrone.ts';
import { ROOM_FOUR_SPAWNS } from '../levels/CultivationRoomFourController.ts';
import { ROOM_FOUR_ANCHORS } from '../levels/LevelTwoRoomFourGreybox.ts';
import type { LevelTwoRoomFourGreybox } from '../levels/LevelTwoRoomFourGreybox.ts';

type DronePhase = 'pending' | 'approaching' | 'firing' | 'corroding' | 'falling' | 'gone';
interface Slot { flight: LiftDroneFlightPresentation; drone: SecurityDrone; target: DissolveTarget; root: THREE.Group; phase: DronePhase; fallTime: number; ejected: number }

/** Bounded reusable drone targets; no per-frame construction or full-scene raycasts. */
export class ElevatorDroneEncounter {
  readonly damage = new SlimeDamageSystem();
  readonly projectiles: DroneProjectileSystem;
  private readonly flameMaterial = new THREE.MeshBasicMaterial({ vertexColors: true,
    transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false,
    side: THREE.DoubleSide, forceSinglePass: true, toneMapped: false });
  private readonly breakup: DroneBreakupPresentation;
  private readonly resources: SecurityDronePresentationResources;
  private readonly slots: Slot[];
  private readonly targets: SecurityDroneTarget[];
  private readonly projectileTargets: DroneProjectileTarget[];
  private active: 'bob' | 'goop' = 'bob';
  private retargetCooldown = 0;
  private readonly unsubscribers: (() => void)[] = [];
  private disposed = false;
  private ended = false;
  private readonly room: LevelTwoRoomFourGreybox;
  private readonly world: CollisionWorld;
  private readonly bodies: readonly KinematicBody[];
  private readonly local = new THREE.Vector3();
  private readonly ejection = new THREE.Vector3();
  private readonly impulse = new THREE.Vector3();

  constructor(room: LevelTwoRoomFourGreybox,
    world: CollisionWorld, surfaces: SurfaceRegistry,
    bob: KinematicBody, goop: KinematicBody, targets: readonly DissolveTarget[],
    dissolve: DissolveSystem, requestDeath: (id: 'bob' | 'goop') => void,
    surfaceMaps?: { bumpMap: THREE.Texture | null; roughnessMap: THREE.Texture | null; scuffMap?: THREE.Texture }) {
    this.resources = new SecurityDronePresentationResources(surfaceMaps, true);
    this.room = room; this.world = world;
    this.breakup = new DroneBreakupPresentation(room.droneRoots.length);
    room.root.add(this.breakup.root);
    this.bodies = [bob, goop];
    this.projectiles = new DroneProjectileSystem(world, this.damage, {
      speedMetresPerSecond: 24, lifetimeSeconds: 2, maximumRangeMetres: 40, damage: 15,
    });
    const encounter = this;
    this.targets = [bob, goop].map((body, i) => ({
      slimeId: i === 0 ? 'bob' : 'goop', position: body.position,
      get eligible() { return encounter.active === (i === 0 ? 'bob' : 'goop'); },
    }));
    this.projectileTargets = [bob, goop].map((body, i) => ({ slimeId: i === 0 ? 'bob' : 'goop',
      position: body.position, previousPosition: body.previousPosition, radiusMetres: body.radiusMetres }));
    this.slots = room.droneRoots.map((root, i) => {
      const target = targets.find(t => t.mesh === room.solubleTargetMeshes[i]);
      if (!target) throw new Error(`Missing elevator drone target ${i + 1}`);
      const drone = new SecurityDrone({ id: `room-4-drone-${i + 1}`, type: 'ceiling',
        initialPosition: new THREE.Vector3(), colliderSize: new THREE.Vector3(1.2, .7, 1.2),
        forward: new THREE.Vector3(0, -1, 0), scanAxis: new THREE.Vector3(0, 0, 1),
        scanHalfAngleRadians: .3, scanSpeedRadiansPerSecond: .4,
        detectionHalfAngleRadians: 1.5, detectionRangeMetres: 20,
        warningSeconds: .8, fireIntervalSeconds: .9, targetLossGraceSeconds: .02,
        cooldownSeconds: .6, muzzleAnchor: new THREE.Vector3(0, -.5, 0),
        targetPolicy: 'both', initialScanPhase: .5,
      }, world, surfaces, this.projectiles, this.resources, target.mesh);
      drone.collider.userData.authoringRole = 'lift-drone-movement-body';
      root.add(drone.root);
      drone.root.scale.setScalar(1.5);
      const flight = new LiftDroneFlightPresentation(drone.presentation, this.resources, this.flameMaterial, target, i * 1.7);
      return { flight, drone, target, root, phase: 'pending', fallTime: 0, ejected: 0 };
    });
    this.unsubscribers.push(this.damage.events.on('died', ({ slimeId }) => requestDeath(slimeId)));
    this.unsubscribers.push(dissolve.events.on('burnStarted', ({ target }) => {
      const slot = this.slots.find(s => s.target === target);
      if (!slot || (slot.phase !== 'approaching' && slot.phase !== 'firing')) return;
      slot.phase = 'corroding'; slot.drone.setEnabled(false);
      slot.drone.frontIndicator.material.color.setHex(0xa5ff67);
      slot.drone.frontIndicator.scale.setScalar(1.6);
    }));
    this.reset();
  }

  update(dt: number, active: 'bob' | 'goop'): void {
    if (this.disposed) return;
    const controller = this.room.controller;
    if (controller.readModel.elapsed >= 60) {
      if (!this.ended) { this.ended = true; this.cancelTransientState();
        for (const slot of this.slots) {
          if (slot.phase === 'falling') continue;
          slot.phase = 'gone'; slot.root.visible = false;
          slot.target.mesh.visible = false; slot.drone.collider.visible = false;
          this.world.unregister(slot.target.mesh); } }
    }
    if (!controller.running && !this.ended) return;
    this.retargetCooldown = Math.max(0, this.retargetCooldown - dt);
    if (active !== this.active && this.retargetCooldown === 0) {
      // Existing projectiles survive a switch. New targets get normal acquisition
      // warnings; a cooldown prevents rapid switching from cancelling every volley.
      this.active = active;
      this.retargetCooldown = 1.5;
    }
    this.damage.update(dt);
    let living = 0;
    for (const s of this.slots) if (s.phase === 'approaching' || s.phase === 'firing') living++;
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (!this.ended && slot.phase === 'pending' && ROOM_FOUR_SPAWNS[i].time <= controller.readModel.elapsed + 1e-9 && living < 8) {
        slot.phase = 'approaching'; slot.root.visible = true; living++;
        slot.target.mesh.visible = true; slot.drone.collider.visible = true;
        this.world.setTransformMode(slot.target.mesh, ColliderTransformMode.Dynamic);
      }
      if (slot.phase === 'approaching') {
        slot.root.position.y = Math.max(8, slot.root.position.y - dt * ROOM_FOUR_SPAWNS[i].descentSpeed);
        if (slot.root.position.y <= 12) {
          slot.drone.setEnabled(true);
          slot.drone.update(dt, this.targets, false);
        }
        if (slot.root.position.y <= 8) { slot.phase = 'firing'; slot.drone.setEnabled(true); }
      }
      if (slot.phase === 'firing') {
        slot.root.position.y = Math.max(5, slot.root.position.y - dt * .3);
        slot.drone.update(dt, this.targets);
      }
      if (slot.phase === 'corroding' && slot.target.completed) {
        slot.phase = 'falling'; slot.fallTime = 0;
        slot.drone.frontIndicator.material.color.setHex(0x26352a);
        slot.drone.frontIndicator.scale.setScalar(.78);
      }
      if (slot.phase === 'falling') {
        const previousY = slot.root.position.y + slot.drone.root.position.y;
        slot.fallTime += dt;
        // A downed centre-front drone tumbles sideways, leaving the
        // maintenance vent and its approach clear during the fall.
        const [authoredX, authoredZ] = ROOM_FOUR_ANCHORS[ROOM_FOUR_SPAWNS[i].anchor];
        if (authoredZ > 11 && Math.abs(authoredX) < 2) {
          slot.root.position.x = THREE.MathUtils.lerp(authoredX, i % 2 ? -2.8 : 2.8, Math.min(1, slot.fallTime / .45));
        }
        const supportY = .24;
        const y = Math.max(supportY + .525, slot.root.position.y - 12 * slot.fallTime * slot.fallTime);
        slot.drone.root.position.y = y - slot.root.position.y;
        this.ejectStruckBodies(slot, previousY, y);
        slot.drone.presentation.root.rotation.set(Math.min(.5, slot.fallTime * .6), 0,
          Math.sin(i + 1) * Math.min(.9, slot.fallTime * 1.6));
        if (y <= supportY + .525 + 1e-8) {
          // Impact finishes the wreck's gameplay lifetime. Short, pooled fragments
          // replace the body so subsequent waves cannot build a permanent pile.
          slot.phase = 'gone';
          slot.drone.setCollisionEnabled(false);
          slot.root.visible = false;
          slot.drone.collider.visible = false;
          this.breakup.burst(i, slot.root.position.x, supportY, slot.root.position.z);
        }
      }
      slot.flight.update(dt, slot.phase === 'approaching' || slot.phase === 'firing', slot.phase === 'approaching');
    }
    this.breakup.update(dt);
    this.projectiles.update(dt, this.projectileTargets);
  }

  /** Same full-clearance teleport + 24/12 m/s impulse as the falling platforms. */
  private ejectStruckBodies(slot: Slot, previousY: number, y: number): void {
    for (let i = 0; i < this.bodies.length; i++) {
      if (slot.ejected & (1 << i)) continue;
      const body = this.bodies[i], r = body.radiusMetres;
      this.room.root.worldToLocal(this.local.copy(body.position));
      const dx = this.local.x - slot.root.position.x, dz = this.local.z - slot.root.position.z;
      if (Math.abs(dx) > .9 + r || Math.abs(dz) > .9 + r ||
        y - .525 > this.local.y + r || previousY - .525 < this.local.y - r) continue;
      // Prefer the nearest free edge, but never eject out through the shaft walls.
      let best = Infinity;
      for (let axis = 0; axis < 4; axis++) {
        const sx = axis < 2 ? (axis === 0 ? 1 : -1) : 0;
        const sz = axis >= 2 ? (axis === 2 ? 1 : -1) : 0;
        const x = sx ? slot.root.position.x + sx * (.9 + r + .18) : this.local.x;
        const z = sz ? slot.root.position.z + sz * (.9 + r + .18) : this.local.z;
        if (Math.abs(x) > 4.4 || z < 5.65 || z > 14.3) continue;
        const distance = Math.hypot(x - this.local.x, z - this.local.z);
        if (distance >= best) continue;
        best = distance; this.ejection.set(x, this.local.y, z); this.impulse.set(sx * 24, 12, sz * 24);
      }
      if (!Number.isFinite(best)) continue;
      body.teleport(this.room.root.localToWorld(this.ejection)); body.applyKnockback(this.impulse);
      slot.ejected |= 1 << i;
    }
  }

  diagnostics(): string {
    return this.slots.map((s, i) => `${i + 1}: ${s.phase}, anchor=${ROOM_FOUR_SPAWNS[i].anchor}, height=${s.root.position.y.toFixed(1)}, corrosion=${s.target.progress.toFixed(2)}`).join('\n');
  }
  cancelTransientState(): void {
    this.projectiles.reset();
    for (const slot of this.slots) slot.drone.setEnabled(false);
  }
  reset(): void {
    this.ended = false; this.retargetCooldown = 0; this.projectiles.reset(); this.damage.reset(); this.breakup.reset();
    for (const [i, slot] of this.slots.entries()) {
      slot.drone.reset(); slot.drone.setEnabled(false); slot.flight.reset();
      slot.drone.presentation.root.rotation.set(0, 0, 0);
      const [x, z] = ROOM_FOUR_ANCHORS[ROOM_FOUR_SPAWNS[i].anchor];
      slot.root.visible = false; slot.root.position.set(x, 30, z);
      slot.target.mesh.visible = false; slot.drone.collider.visible = false;
      slot.phase = 'pending'; slot.fallTime = 0; slot.ejected = 0;
      this.world.register(slot.drone.collider, undefined, ColliderTransformMode.Dynamic);
      this.world.setTransformMode(slot.target.mesh, ColliderTransformMode.Dynamic);
      // The damage envelope owns acid/aim queries. Physical bodies still block
      // movement and other drones' sightlines, without occluding their own target.
      this.world.setLayerMask(slot.target.mesh, CollisionLayer.Projectile | CollisionLayer.CameraObstruction);
      this.world.setLayerMask(slot.drone.collider,
        DEFAULT_SOLID_COLLISION_LAYERS & ~(CollisionLayer.Projectile | CollisionLayer.CameraObstruction));
    }
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    for (const slot of this.slots) { slot.flight.dispose(); slot.drone.dispose(); }
    this.projectiles.dispose(); this.damage.dispose(); this.breakup.dispose(); this.resources.dispose(); this.flameMaterial.dispose();
  }
}
