import * as THREE from 'three';
import { setShadowMapUpdatesActive } from '../render/ShadowLightResources.ts';

import type { ElectricalConnectionTarget, ElectricalTargetRegistry } from '../abilities/ElectricalTargetRegistry.ts';
import { DissolveTarget } from '../abilities/DissolveTarget.ts';
import { CollisionLayer, ColliderTransformMode, type CollisionWorld } from '../physics/CollisionWorld.ts';
import type { KinematicBody } from '../physics/KinematicBody.ts';
import type { SurfaceRegistry } from '../physics/SurfaceRegistry.ts';
import { PoweredLiftDevice, type PoweredCarrierBody } from '../electrical/PoweredDevices.ts';
import type { BlackoutCheckpointParticipant } from './BlackoutCheckpointManager.ts';
import type { SerializableValue } from './BlackoutRuntimeState.ts';
import type { BlackoutTransitRoom } from './BlackoutTransitRoom.ts';
import { LaserHazard, type LaserContactTarget } from '../hazards/LaserHazard.ts';
import { SecurityDrone, type SecurityDroneTarget } from '../hazards/SecurityDrone.ts';
import { DroneProjectileSystem, type DroneProjectileTarget } from '../hazards/DroneProjectileSystem.ts';
import { SecurityDronePresentationResources } from '../render/hazards/SecurityDronePresentation.ts';
import { ShadowedDroneBeam } from '../render/hazards/ShadowedDroneBeam.ts';
import { LaserHazardPresentation } from '../render/hazards/LaserHazardPresentation.ts';
import { DroneProjectilePresentation } from '../render/hazards/DroneProjectilePresentation.ts';
import { SlimeDamageSystem } from '../systems/SlimeDamageSystem.ts';

export type TransitSlimeId = 'bob' | 'goop' | 'volt';
export type TransitBodies = Record<TransitSlimeId, KinematicBody>;

const LIGHT_CHARGE_SECONDS = 1.5;
const BRIDGE_RELEASE_SECONDS = 0.75;
const LIFT_RESIDUAL_SECONDS = 1.2;
const COVER_DROP_SECONDS = 0.85;
const LOCK_RECEIVER_APPROACH = new THREE.Vector3(0, 0.86, 145);
const LOCK_RECEIVER_RANGE_SQ = 9;

interface ReceiverSnapshot { readonly charge: number; readonly latched: boolean }
interface TransitSnapshot {
  readonly active: boolean;
  readonly complete: boolean;
  readonly checkpointStage: number;
  readonly lights: readonly ReceiverSnapshot[];
  readonly covers: readonly { readonly progress: number; readonly elapsed: number; readonly deployed: boolean }[];
  readonly liftGrace: readonly number[];
  readonly lifts: readonly SerializableValue[];
  readonly switchHeld: boolean;
  readonly bridgeDeployed: boolean;
  readonly bridgeLocked: boolean;
  readonly bridgeRelease: number;
  readonly bridgeProgress: number;
  readonly lockReceiver: ReceiverSnapshot;
  readonly checkpointTutorialReached: boolean;
}

interface MutableTimedReceiver {
  readonly target: ElectricalConnectionTarget;
  readonly root: THREE.Group;
  readonly light: THREE.PointLight;
  readonly unregister: () => void;
  readonly targetMaterial: THREE.MeshStandardMaterial;
  readonly ownsTargetMaterial: boolean;
  connected: boolean;
  charge: number;
  latched: boolean;
}

interface CoverState {
  readonly panel: THREE.Mesh;
  readonly support: DissolveTarget;
  readonly startY: number;
  readonly endY: number;
  elapsed: number;
  deployed: boolean;
}
interface TransitCarrier extends PoweredCarrierBody {}

/**
 * Puzzle authority for Level 3 Room 2. Room meshes and broad geometry belong
 * to BlackoutTransitRoom; this controller owns puzzle targets, moving devices,
 * surveillance hazards, and checkpoint-local state.
 */
export class BlackoutTransitController implements BlackoutCheckpointParticipant {
  readonly id = 'blackout-transit-puzzles';
  readonly root = new THREE.Group();
  readonly room: BlackoutTransitRoom;
  lights: readonly MutableTimedReceiver[] = [];
  lockReceiver!: MutableTimedReceiver;
  lifts: readonly PoweredLiftDevice[] = [];
  dissolveTargets: readonly DissolveTarget[] = [];
  covers: readonly CoverState[] = [];
  drones: readonly SecurityDrone[] = [];
  lasers: readonly LaserHazard[] = [];
  private laserPresentation?: LaserHazardPresentation;
  private laserElapsed = 0;
  private readonly laserOffset = new THREE.Vector3();
  readonly damage = new SlimeDamageSystem({ maximumHealth: 100 });
  readonly projectiles: DroneProjectileSystem;
  readonly projectilePresentation: DroneProjectilePresentation;

  switchHeld = false;
  bridgeDeployed = false;
  bridgeLocked = false;
  complete = false;
  checkpointStage = 0;
  objective = 'Find a route across the acid basin.';

