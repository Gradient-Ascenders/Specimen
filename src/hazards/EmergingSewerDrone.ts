import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRustedSewerDrone } from '../levels/RustedSewerDrone.ts';
import { SewerDroneDamage } from '../render/hazards/SewerDroneDamage.ts';
import { DissolveTarget } from '../abilities/DissolveTarget.ts';
import type { DissolveSystem } from '../abilities/DissolveSystem.ts';
import type { CollisionWorld } from '../physics/CollisionWorld.ts';
import type { SurfaceRegistry } from '../physics/SurfaceRegistry.ts';
import type { SecurityDronePresentationResources } from '../render/hazards/SecurityDronePresentation.ts';
import type { DroneProjectileSystem } from './DroneProjectileSystem.ts';
import { SecurityDrone, type SecurityDroneTarget } from './SecurityDrone.ts';
import { bindWeakSewerDroneBurns, SewerDroneMotion, sewerDroneLampPower, WeakSewerDroneState, WEAK_SEWER_DRONE, type WeakSewerDroneSnapshot } from './WeakSewerDrone.ts';
import { WorldAudioSource } from '../audio/WorldAudio.ts';

export const TRANSIT_SEWER_EMERGENCE_RANGE = 16;
export const TRANSIT_SEWER_ATTACK_RANGE = 10;
export const TRANSIT_SEWER_CONE_HALF_ANGLE = .275;
export const TRANSIT_SEWER_ALERT_SECONDS = 5;
export const TRANSIT_SEWER_RETALIATION_RANGE = 30;
// The last guard needs clearance for the projectile radius and hover bob over
// the inner catwalk rail, including Volt running close to that rail.
export const TRANSIT_SEWER_DRONE_POSITIONS = [[18, -.68, 100], [18, -.68, 124], [-11.5, .72, 132]] as const;

export interface SewerDroneGuard {
  /** Authored point above the guarded deck, in the drone parent's coordinates. */
  readonly routeTarget: THREE.Vector3;
  readonly acidSurfaceY: number;
  readonly sweepMetres: number;
  /** Keep the narrow gaze on an already acquired runner through the warning. */
  readonly followAcquiredTarget?: boolean;
}

export interface EmergingSewerDroneSnapshot extends WeakSewerDroneSnapshot {
  readonly alertSeconds?: number;
  readonly position?: readonly number[];
  readonly rotation?: readonly number[];
  readonly motionSeconds?: number;
}

