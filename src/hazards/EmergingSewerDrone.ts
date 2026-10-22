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
import { bindWeakSewerDroneBurns, SewerDroneMotion, sewerDroneLampPower, WeakSewerDroneState, WEAK_SEWER_DRONE } from './WeakSewerDrone.ts';
import { WorldAudioSource } from '../audio/WorldAudio.ts';

export const TRANSIT_SEWER_EMERGENCE_RANGE = 16;
export const TRANSIT_SEWER_ATTACK_RANGE = 10;
export const TRANSIT_SEWER_DRONE_POSITIONS = [[18, -.68, 100], [18, -.68, 124], [18, -.68, 146]] as const;

/** Room adapter around the shared sewer state, motion, hit reactions and AI. */
export class EmergingSewerDrone {
  readonly id: string;
  readonly state = new WeakSewerDroneState();
  readonly motion = new SewerDroneMotion();
  readonly shell;
  readonly target: DissolveTarget;
  readonly weapon: SecurityDrone;
  readonly light = new THREE.SpotLight(0xffa13b, 0, TRANSIT_SEWER_ATTACK_RANGE, .4, .3, 2);
  readonly beam: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  private readonly origin: THREE.Vector3;
  private readonly submerged: THREE.Vector3;
  private readonly damage: SewerDroneDamage;
  private readonly direction = new THREE.Vector3(0, 0, -1);
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly aim = new THREE.Vector3();
  private readonly audio: WorldAudioSource;
  private readonly materials = new Set<THREE.Material>();
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private unbind?: () => void;
  private disposed = false;
  constructor(id: string, parent: THREE.Group, origin: THREE.Vector3,
    world: CollisionWorld, surfaces: SurfaceRegistry, projectiles: DroneProjectileSystem, resources: SecurityDronePresentationResources) {
    this.id = id;
    this.origin = origin.clone(); this.submerged = origin.clone().add(new THREE.Vector3(0, -3, 0));
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
      scanHalfAngleRadians: .035, scanSpeedRadiansPerSecond: .12, detectionHalfAngleRadians: Math.PI,
      detectionRangeMetres: TRANSIT_SEWER_ATTACK_RANGE, warningSeconds: WEAK_SEWER_DRONE.warningSeconds,
      fireIntervalSeconds: WEAK_SEWER_DRONE.fireIntervalSeconds, targetLossGraceSeconds: .1, cooldownSeconds: .5,
      muzzleAnchor: new THREE.Vector3(0, -.1, -2.5), targetPolicy: 'all', initialScanPhase: 0 }, world, surfaces, projectiles, resources, this.target.mesh);
    parent.add(this.weapon.root);
    this.weapon.setCollisionEnabled(false); this.weapon.setPresentationVisible(false);
    this.light.name = `${id}-search-light`; this.light.castShadow = false; parent.add(this.light, this.light.target);
    const geometry = new THREE.ConeGeometry(Math.tan(.4) * TRANSIT_SEWER_ATTACK_RANGE, TRANSIT_SEWER_ATTACK_RANGE, 16, 1, true);
    geometry.translate(0, -TRANSIT_SEWER_ATTACK_RANGE / 2, 0);
    this.beam = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xffa13b, transparent: true, opacity: .04,
      depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }));
    this.beam.name = `${id}-searchlight`; parent.add(this.beam);
    this.audio = new WorldAudioSource({ root: this.shell.body, kind: 'drone', enabled: () => this.weapon.readModel.enabled });
    this.reset();
  }
  bindBurns(system: DissolveSystem): void { this.unbind?.(); this.unbind = bindWeakSewerDroneBurns(system, this.target, this.state); }
  update(dt: number, targets: readonly SecurityDroneTarget[], enabled: boolean): void {
    if (!enabled) { this.suspend(); return; }
    let near = false, closest = targets[0]!, distance = Infinity;
    // Test proximity against the final acid emergence area, not the submerged
    // mesh; use all persistent bodies, independent of currently selected slime.
    for (const target of targets) {
      if (target.eligible === false) continue;
      this.aim.set(target.position.x, target.position.y, target.position.z);
      this.shell.body.parent!.worldToLocal(this.aim);
      const squared = this.aim.distanceToSquared(this.origin);
      if (squared < distance) { distance = squared; closest = target; }
      near ||= squared <= TRANSIT_SEWER_EMERGENCE_RANGE ** 2;
    }
    this.state.update(dt, near);
    this.shell.body.visible = this.state.state !== 'dormant' && this.state.state !== 'destroyed' && !this.target.completed;
    this.motion.update(dt, this.shell.body, this.state, this.origin, closest.position);
    this.damage.update(dt, this.state.hits);
    this.weapon.root.position.copy(this.shell.body.position); this.weapon.root.quaternion.copy(this.shell.body.quaternion);
    this.weapon.setEnabled(this.state.state === 'active'); this.weapon.update(dt, targets);
    this.syncLight();
  }
  private syncLight(): void {
    const power = this.weapon.readModel.enabled ? sewerDroneLampPower(this.motion.time) : 0;
    this.light.intensity = 26 * power;
    this.shell.eye.material.color.setHex(power > .5 ? 0xffa13b : power ? 0x41180a : 0x080b07);
    this.direction.set(0, 0, -1).applyQuaternion(this.shell.body.quaternion);
    this.light.position.copy(this.shell.body.position).addScaledVector(this.direction, 1.3);
    this.light.target.position.copy(this.light.position).addScaledVector(this.direction, TRANSIT_SEWER_ATTACK_RANGE);
    this.beam.position.copy(this.light.position); this.direction.negate(); this.beam.quaternion.setFromUnitVectors(this.up, this.direction);
    this.beam.material.opacity = .04 * power;
    if (!power) this.beam.visible = false;
  }
  suspend(): void { this.weapon.setEnabled(false); this.light.intensity = 0; this.beam.visible = false; }
  reset(): void {
    this.state.reset(); this.motion.reset(); this.target.reset(); this.damage.reset(0); this.weapon.reset();
    this.weapon.setCollisionEnabled(false); this.weapon.setPresentationVisible(false);
    this.shell.body.position.copy(this.submerged); this.shell.body.rotation.set(.2, 0, 1.1); this.shell.body.visible = false; this.suspend();
  }
  restore(state: ReturnType<WeakSewerDroneState['capture']>): void {
    this.reset(); this.state.restore(state); this.damage.reset(state.hits);
    this.shell.body.position.copy(state.state === 'dormant' ? this.submerged : this.origin);
    if (state.state === 'active' || state.state === 'destroyed') this.shell.body.position.y += WEAK_SEWER_DRONE.riseMetres;
    if (state.hits === 3) this.target.advance(this.target.dissolveDurationSeconds);
    this.shell.body.visible = state.state !== 'dormant' && state.state !== 'destroyed';
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