  private active = false;
  private readonly world: CollisionWorld;
  private readonly surfaces: SurfaceRegistry;
  private bridgeRelease = 0;
  private bridgeProgress = 0;
  private readonly bridgeStartPosition = new THREE.Vector3();
  private readonly bridgeEndPosition = new THREE.Vector3();
  private checkpointTutorialReached = false;
  private readonly liftGrace = [0, 0];
  private readonly carrierBodies: TransitCarrier[] = [];
  private readonly carrierOrder: TransitSlimeId[] = ['bob', 'goop', 'volt'];
  private readonly beamDirection = new THREE.Vector3();
  private readonly beamUp = new THREE.Vector3(0, 1, 0);
  private readonly bobLaserTarget: LaserContactTarget = { id: 'bob', position: new THREE.Vector3(), radiusMetres: 0.45 };
  private readonly voltLaserTarget: LaserContactTarget = { id: 'volt', position: new THREE.Vector3(), radiusMetres: 0.45 };
  private readonly currentVoltPosition = new THREE.Vector3();
  private pendingFailure: 'bob' | 'volt' | undefined;
  private readonly resources = new SecurityDronePresentationResources(undefined, true);
  private readonly lightGeometry = new THREE.BoxGeometry(1.25, 0.45, 0.32);
  private readonly dressingGeometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly thrusterGeometry = new THREE.CylinderGeometry(.24, .32, .42, 8);
  private readonly plumeGeometry = new THREE.ConeGeometry(.2, .85, 8).rotateZ(Math.PI).translate(0, -.425, 0);
  private readonly plumeMaterial = new THREE.MeshBasicMaterial({color:0xffce72, transparent:true, opacity:.7, depthWrite:false, toneMapped:false});
  private readonly liftVisuals: {root: THREE.Group; plumes: THREE.Group; socket: THREE.MeshStandardMaterial}[] = [];
  private readonly lightTargetGeometry = new THREE.BoxGeometry(1.05, 0.8, 0.22);
  private readonly lampTargetGeometry = new THREE.BoxGeometry(2.4, 0.4, 0.85);
  private readonly coverGeometry = new THREE.BoxGeometry(0.32, 4.2, 7.2);
  private readonly supportGeometry = new THREE.BoxGeometry(0.5, 0.42, 0.42);
  private readonly liftSocketGeometry = new THREE.BoxGeometry(0.55, 0.65, 0.35);
  private readonly steel = new THREE.MeshStandardMaterial({ color: 0x2a3337, roughness: 0.7, metalness: 0.72 });
  private readonly wood = new THREE.MeshStandardMaterial({ color: 0x38251a, roughness: 0.96, metalness: 0.02 });
  private readonly solubleWood = new THREE.MeshStandardMaterial({ color: 0x55402a, roughness: 0.92 });
  private readonly indicatorMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly beamMeshes: THREE.Mesh[] = [];
  private readonly targetUnregisters: (() => void)[] = [];
  private readonly searchLights: THREE.SpotLight[] = [];
  private readonly lampLights: THREE.PointLight[] = [];
  private readonly coverRegistered = new Set<THREE.Mesh>();
  private readonly bridge: THREE.Mesh;
  private bridgeRegistered = false;
  private disposed = false;