/** Room adapter around the shared sewer state, motion, hit reactions and AI. */
export class EmergingSewerDrone {
  readonly id: string;
  readonly state = new WeakSewerDroneState();
  readonly motion = new SewerDroneMotion();
  readonly shell;
  readonly target: DissolveTarget;
  readonly weapon: SecurityDrone;
  readonly light = new THREE.SpotLight(0xffa13b, 0, TRANSIT_SEWER_ATTACK_RANGE, TRANSIT_SEWER_CONE_HALF_ANGLE, .2, 2);
  readonly beam: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  private readonly origin: THREE.Vector3;
  private readonly submerged: THREE.Vector3;
  private readonly damage: SewerDroneDamage;
  private readonly direction = new THREE.Vector3(0, 0, -1);
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly aim = new THREE.Vector3();
  private readonly routeTarget: THREE.Vector3;
  private readonly scanPoint = new THREE.Vector3();
  private readonly worldGaze = new THREE.Vector3();
  private readonly worldRotation = new THREE.Quaternion();
  private readonly sweepMetres: number;
  private readonly followAcquiredTarget: boolean;
  private readonly audio: WorldAudioSource;
  private readonly materials = new Set<THREE.Material>();
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private unbind?: () => void;
  private alertSeconds = 0;
  private readonly retaliationTargets: SecurityDroneTarget[] = [];
  get retaliating(): boolean { return this.alertSeconds > 0 && this.state.state !== 'destroyed'; }
  private disposed = false;
  constructor(id: string, parent: THREE.Group, origin: THREE.Vector3,
    world: CollisionWorld, surfaces: SurfaceRegistry, projectiles: DroneProjectileSystem, resources: SecurityDronePresentationResources,
    guard: SewerDroneGuard) {
    this.id = id;
    this.origin = origin.clone();
    this.submerged = origin.clone().setY(guard.acidSurfaceY);
    this.routeTarget = guard.routeTarget.clone(); this.sweepMetres = guard.sweepMetres;
    this.followAcquiredTarget = guard.followAcquiredTarget ?? false;
    this.shell = createRustedSewerDrone();
    this.shell.body.name = `${id}-rusted-core`; this.shell.body.position.copy(this.submerged);
    this.shell.body.rotation.set(.2, 0, 1.1); parent.add(this.shell.body);
    // Batch machinery by material AND damage stage; progressive missing parts
    // remain intact, while three enemies avoid dozens of tiny hardware draws.
    const batches = new Map<THREE.Material, Map<number, THREE.BufferGeometry[]>>();
    for (const part of [...this.shell.body.children]) {
      if (!(part instanceof THREE.Mesh) || part === this.shell.eye || Array.isArray(part.material)) continue;
      part.updateMatrix(); let geometry = part.geometry.clone();
      if (geometry.index) { const old = geometry; geometry = old.toNonIndexed(); old.dispose(); }
      geometry.applyMatrix4(part.matrix);
      const stages = batches.get(part.material) ?? new Map<number, THREE.BufferGeometry[]>();
      const stage = part.userData.damageStage ?? 0, list = stages.get(stage) ?? [];
      list.push(geometry); stages.set(stage, list); batches.set(part.material, stages);
      part.removeFromParent(); part.geometry.dispose();
    }
    for (const [material, stages] of batches) for (const [stage, pieces] of stages) {
      const mesh = new THREE.Mesh(mergeGeometries(pieces)!, material);
      if (stage) mesh.userData.damageStage = stage;
      this.shell.body.add(mesh); pieces.forEach(piece => piece.dispose());
    }
    this.shell.body.traverse(o => { if (o instanceof THREE.Mesh) {
      this.geometries.add(o.geometry);
      for (const material of Array.isArray(o.material) ? o.material : [o.material]) this.materials.add(material);
    } });
    Object.assign(this.shell.body.userData, { surfaceTag: 'default', soluble: true, solubleId: id, dissolveDynamicCollider: true,
      authoringRole: 'weak-sewer-drone', dissolveDurationSeconds: .15, dissolveCollisionDisableProgress: .99 });
    this.target = new DissolveTarget({ id, mesh: this.shell.body, collisionWorld: world, surfaceRegistry: surfaces,
      dissolveDurationSeconds: .15, collisionDisableProgress: .99 });
    this.damage = new SewerDroneDamage(this.shell.body, -1.18, `${id}-debris`);
    this.weapon = new SecurityDrone({ id, type: 'ceiling', initialPosition: this.submerged,
      colliderSize: new THREE.Vector3(2, 1.3, 2), forward: new THREE.Vector3(0, 0, -1), scanAxis: new THREE.Vector3(0, 1, 0),
      // The adapter supplies the actual shell gaze, including acquired-target
      // following. AI must not turn a separate cone away from the visible beam.
      scanHalfAngleRadians: 0, scanSpeedRadiansPerSecond: 0, trackTargets: false,
      detectionHalfAngleRadians: TRANSIT_SEWER_CONE_HALF_ANGLE, forwardAnchorMetres: 1.3,
      detectionRangeMetres: TRANSIT_SEWER_ATTACK_RANGE, warningSeconds: WEAK_SEWER_DRONE.warningSeconds,
      fireIntervalSeconds: WEAK_SEWER_DRONE.fireIntervalSeconds, targetLossGraceSeconds: .1, cooldownSeconds: .5,
      muzzleAnchor: new THREE.Vector3(0, -.1, -2.5), targetPolicy: 'all', initialScanPhase: 0 }, world, surfaces, projectiles, resources, this.target.mesh);
    parent.add(this.weapon.root);
    this.weapon.setCollisionEnabled(false); this.weapon.setPresentationVisible(false);
    this.light.name = `${id}-search-light`; this.light.castShadow = false; parent.add(this.light, this.light.target);
    const geometry = new THREE.ConeGeometry(Math.tan(TRANSIT_SEWER_CONE_HALF_ANGLE) * TRANSIT_SEWER_ATTACK_RANGE, TRANSIT_SEWER_ATTACK_RANGE, 16, 1, true);
    geometry.translate(0, -TRANSIT_SEWER_ATTACK_RANGE / 2, 0);
    this.beam = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xffa13b, transparent: true, opacity: .04,
      depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }));
    this.beam.name = `${id}-searchlight`; parent.add(this.beam);
    this.audio = new WorldAudioSource({ root: this.shell.body, kind: 'drone', enabled: () => this.weapon.readModel.enabled });
    this.reset();
  }
  bindBurns(system: DissolveSystem): void {
    this.unbind?.();
    const shared = bindWeakSewerDroneBurns(system, this.target, this.state);
    const alert = system.events.on('burnStarted', event => {
      if (event.target !== this.target) return;
      if (this.state.state === 'destroyed') { this.alertSeconds = 0; this.suspend(); return; }
      // Only accepted projectile reactions alert us. Refreshing an existing
      // alert must not repeatedly restart the warning and suppress retaliation.
      if (!this.retaliating) this.weapon.cancelTransientState();
      this.alertSeconds = TRANSIT_SEWER_ALERT_SECONDS;
    });
    this.unbind = () => { alert(); shared(); };
  }
  update(dt: number, targets: readonly SecurityDroneTarget[], enabled: boolean): void {
    if (!enabled) { this.suspend(); return; }
    let near = false;
    // Test proximity against the final acid emergence area, not the submerged
    // mesh; use all persistent bodies, independent of currently selected slime.
    for (const target of targets) {
      if (target.eligible === false) continue;
      this.aim.set(target.position.x, target.position.y, target.position.z);
      this.shell.body.parent!.worldToLocal(this.aim);
      const squared = this.aim.distanceToSquared(this.origin);
      near ||= squared <= TRANSIT_SEWER_EMERGENCE_RANGE ** 2;
    }
    this.state.update(dt, near);
    this.alertSeconds = Math.max(0, this.alertSeconds - dt);
    if (this.state.state === 'destroyed') this.alertSeconds = 0;
    this.retaliationTargets.length = 0;
    if (this.retaliating) for (const target of targets) {
      if (target.slimeId === 'goop' && target.eligible !== false) this.retaliationTargets.push(target);
    }
    const combatTargets = this.retaliationTargets.length ? this.retaliationTargets : targets;
    this.shell.body.visible = this.state.state !== 'destroyed' && !this.target.completed;
    let following = false;
    if (this.retaliating || this.followAcquiredTarget) for (const target of combatTargets) {
      if (target.eligible === false || target.slimeId !== (this.retaliating ? 'goop' : this.weapon.readModel.targetSlimeId)) continue;
      this.scanPoint.set(target.position.x, target.position.y, target.position.z);
      following = true; break;
    }
    if (!following) {
      this.scanPoint.copy(this.routeTarget);
      this.scanPoint.z += Math.sin(this.motion.time * .45) * this.sweepMetres;
      this.shell.body.parent!.localToWorld(this.scanPoint);
    }
    this.motion.update(dt, this.shell.body, this.state, this.origin, this.scanPoint, this.submerged.y);
    this.damage.update(dt, this.state.hits);
    this.weapon.root.position.copy(this.shell.body.position); this.weapon.root.quaternion.copy(this.shell.body.quaternion);
    this.shell.body.getWorldQuaternion(this.worldRotation);
    this.worldGaze.set(0, 0, -1).applyQuaternion(this.worldRotation);
    this.weapon.setPatrolDirection(this.worldGaze);
    this.weapon.setDetectionRange(this.retaliating ? TRANSIT_SEWER_RETALIATION_RANGE : TRANSIT_SEWER_ATTACK_RANGE);
    this.weapon.setEnabled(this.state.state === 'active'); this.weapon.update(dt, combatTargets);
    if (this.retaliating && this.weapon.readModel.targetSlimeId === 'goop' &&
        (this.weapon.readModel.state === 'warning' || this.weapon.readModel.state === 'firing')) this.alertSeconds = TRANSIT_SEWER_ALERT_SECONDS;
    this.syncLight();
  }
  private syncLight(): void {
    const power = this.weapon.readModel.enabled ? sewerDroneLampPower(this.motion.time) : 0;
    this.light.intensity = 26 * power;
    const range = this.weapon.readModel.detectionRangeMetres;
    this.light.distance = range;
    this.beam.scale.setScalar(range / TRANSIT_SEWER_ATTACK_RANGE);
    this.shell.eye.material.color.setHex(power > .5 ? 0xffa13b : power ? 0x41180a : 0x080b07);
    this.direction.set(0, 0, -1).applyQuaternion(this.shell.body.quaternion);
    this.light.position.copy(this.shell.body.position).addScaledVector(this.direction, 1.3);
    this.light.target.position.copy(this.light.position).addScaledVector(this.direction, range);
    this.beam.position.copy(this.light.position); this.direction.negate(); this.beam.quaternion.setFromUnitVectors(this.up, this.direction);
    this.beam.material.opacity = .04 * power;
    if (!power) this.beam.visible = false;
  }
  suspend(): void { this.weapon.setEnabled(false); this.light.intensity = 0; this.beam.visible = false; }
  reset(): void {
    this.alertSeconds = 0;
    this.state.reset(); this.motion.reset(); this.target.reset(); this.damage.reset(0); this.weapon.reset();
    this.weapon.setCollisionEnabled(false); this.weapon.setPresentationVisible(false);
    this.shell.body.position.copy(this.submerged);
    // A level shell intersects the acid through its body centre, not through a
    // tilted rotor tip. Visibility alone never enables weapons or searchlights.
    this.aim.subVectors(this.routeTarget, this.submerged).setY(0).normalize();
    this.shell.body.quaternion.setFromUnitVectors(this.direction.set(0, 0, -1), this.aim);
    this.shell.body.visible = true; this.suspend(); this.syncLight();
  }
  capture(): EmergingSewerDroneSnapshot {
    return { ...this.state.capture(), alertSeconds: this.alertSeconds, position: this.shell.body.position.toArray(),
      rotation: this.shell.body.quaternion.toArray(), motionSeconds: this.motion.time };
  }
  restore(state: EmergingSewerDroneSnapshot): void {
    this.reset(); this.state.restore(state); this.damage.reset(state.hits);
    this.alertSeconds = Number.isFinite(state.alertSeconds) ? THREE.MathUtils.clamp(state.alertSeconds!, 0, TRANSIT_SEWER_ALERT_SECONDS) : 0;
    if (state.state === 'active' || state.state === 'destroyed') this.shell.body.position.y = this.origin.y + WEAK_SEWER_DRONE.riseMetres;
    // Checkpoint restoration retains the actual damped emergence pose, so a
    // partially risen drone does not return to the acid and jump upward again.
    if (state.position?.length === 3 && state.position.every(Number.isFinite)) this.shell.body.position.fromArray(state.position);
    if (state.rotation?.length === 4 && state.rotation.every(Number.isFinite)) this.shell.body.quaternion.fromArray(state.rotation).normalize();
    if (state.motionSeconds !== undefined && Number.isFinite(state.motionSeconds) && state.motionSeconds >= 0) this.motion.time = state.motionSeconds;
    if (state.hits === 3) this.target.advance(this.target.dissolveDurationSeconds);
    this.shell.body.visible = state.state !== 'destroyed';
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    this.unbind?.(); this.audio.dispose(); this.damage.dispose(); this.weapon.dispose(); this.target.dispose();
    this.shell.body.removeFromParent();
    this.geometries.forEach(g => g.dispose()); this.materials.forEach(m => m.dispose());
    this.beam.removeFromParent(); this.beam.geometry.dispose(); this.beam.material.dispose();
    this.light.removeFromParent(); this.light.target.removeFromParent(); this.light.dispose();
  }
}