  constructor(options: { room: BlackoutTransitRoom; world: CollisionWorld; surfaces: SurfaceRegistry; electricalTargets: ElectricalTargetRegistry }) {
    this.room = options.room;
    this.world = options.world;
    this.surfaces = options.surfaces;
    this.root.name = 'level-3-room-2-powered-transit-controller';
    this.room.root.add(this.root);

    const unregisterTargets = this.targetUnregisters;
    const ownedDissolves: DissolveTarget[] = [];
    const ownedLifts: PoweredLiftDevice[] = [];
    const ownedDrones: SecurityDrone[] = [];
    const ownedLasers: LaserHazard[] = [];
    let projectileSystem: DroneProjectileSystem | undefined;
    try {
      projectileSystem = new DroneProjectileSystem(options.world, this.damage, { damage: 60, speedMetresPerSecond: 120, poolCapacity: 48, lifetimeSeconds: 1.2, maximumRangeMetres: 36 });
      this.projectiles = projectileSystem;
      this.projectilePresentation = new DroneProjectilePresentation(projectileSystem.states, 0.09);
      this.root.add(this.projectilePresentation.mesh);
      this.damage.events.on('died', ({ slimeId }) => { this.pendingFailure = slimeId === 'goop' ? 'volt' : 'bob'; });
      const lights = this.room.receiverPositions.map((position, index) => {
        const target = this.makeReceiver(`transit-light-${String.fromCharCode(97 + index)}`, `Light bank ${String.fromCharCode(65 + index)}`, position, options.electricalTargets, unregisterTargets, true);
        this.lampLights.push(target.light);
        this.dressingBox(`transit-light-bank-hanger-${index}`, new THREE.Vector3(.08,20.7-position.y,.08), new THREE.Vector3(position.x,(20.7+position.y)/2,position.z));
        return target;
      });
      this.lights = lights;
      this.lockReceiver = this.makeReceiver('transit-bridge-lock', 'Exit door bridge-lock contact', this.room.bridgeLockContact.position, options.electricalTargets, unregisterTargets, false, this.room.bridgeLockContact);

      const lifts = this.room.liftSlots.map((slot, index) => {
        const device = new PoweredLiftDevice({
          id: slot.id,
          displayName: `Thruster lift ${index + 1}`,
          collisionWorld: options.world,
          surfaceRegistry: options.surfaces,
          start: new THREE.Vector3(slot.position.x, slot.minY, slot.position.z),
          end: new THREE.Vector3(slot.position.x, slot.maxY, slot.position.z),
          size: slot.size.clone(),
          travelDurationSeconds: 2.4,
          routePolicy: 'one-way',
          powerMode: 'sustained',
          unpoweredReturnSpeedRatio: 0.35,
        });
        device.root.name = `${slot.id}-runtime-lift`;
        device.platform.collisionMesh.material.color.setHex(0x303832);
        device.platform.collisionMesh.material.emissiveIntensity = 0;
        device.platform.collisionMesh.material.metalness = .5;
        device.platform.collisionMesh.castShadow = true;
        device.platform.collisionMesh.receiveShadow = true;
        // Attach the conducting contact to the actual moving lift, rather than
        // a floating remote proxy on Volt's catwalk.
        const liftTarget = device.root.getObjectByName(`${slot.id}-target`);
        if (liftTarget) liftTarget.visible = false;
        this.root.add(device.root);
        const socketMaterial = new THREE.MeshStandardMaterial({ color: 0x39413d, emissive: 0x48bc84, emissiveIntensity: 0, metalness: 0.42, roughness: 0.52 });
        this.indicatorMaterials.push(socketMaterial);
        const socket = new THREE.Mesh(this.liftSocketGeometry, socketMaterial);
        socket.name = `${slot.id}-conducting-contact`;
        socket.position.set(-slot.size.x / 2 - 0.45, 2.1, 0);
        device.root.add(socket);
        const contactStem = new THREE.Mesh(this.dressingGeometry, this.steel);
        contactStem.name = `${slot.id}-contact-mount`;
        contactStem.scale.set(0.12, 2.1, 0.12);
        contactStem.position.set(socket.position.x, 1.05, 0);
        device.root.add(contactStem);
        const hardware = new THREE.Group();
        hardware.name = `${slot.id}-thruster-hardware`;
        const plumes = new THREE.Group();
        plumes.name = `${slot.id}-powered-exhaust`;
        plumes.visible = false;
        hardware.add(plumes);
        for (const x of [-1.6, 1.6]) for (const z of [-1.2, 1.2]) {
          const engine = new THREE.Mesh(this.thrusterGeometry, this.steel);
          engine.position.set(x, -.52, z);
          engine.receiveShadow = true;
          hardware.add(engine);
          const plume = new THREE.Mesh(this.plumeGeometry, this.plumeMaterial);
          plume.position.set(x, -.74, z);
          plumes.add(plume);
        }
        hardware.position.copy(device.root.position);
        this.root.add(hardware);
        this.liftVisuals.push({root:hardware, plumes, socket:socketMaterial});
        const receiverAdapter: ElectricalConnectionTarget = {
          id: slot.id, displayName: `Thruster lift ${index + 1}`, hitMeshes: [socket],
          copySocketWorldPosition: target => socket.localToWorld(target.set(0, 0, 0)),
          isAvailable: () => this.active,
          setConnectionState: connected => device.core.setConnectionState(connected),
        };
        unregisterTargets.push(options.electricalTargets.register(receiverAdapter));
        device.core.setAvailable(false);
        ownedLifts.push(device);
        return device;
      });
      this.lifts = lifts;

      const covers = [
        { drone: new THREE.Vector3(18, 5.5, 100), panel: new THREE.Vector3(14, 4.4, 101), support: new THREE.Vector3(14, 11.5, 101), forward: new THREE.Vector3(-0.82, -0.45, 0.15) },
        { drone: new THREE.Vector3(18, 8, 124), panel: new THREE.Vector3(14, 8.1, 125), support: new THREE.Vector3(14, 11.5, 125), forward: new THREE.Vector3(-0.82, -0.4, 0.12) },
        { drone: new THREE.Vector3(1, 6.5, 142), panel: new THREE.Vector3(-4, 4.9, 141), support: new THREE.Vector3(0, 11.5, 141), forward: new THREE.Vector3(-0.9, -0.3, -0.18) },
      ];
      const states: CoverState[] = [];
      for (const [index, config] of covers.entries()) {
        const panel = new THREE.Mesh(this.coverGeometry, this.wood);
        panel.name = `transit-cover-${index + 1}`;
        panel.position.set(config.panel.x, 13.7, config.panel.z);
        panel.visible = true;
        panel.castShadow = true;
        panel.receiveShadow = true;
        panel.userData.surfaceTag = 'default';
        this.root.add(panel);
        const supportMesh = new THREE.Mesh(this.supportGeometry, this.solubleWood);
        supportMesh.name = `transit-cover-support-${index + 1}`;
        supportMesh.position.copy(config.support);
        supportMesh.userData.soluble = true;
        supportMesh.userData.surfaceTag = 'default';
        this.root.add(supportMesh);
        const support = new DissolveTarget({ id: `transit-cover-support-${index + 1}`, mesh: supportMesh, collisionWorld: options.world, surfaceRegistry: options.surfaces, dissolveDurationSeconds: 0.85, collisionDisableProgress: 0.65, activationRangeMetres: 13 });
        ownedDissolves.push(support);
        const cover = { panel, support, startY: 13.7, endY: config.panel.y, elapsed: 0, deployed: false };
        states.push(cover);
        this.setCoverOcclusion(cover, true);
        // Retained guide rails terminate at the ceiling crossbeam. The soluble
        // latch releases the panel into a fixed lower cradle, not free physics.
        const bottom = config.panel.y - 2.2;
        for (const side of [-1, 1]) this.dressingBox(
          `transit-cover-${index + 1}-guide-${side}`,
          new THREE.Vector3(0.2, 20.7 - bottom, 0.2),
          new THREE.Vector3(config.panel.x, (20.7 + bottom) / 2, config.panel.z + side * 3.7),
        );
        this.dressingBox(`transit-cover-${index + 1}-lower-cradle`,
          new THREE.Vector3(0.48, 0.18, 7.6), new THREE.Vector3(config.panel.x, bottom, config.panel.z));
        if (config.support.x !== config.panel.x) this.dressingBox('transit-bridge-cover-release-link',
          new THREE.Vector3(Math.abs(config.support.x - config.panel.x), 0.12, 0.12),
          new THREE.Vector3((config.support.x + config.panel.x) / 2, config.support.y, config.support.z));
        const drone = this.makeDrone(`transit-security-${index + 1}`, config.drone, config.forward, options.world, options.surfaces, ownedDrones);
        this.addBeam(drone, index);
      }
      this.covers = states;
      this.dissolveTargets = ownedDissolves;

      const lasers = [
        new LaserHazard({ id: 'transit-laser-a', start: { x: 7.8, y: 5.1, z: 121.5 }, end: { x: 13.2, y: 5.1, z: 121.5 }, enabled: true }),
        new LaserHazard({ id: 'transit-laser-b', start: { x: 7.8, y: 8.35, z: 137 }, end: { x: 13.2, y: 8.35, z: 137 }, enabled: true }),
      ];
      this.lasers = lasers;
      for (const laser of lasers) { this.root.add(laser.root); ownedLasers.push(laser); }
      this.laserPresentation = new LaserHazardPresentation(lasers);
      this.root.add(this.laserPresentation.root);

      const bridgeStart = this.room.bridgeStart.clone();
      const bridgeEnd = this.room.bridgeEnd.clone();
      bridgeStart.y = 2.25;
      bridgeEnd.y = 0.25;
      const bridgeDirection = bridgeEnd.clone().sub(bridgeStart);
      bridgeDirection.y = -2;
      const bridgeCentre = bridgeStart.clone().add(bridgeEnd).multiplyScalar(0.5);
      this.bridge = new THREE.Mesh(new THREE.BoxGeometry(bridgeDirection.length(), 0.45, 3.6), new THREE.MeshStandardMaterial({ color: 0x353e41, roughness: 0.72, metalness: 0.7 }));
      this.bridge.name = 'transit-deployable-bridge-deck'; this.bridge.position.copy(bridgeCentre);
      this.bridge.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), bridgeDirection.normalize());
      this.bridge.visible = false; this.bridge.userData.surfaceTag = 'default'; this.root.add(this.bridge);
      this.bridgeStartPosition.copy(bridgeStart);
      this.bridgeEndPosition.copy(bridgeEnd);

      this.drones = ownedDrones;
      this.root.updateMatrixWorld(true);
      this.setActive(false);
    } catch (error) {
      this.laserPresentation?.dispose();
      for (const unregister of unregisterTargets.reverse()) unregister();
      for (const target of ownedDissolves.reverse()) target.dispose();
      for (const lift of ownedLifts.reverse()) lift.dispose();
      for (const drone of ownedDrones.reverse()) drone.dispose();
      for (const laser of ownedLasers.reverse()) laser.dispose();
      projectileSystem?.dispose();
      this.root.removeFromParent();
      throw error;
    }
  }

  get isActive(): boolean { return this.active; }

  setActive(active: boolean): void {
    if (this.disposed) return;
    this.active = active;
    for (const lift of this.lifts) lift.core.setAvailable(active);
    for (let i = 0; i < this.lifts.length; i++) this.updateLiftVisual(i);
    for (const drone of this.drones) drone.setEnabled(active);
    for (let i = 0; i < this.drones.length; i++) this.updateBeam(this.drones[i]!, i);
    for (const light of this.searchLights) {
      light.intensity = active ? 26 : 0;
      setShadowMapUpdatesActive(light, active);
    }
    for (const laser of this.lasers) laser.root.visible = active;
    if (this.laserPresentation) this.laserPresentation.root.visible = active;
    this.updateLampBanks();
    for (const receiver of [...this.lights, this.lockReceiver]) {
      if (active) this.updateReceiver(receiver, 0);
      else receiver.light.intensity = 0;
    }
    this.updateSwitchButton();
    if (!active) {
      for (const receiver of [...this.lights, this.lockReceiver]) receiver.connected = false;
      this.projectiles.reset();
    }
  }

  update(dt: number, bodies: TransitBodies): TransitSlimeId | undefined {
    if (this.disposed) return undefined;
    if (!Number.isFinite(dt) || dt <= 0) throw new Error('Transit controller deltaSeconds must be positive and finite.');
    if (!this.active) return undefined;
    this.currentVoltPosition.set(bodies.volt.position.x, bodies.volt.position.y, bodies.volt.position.z);
    for (let i = 0; i < this.lights.length; i++) this.updateReceiver(this.lights[i]!, dt);
    this.updateReceiver(this.lockReceiver, dt);
    this.updateLampBanks();
    this.updateCovers(dt);
    this.updateSwitchAndBridge(dt, bodies.bob);
    this.updateLifts(dt, bodies);
    this.damage.update(dt);
    this.updateDrones(dt, bodies);
    if (this.pendingFailure) { const failure = this.pendingFailure; this.pendingFailure = undefined; return failure; }
    (this.bobLaserTarget.position as THREE.Vector3).set(bodies.bob.position.x, bodies.bob.position.y, bodies.bob.position.z);
    (this.bobLaserTarget as { radiusMetres: number }).radiusMetres = bodies.bob.radiusMetres;
    (this.voltLaserTarget.position as THREE.Vector3).set(bodies.volt.position.x, bodies.volt.position.y, bodies.volt.position.z);
    (this.voltLaserTarget as { radiusMetres: number }).radiusMetres = bodies.volt.radiusMetres;
    this.updateLasers(dt);
    for (const laser of this.lasers) {
      if (laser.intersects(this.bobLaserTarget)) return 'bob';
      if (laser.intersects(this.voltLaserTarget)) return 'volt';
    }

    if (this.room.acidAt(bodies.bob.position)) return 'bob';
    if (this.room.acidAt(bodies.volt.position)) return 'volt';
    if (this.room.exitAt(bodies.bob.position) && this.room.exitAt(bodies.goop.position) && this.room.exitAt(bodies.volt.position) && this.bridgeLocked) this.complete = true;
    const bobOnPad = (mesh: THREE.Mesh, tolerance: number) => bodies.bob.isSupportedBy(mesh) && Math.abs(bodies.bob.position.z - mesh.position.z) <= tolerance;
    if (this.covers[0]?.deployed && bobOnPad(this.room.bobRoutePlatforms[1]!, 1.5)) this.checkpointTutorialReached = true;
    if (this.checkpointTutorialReached) this.checkpointStage = Math.max(this.checkpointStage, 1);
    const finalPad = this.room.bobRoutePlatforms[this.room.bobRoutePlatforms.length - 1]!;
    if (this.covers[1]?.deployed && bobOnPad(finalPad, 2.5)) this.checkpointStage = Math.max(this.checkpointStage, 2);
    this.updateObjective();
    return undefined;
  }

  capture(): SerializableValue {
    const state: TransitSnapshot = {
      active: this.active, complete: this.complete, checkpointStage: this.checkpointStage,
      lights: this.lights.map(({ charge, latched }) => ({ charge, latched })),
      covers: this.covers.map(({ support, elapsed, deployed }) => ({ progress: support.progress, elapsed, deployed })),
      liftGrace: [...this.liftGrace], switchHeld: this.switchHeld, bridgeDeployed: this.bridgeDeployed,
      lifts: this.lifts.map(lift => lift.captureState()),
      bridgeLocked: this.bridgeLocked, bridgeRelease: this.bridgeRelease,
      bridgeProgress: this.bridgeProgress,
      lockReceiver: { charge: this.lockReceiver.charge, latched: this.lockReceiver.latched },
      checkpointTutorialReached: this.checkpointTutorialReached,
    };
    return JSON.parse(JSON.stringify(state)) as SerializableValue;
  }

  restore(state: SerializableValue): void {
    const snapshot = parseSnapshot(state);
    this.pendingFailure = undefined;
    this.active = snapshot.active;
    this.complete = snapshot.complete;
    this.checkpointStage = snapshot.checkpointStage;
    this.checkpointTutorialReached = snapshot.checkpointTutorialReached;
    this.lights.forEach((receiver, i) => this.restoreReceiver(receiver, snapshot.lights[i] ?? { charge: 0, latched: false }));
    this.covers.forEach((cover, i) => {
      cover.support.reset();
      const saved = snapshot.covers[i] ?? { progress: 0, deployed: false };
      if (saved.progress > 0) cover.support.advance(cover.support.dissolveDurationSeconds * saved.progress);
      cover.elapsed = Math.max(0, Math.min(COVER_DROP_SECONDS, saved.elapsed ?? (saved.deployed ? COVER_DROP_SECONDS : 0)));
      cover.deployed = saved.deployed;
      cover.panel.position.y = THREE.MathUtils.lerp(cover.startY, cover.endY, THREE.MathUtils.smoothstep(cover.elapsed / COVER_DROP_SECONDS, 0, 1));
      cover.panel.visible = true;
      this.setCoverOcclusion(cover, true);
    });
    this.liftGrace.forEach((_, i) => { this.liftGrace[i] = snapshot.liftGrace[i] ?? 0; });
    this.lifts.forEach((lift, i) => { if (snapshot.lifts[i] !== undefined) lift.restoreState(snapshot.lifts[i]!); });
    this.switchHeld = snapshot.switchHeld;
    this.bridgeDeployed = snapshot.bridgeDeployed;
    this.bridgeProgress = Math.max(0, Math.min(1, snapshot.bridgeProgress ?? (snapshot.bridgeDeployed ? 1 : 0)));
    this.bridgeLocked = snapshot.bridgeLocked;
    this.bridgeRelease = snapshot.bridgeRelease;
    this.restoreReceiver(this.lockReceiver, snapshot.lockReceiver);
    this.complete = snapshot.complete;
    for (const drone of this.drones) drone.reset();
    for (const laser of this.lasers) laser.reset();
    this.laserElapsed = 0;
    this.laserPresentation?.sync();
    this.updateBridgeMeshes();
    for (const lift of this.lifts) lift.core.setAvailable(this.active);
    for (let i = 0; i < this.lifts.length; i++) this.updateLiftVisual(i);
    for (let i = 0; i < this.drones.length; i++) {
      this.drones[i]!.setEnabled(this.active);
      this.beamMeshes[i]!.visible = this.active;
      this.searchLights[i]!.intensity = this.active ? 26 : 0;
      setShadowMapUpdatesActive(this.searchLights[i]!, this.active);
    }
    this.updateLampBanks();
    this.updateSwitchButton();
  }

  resetTransient(): void {
    this.pendingFailure = undefined;
    this.projectiles.reset();
    this.projectilePresentation.reset();
    this.damage.reset();
    for (const drone of this.drones) drone.reset();
  }

  reset(): void {
    if (this.disposed) return;
    this.projectiles.reset(); this.damage.reset();
    this.pendingFailure = undefined;
    for (const receiver of [...this.lights, this.lockReceiver]) this.restoreReceiver(receiver, { charge: 0, latched: false });
    for (const cover of this.covers) {
      cover.support.reset(); cover.elapsed = 0; cover.deployed = false;
      cover.panel.position.y = cover.startY; this.setCoverOcclusion(cover, true);
    }
    this.liftGrace.fill(0);
    for (const lift of this.lifts) lift.reset();
    for (let i = 0; i < this.lifts.length; i++) this.updateLiftVisual(i);
    for (const drone of this.drones) drone.reset();
    for (const laser of this.lasers) laser.reset();
    this.laserElapsed = 0;
    this.laserPresentation?.sync();
    this.switchHeld = false; this.bridgeDeployed = false; this.bridgeLocked = false;
    this.bridgeRelease = 0; this.checkpointTutorialReached = false; this.checkpointStage = 0; this.complete = false;
    this.bridgeProgress = 0;
    this.updateBridgeMeshes();
    this.updateLampBanks();
    this.updateSwitchButton();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const unregister of [...this.targetUnregisters].reverse()) unregister();
    this.targetUnregisters.length = 0;
    for (const lift of [...this.lifts].reverse()) lift.dispose();
    for (const target of [...this.dissolveTargets].reverse()) target.dispose();
    for (const cover of this.covers) {
      if (this.coverRegistered.delete(cover.panel)) this.world.unregister(cover.panel);
      cover.panel.removeFromParent();
    }
    if (this.bridgeRegistered) { this.world.unregister(this.bridge); this.surfaces.unregister(this.bridge); }
    for (const drone of [...this.drones].reverse()) drone.dispose();
    this.laserPresentation?.dispose();
    for (const laser of [...this.lasers].reverse()) laser.dispose();
    this.projectilePresentation.dispose();
    this.projectiles.dispose(); this.damage.dispose(); this.resources.dispose();
    for (const beam of this.beamMeshes) { beam.removeFromParent(); beam.geometry.dispose(); (beam.material as THREE.Material).dispose(); }
    for (const light of this.searchLights) { light.dispose(); light.removeFromParent(); light.target.removeFromParent(); }
    for (const light of this.lampLights) light.removeFromParent();
    this.root.removeFromParent(); this.root.clear();
    this.lightGeometry.dispose(); this.lightTargetGeometry.dispose(); this.coverGeometry.dispose(); this.supportGeometry.dispose(); this.liftSocketGeometry.dispose();
    this.dressingGeometry.dispose();
    this.thrusterGeometry.dispose(); this.plumeGeometry.dispose(); this.plumeMaterial.dispose();
    this.lampTargetGeometry.dispose();
    this.bridge.geometry.dispose(); (this.bridge.material as THREE.Material).dispose();
    for (const receiver of [...this.lights, this.lockReceiver]) {
      if (receiver.ownsTargetMaterial) receiver.targetMaterial.dispose();
      else receiver.targetMaterial.emissiveIntensity = 0;
    }
    this.steel.dispose(); this.wood.dispose(); this.solubleWood.dispose();
    for (const material of this.indicatorMaterials) material.dispose();
  }

  private makeReceiver(id: string, displayName: string, position: THREE.Vector3, registry: ElectricalTargetRegistry, registrations: (() => void)[], isLamp = false, existingTargetMesh?: THREE.Mesh): MutableTimedReceiver {
    const root = new THREE.Group(); root.name = `${id}-receiver`; root.position.copy(position); this.root.add(root);
    if (!existingTargetMesh) {
      const backing = new THREE.Mesh(this.lightGeometry, this.steel); backing.position.y = isLamp ? 0.25 : 0.55;
      if (isLamp) backing.scale.set(2.1, 1, 3);
      root.add(backing);
    }
    const targetMaterial = existingTargetMesh?.material ?? new THREE.MeshStandardMaterial({ color: 0x39413d, roughness: 0.45, emissive: 0xffcc7a, emissiveIntensity: 0 });
    if (!(targetMaterial instanceof THREE.MeshStandardMaterial)) throw new Error(`Electrical contact ${id} requires a standard material.`);
    const targetMesh = existingTargetMesh ?? new THREE.Mesh(isLamp ? this.lampTargetGeometry : this.lightTargetGeometry, targetMaterial);
    if (!existingTargetMesh) {
      targetMesh.name = isLamp ? `${id}-conducting-lamp` : `${id}-electrical-socket`; targetMesh.position.y = isLamp ? 0 : 0.55; root.add(targetMesh);
    }
    const light = new THREE.PointLight(0xffd36c, 0, isLamp ? 18 : 8, 2);
    light.position.set(0, isLamp ? -0.35 : existingTargetMesh ? 0.2 : 0.7, existingTargetMesh ? -0.4 : 0.4);
    light.castShadow = false; root.add(light);
    const receiver = {} as MutableTimedReceiver;
    const target: ElectricalConnectionTarget = {
      id, displayName, hitMeshes: [targetMesh],
      copySocketWorldPosition: (out) => targetMesh.localToWorld(out.set(0, 0, 0)),
      isAvailable: () => this.active && (id !== 'transit-bridge-lock' || (this.bridgeDeployed && this.currentVoltPosition.distanceToSquared(LOCK_RECEIVER_APPROACH) <= LOCK_RECEIVER_RANGE_SQ)),
      setConnectionState: (connected) => { receiver.connected = connected; },
    };
    Object.assign(receiver, { target, root, light, targetMaterial, ownsTargetMaterial: !existingTargetMesh, connected: false, charge: 0, latched: false, unregister: registry.register(target) });
    registrations.push(receiver.unregister);
    return receiver;
  }

  private dressingBox(name: string, size: THREE.Vector3, position: THREE.Vector3, material: THREE.Material = this.steel): THREE.Mesh {
    const mesh = new THREE.Mesh(this.dressingGeometry, material);
    mesh.name = name;
    mesh.scale.copy(size);
    mesh.position.copy(position);
    mesh.userData.presentationOnly = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    return mesh;
  }

  private updateLampBanks(): void {
    for (let i = 0; i < this.lampLights.length; i++) {
      const lit = this.active && this.lights[i]?.latched;
      this.lampLights[i]!.intensity = lit ? 70 : 0;
      this.lights[i]!.targetMaterial.emissive.setHex(0xffcc7a);
      this.lights[i]!.targetMaterial.emissiveIntensity = lit ? 3 : 0;
    }
  }

  private updateReceiver(receiver: MutableTimedReceiver, dt: number): void {
    if (receiver.connected && !receiver.latched) receiver.charge = Math.min(1, receiver.charge + dt / LIGHT_CHARGE_SECONDS);
    else if (!receiver.latched) receiver.charge = Math.max(0, receiver.charge - dt * 0.5);
    if (receiver.charge >= 1 - 1e-9) { receiver.charge = 1; receiver.latched = true; }
    const powered = receiver.latched || receiver.connected;
    receiver.targetMaterial.emissiveIntensity = powered ? 1.2 : 0;
    receiver.light.color.setHex(receiver.latched ? 0xffd991 : 0xffc45c);
    receiver.light.intensity = receiver.latched ? 11 : receiver.connected ? 2.8 : 0;
  }

  private restoreReceiver(receiver: MutableTimedReceiver, state: ReceiverSnapshot): void {
    receiver.connected = false; receiver.charge = Math.max(0, Math.min(1, state.charge)); receiver.latched = state.latched;
    this.updateReceiver(receiver, 0.000001);
  }

  private updateCovers(dt: number): void {
    for (const cover of this.covers) {
      if (cover.deployed || !cover.support.completed) continue;
      cover.elapsed = Math.min(COVER_DROP_SECONDS, cover.elapsed + dt);
      const t = THREE.MathUtils.smoothstep(cover.elapsed / COVER_DROP_SECONDS, 0, 1);
      cover.panel.position.y = THREE.MathUtils.lerp(cover.startY, cover.endY, t);
      if (cover.elapsed >= COVER_DROP_SECONDS) { cover.deployed = true; this.setCoverOcclusion(cover, true); }
    }
  }

  private setCoverOcclusion(cover: CoverState, enabled: boolean): void {
    if (enabled && !this.coverRegistered.has(cover.panel)) {
      this.world.register(cover.panel, CollisionLayer.LineOfSight | CollisionLayer.Projectile, ColliderTransformMode.Dynamic);
      this.coverRegistered.add(cover.panel);
    } else if (!enabled && this.coverRegistered.delete(cover.panel)) this.world.unregister(cover.panel);
  }

  private updateSwitchAndBridge(dt: number, bob: KinematicBody): void {
    const switchPoint = this.room.switchBodyPosition;
    const dx = bob.position.x - switchPoint.x, dy = bob.position.y - switchPoint.y, dz = bob.position.z - switchPoint.z;
    const close = dx * dx + dy * dy + dz * dz <= 0.9 * 0.9;
    const wallHeld = bob.attached && (bob.attachmentSurfaceName.includes('switch') || bob.attachmentSurfaceName.includes('bob-bridge-switch-sticky-wall'));
    this.switchHeld = !this.bridgeLocked && close && wallHeld;
    this.updateSwitchButton();
    if (this.bridgeLocked) this.bridgeProgress = 1;
    else if (this.switchHeld) this.bridgeRelease = 0;
    else if (this.bridgeProgress > 0) {
      this.bridgeRelease += dt;
    }
    if (this.lockReceiver.latched) { this.bridgeLocked = true; this.bridgeProgress = 1; }
    const wantsBridge = this.bridgeLocked || this.switchHeld || (this.bridgeProgress > 0 && this.bridgeRelease < BRIDGE_RELEASE_SECONDS);
    this.bridgeProgress = this.bridgeLocked ? 1 : THREE.MathUtils.clamp(this.bridgeProgress + (wantsBridge ? dt / 1.25 : -dt / 1.25), 0, 1);
    this.bridgeDeployed = this.bridgeProgress >= 0.98;
    this.updateBridgeMeshes();
  }

  private updateSwitchButton(): void {
    const material = this.room.switchButton.material;
    if (Array.isArray(material) || !(material instanceof THREE.MeshStandardMaterial)) return;
    material.color.setHex(this.switchHeld || this.bridgeLocked ? 0x43c982 : 0x8b662b);
    material.emissive.setHex(this.switchHeld || this.bridgeLocked ? 0x27ff83 : 0x50340c);
    material.emissiveIntensity = this.switchHeld || this.bridgeLocked ? 1.8 : 0.22;
  }

  private updateBridgeMeshes(): void {
    this.bridge.scale.x = Math.max(0.001, this.bridgeProgress);
    this.bridge.position.copy(this.bridgeStartPosition).lerp(this.bridgeEndPosition, this.bridgeProgress * 0.5);
    this.bridge.visible = this.bridgeProgress > 0.001;
    if (this.bridgeProgress >= 0.92 && !this.bridgeRegistered) {
      this.world.register(this.bridge, CollisionLayer.Movement | CollisionLayer.CameraObstruction | CollisionLayer.Projectile | CollisionLayer.LineOfSight, ColliderTransformMode.Dynamic);
      this.surfaces.register(this.bridge);
      this.bridgeRegistered = true;
    } else if (this.bridgeProgress < 0.92 && this.bridgeRegistered) {
      this.world.unregister(this.bridge); this.surfaces.unregister(this.bridge); this.bridgeRegistered = false;
    }
  }

  private updateLifts(dt: number, bodies: TransitBodies): void {
    if (this.carrierBodies.length === 0) {
      for (const id of this.carrierOrder) {
        const body = bodies[id];
        this.carrierBodies.push({
          id,
          get position() { return body.position; },
          get radiusMetres() { return body.radiusMetres; },
          isSupportedBy: collider => body.isSupportedBy(collider),
          applyCarrierDisplacement: (displacement, collider) => body.applyCarrierDisplacement(displacement, collider),
        });
      }
    }
    for (let i = 0; i < this.lifts.length; i++) {
      const lift = this.lifts[i]!;
      const grace = this.liftGrace[i] ?? 0;
      if (lift.core.readModel.connected) this.liftGrace[i] = LIFT_RESIDUAL_SECONDS;
      else this.liftGrace[i] = Math.max(0, grace - dt);
      lift.core.setSupply(`transit-lift-residual-${i}`, this.liftGrace[i]! > 0);
      lift.updateMechanics(dt, this.carrierBodies);
      this.updateLiftVisual(i);
    }
  }

  private updateLiftVisual(index: number): void {
    const lift = this.lifts[index]!;
    const visual = this.liftVisuals[index]!;
    const powered = this.active && lift.core.readModel.powered;
    visual.root.position.copy(lift.root.position);
    visual.plumes.visible = powered;
    visual.socket.emissiveIntensity = powered ? 1.5 : 0;
    visual.socket.emissive.setHex(powered ? 0x48bc84 : 0x8c6916);
  }

  private makeDrone(id: string, position: THREE.Vector3, forward: THREE.Vector3, world: CollisionWorld, surfaces: SurfaceRegistry, owned: SecurityDrone[]): SecurityDrone {
    const drone = new SecurityDrone({ id, type: 'ceiling', initialPosition: position, colliderSize: new THREE.Vector3(1.4, 0.8, 1.4), forward: forward.clone().normalize(), scanAxis: new THREE.Vector3(0, 1, 0), scanHalfAngleRadians: 0.22, scanSpeedRadiansPerSecond: 0.18, trackTargets: true, forwardAnchorMetres: 1.2, detectionHalfAngleRadians: 0.34, detectionRangeMetres: 30, warningSeconds: 0.08, fireIntervalSeconds: 0.045, targetLossGraceSeconds: 0.08, cooldownSeconds: 0.15, muzzleAnchor: new THREE.Vector3(0, -0.1, -0.8), targetPolicy: 'both', initialScanPhase: 0.25 }, world, surfaces, this.projectiles, this.resources);
    drone.presentation.root.traverse(object => { if (object.name.includes('mount') || object.name.includes('linkage')) object.visible = false; });
    this.root.add(drone.root); owned.push(drone); return drone;
  }

  private addBeam(drone: SecurityDrone, index: number): void {
    const range = 30;
    const light = new THREE.SpotLight(0xff1830, 26, range, 0.34, 0.48, 2); light.name = `${drone.id}-search-light`; light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024); light.shadow.bias = -0.00005; light.shadow.normalBias = 0.012;
    const beam = new ShadowedDroneBeam(light, range, 0.34).mesh;
    beam.name = `${drone.id}-searchlight`; this.room.root.add(beam); this.beamMeshes.push(beam);
    this.room.root.add(light, light.target); this.searchLights.push(light);
    drone.root.userData.transitBeamIndex = index;
  }

  private readonly roomTargets: SecurityDroneTarget[] = [
    { slimeId: 'bob', position: new THREE.Vector3() },
    // Reuse the existing drone target/LOS/projectile runtime for Volt while
    // Goop remains acid-safe and is handled by the room-specific cover puzzle.
    { slimeId: 'goop', position: new THREE.Vector3() },
  ];
  private readonly roomProjectileTargets: DroneProjectileTarget[] = [
    { slimeId: 'bob', position: new THREE.Vector3(), previousPosition: new THREE.Vector3(), radiusMetres: 0.45 },
    { slimeId: 'goop', position: new THREE.Vector3(), previousPosition: new THREE.Vector3(), radiusMetres: 0.45 },
  ];

  private updateDrones(dt: number, bodies: TransitBodies): void {
    const bobTarget = this.roomTargets[0]!.position as THREE.Vector3;
    const voltTarget = this.roomTargets[1]!.position as THREE.Vector3;
    bobTarget.set(bodies.bob.position.x, bodies.bob.position.y, bodies.bob.position.z);
    voltTarget.set(bodies.volt.position.x, bodies.volt.position.y, bodies.volt.position.z);
    const bobProjectile = this.roomProjectileTargets[0]!;
    (bobProjectile.position as THREE.Vector3).set(bodies.bob.position.x, bodies.bob.position.y, bodies.bob.position.z);
    (bobProjectile.previousPosition as THREE.Vector3).set(bodies.bob.previousPosition.x, bodies.bob.previousPosition.y, bodies.bob.previousPosition.z);
    const voltProjectile = this.roomProjectileTargets[1]!;
    (voltProjectile.position as THREE.Vector3).set(bodies.volt.position.x, bodies.volt.position.y, bodies.volt.position.z);
    (voltProjectile.previousPosition as THREE.Vector3).set(bodies.volt.previousPosition.x, bodies.volt.previousPosition.y, bodies.volt.previousPosition.z);
    for (let i = 0; i < this.drones.length; i++) {
      const drone = this.drones[i]!;
      drone.update(dt, this.roomTargets);
      this.updateBeam(drone, i);
    }
    this.projectiles.update(dt, this.roomProjectileTargets);
  }

  private updateBeam(drone: SecurityDrone, index: number): void {
    const beam = this.beamMeshes[index]!;
    const light = this.searchLights[index]!;
    beam.visible = this.active;
    if (!this.active) return;
    beam.position.copy(drone.root.position).addScaledVector(drone.readModel.scanDirection, 1.2);
    this.beamDirection.set(drone.readModel.scanDirection.x, drone.readModel.scanDirection.y, drone.readModel.scanDirection.z);
    // The shader samples this light's depth map per fragment, leaving clear
    // parts of the cone intact while masking the shadows of real geometry.
    light.position.copy(beam.position);
    light.target.position.copy(beam.position).addScaledVector(this.beamDirection, 30);
    this.beamDirection.negate();
    beam.quaternion.setFromUnitVectors(this.beamUp, this.beamDirection);
  }

  private updateLasers(dt: number): void {
    this.laserElapsed += dt;
    this.laserOffset.set(0, 1.25 * Math.sin(this.laserElapsed * Math.PI * 2 / 1.2), 0);
    this.lasers[0]?.setTranslationOffset(this.laserOffset);
    // The later gate stays live and sweeps farther/faster: there is no longer
    // a long disabled window that lets Bob simply run through it.
    this.laserOffset.set(0, 1.4 * Math.sin(this.laserElapsed * Math.PI * 2 / 0.9), 0);
    this.lasers[1]?.setTranslationOffset(this.laserOffset);
    for (const laser of this.lasers) laser.update(dt);
    this.laserPresentation?.sync();
  }

  private updateObjective(): void {
    if (this.complete) this.objective = 'Room clear. Continue to the boss-room access.';
    else if (this.bridgeLocked) this.objective = 'Regroup on the far side and reach the exit.';
    else if (this.bridgeDeployed) this.objective = this.lights[2]?.latched ? 'Shield Volt’s crossing, then power the exit door’s lower edge to lock the bridge.' : 'Power the bridge-side light bank and find a way to shield Volt.';
    else if (this.checkpointTutorialReached) this.objective = 'Reactivate the transit lifts and find the far-side switch.';
    else if (this.lights.some(light => light.latched)) this.objective = 'Use Goop to release the cover blocking the searchlight.';
    else this.objective = 'Find Volt’s maintenance route and restore a local light bank.';
  }
}

function parseSnapshot(value: SerializableValue): TransitSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid transit checkpoint state.');
  const state = value as unknown as TransitSnapshot;
  if (!Array.isArray(state.lights) || !Array.isArray(state.covers) || !Array.isArray(state.liftGrace)) throw new Error('Incomplete transit checkpoint state.');
  return state;
}
