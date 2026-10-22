import { WorldAudioSource } from '../audio/WorldAudio.ts';
import { gameplayAudioEvents } from '../audio/GameplayAudioEvents.ts';
import * as THREE from 'three';
import { mapBlackoutBoxUVs, mapBlackoutPropUVs } from '../render/environment/blackout/BlackoutMaintenanceUVs.ts';
import { borrowBlackoutMaps, updateBlackoutStretchUVs } from '../render/environment/blackout/BlackoutTransitMaterials.ts';

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
import { ScannerBeamPresentation } from '../render/hazards/ScannerBeamPresentation.ts';
import { EmergingSewerDrone, TRANSIT_SEWER_DRONE_POSITIONS, type EmergingSewerDroneSnapshot } from '../hazards/EmergingSewerDrone.ts';
import { WEAK_SEWER_DRONE } from '../hazards/WeakSewerDrone.ts';
import type { DissolveSystem } from '../abilities/DissolveSystem.ts';
import { LaserHazardPresentation } from '../render/hazards/LaserHazardPresentation.ts';
import { DroneProjectilePresentation } from '../render/hazards/DroneProjectilePresentation.ts';
import { SlimeDamageSystem } from '../systems/SlimeDamageSystem.ts';

export type TransitSlimeId = 'bob' | 'goop' | 'volt';
export type TransitBodies = Record<TransitSlimeId, KinematicBody>;

const TRANSIT_MAXIMUM_HEALTH = 100;
const LIGHT_CHARGE_SECONDS = 1.5;
const BRIDGE_RELEASE_SECONDS = 0.75;
const LIFT_RESIDUAL_SECONDS = 1.2;
const LOCK_RECEIVER_APPROACH = new THREE.Vector3(0, 0.86, 145);
const LOCK_RECEIVER_RANGE_SQ = 9;

interface ReceiverSnapshot { readonly charge: number; readonly latched: boolean }
interface TransitSnapshot {
  readonly active: boolean;
  readonly complete: boolean;
  readonly checkpointStage: number;
  readonly lights: readonly ReceiverSnapshot[];
  readonly sewerDrones: readonly EmergingSewerDroneSnapshot[];
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
  readonly emergingDrones: EmergingSewerDrone[] = [];
  private scannerBeams?: ScannerBeamPresentation;
  drones: readonly SecurityDrone[] = [];
  lasers: readonly LaserHazard[] = [];
  private laserPresentation?: LaserHazardPresentation;
  private laserElapsed = 0;
  private readonly laserOffset = new THREE.Vector3();
  readonly damage = new SlimeDamageSystem({ maximumHealth: TRANSIT_MAXIMUM_HEALTH }, ['bob', 'goop', 'volt']);
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
  private readonly bridgeAudio: WorldAudioSource;
  private readonly bridgeStartPosition = new THREE.Vector3();
  private readonly bridgeEndPosition = new THREE.Vector3();
  private checkpointTutorialReached = false;
  private readonly liftGrace = [0, 0];
  private readonly carrierBodies: TransitCarrier[] = [];
  private readonly carrierOrder: TransitSlimeId[] = ['bob', 'goop', 'volt'];
  private readonly bobLaserTarget: LaserContactTarget = { id: 'bob', position: new THREE.Vector3(), radiusMetres: 0.45 };
  private readonly voltLaserTarget: LaserContactTarget = { id: 'volt', position: new THREE.Vector3(), radiusMetres: 0.45 };
  private readonly currentVoltPosition = new THREE.Vector3();
  private pendingFailure: TransitSlimeId | undefined;
  private readonly resources = new SecurityDronePresentationResources(undefined, true);
  private readonly lightGeometry = new THREE.BoxGeometry(1.25, 0.45, 0.32);
  private readonly dressingGeometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly thrusterGeometry = new THREE.CylinderGeometry(.24, .32, .42, 8);
  private readonly plumeGeometry = new THREE.ConeGeometry(.2, .85, 8).rotateZ(Math.PI).translate(0, -.425, 0);
  private readonly plumeMaterial = new THREE.MeshBasicMaterial({color:0xffce72, transparent:true, opacity:.7, depthWrite:false, toneMapped:false});
  private readonly liftVisuals: {root: THREE.Group; plumes: THREE.Group; socket: THREE.MeshStandardMaterial}[] = [];
  private readonly lightTargetGeometry = new THREE.BoxGeometry(1.05, 0.8, 0.22);
  private readonly lampTargetGeometry = new THREE.BoxGeometry(2.4, 0.4, 0.85);
  private readonly liftSocketGeometry = new THREE.BoxGeometry(0.55, 0.65, 0.35);
  private readonly steel = new THREE.MeshStandardMaterial({ color: 0x2a3337, roughness: 0.7, metalness: 0.72 });
  private readonly indicatorMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly targetUnregisters: (() => void)[] = [];
  private readonly lampLights: THREE.PointLight[] = [];
  private readonly bridge: THREE.Mesh;
  get voltRouteCleared(): boolean { return this.guardDestroyed(2); }
  private bridgeRegistered = false;
  private bridgeFullUVs?: Float32Array;
  private bridgeUVStretch = -1;
  private readonly texturedDressing = new Set<THREE.BufferGeometry>();
  private disposed = false;

  constructor(options: { room: BlackoutTransitRoom; world: CollisionWorld; surfaces: SurfaceRegistry; electricalTargets: ElectricalTargetRegistry }) {
    this.room = options.room;
    this.world = options.world;
    this.surfaces = options.surfaces;
    this.root.name = 'level-3-room-2-powered-transit-controller';
    const kit = this.room.surfaceMaterials;
    if (kit) {
      borrowBlackoutMaps(this.steel, kit.get('machineryMetal'));
      for (const [geometry, material] of [[this.liftSocketGeometry, this.steel], [this.lampTargetGeometry, this.steel], [this.lightTargetGeometry, this.steel]] as const) {
        mapBlackoutPropUVs(geometry, material.userData.tileSizeMetres);
      }
      mapBlackoutPropUVs(this.thrusterGeometry, this.steel.userData.tileSizeMetres);
    }
    this.room.root.add(this.root);
    const unregisterTargets = this.targetUnregisters;
    const ownedDissolves: DissolveTarget[] = [];
    const ownedLifts: PoweredLiftDevice[] = [];
    const ownedDrones: SecurityDrone[] = [];
    const ownedLasers: LaserHazard[] = [];
    let projectileSystem: DroneProjectileSystem | undefined;
    try {
      projectileSystem = new DroneProjectileSystem(options.world, this.damage, { damage: WEAK_SEWER_DRONE.projectileDamage, speedMetresPerSecond: WEAK_SEWER_DRONE.projectileSpeed, poolCapacity: 48, lifetimeSeconds: 1.2, maximumRangeMetres: 36 }, { bob: TRANSIT_MAXIMUM_HEALTH, volt: TRANSIT_MAXIMUM_HEALTH });
      this.projectiles = projectileSystem;
      this.projectilePresentation = new DroneProjectilePresentation(projectileSystem.states, 0.09);
      this.root.add(this.projectilePresentation.mesh);
      this.damage.events.on('died', ({ slimeId }) => { this.pendingFailure = slimeId; });
      const lights = this.room.receiverPositions.map((position, index) => {
        const target = this.makeReceiver(`transit-light-${String.fromCharCode(97 + index)}`, `Light bank ${String.fromCharCode(65 + index)}`, position, options.electricalTargets, unregisterTargets, true);
        this.lampLights.push(target.light);
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
        if (kit) {
          const deck = device.platform.collisionMesh;
          borrowBlackoutMaps(deck.material, kit.get('floorDeck'));
          deck.material.color.setHex(0xffffff);
          mapBlackoutPropUVs(deck.geometry, deck.material.userData.tileSizeMetres);
        }
        // Attach the conducting contact to the actual moving lift, rather than
        // a floating remote proxy on Volt's catwalk.
        const liftTarget = device.root.getObjectByName(`${slot.id}-target`);
        if (liftTarget) liftTarget.visible = false;
        this.root.add(device.root);
        const socketMaterial = new THREE.MeshStandardMaterial({ color: 0x39413d, emissive: 0x48bc84, emissiveIntensity: 0, metalness: 0.42, roughness: 0.52 });
        if (kit) borrowBlackoutMaps(socketMaterial, kit.detail('copper'));
        this.indicatorMaterials.push(socketMaterial);
        const socket = new THREE.Mesh(this.liftSocketGeometry, socketMaterial);
        socket.name = `${slot.id}-conducting-contact`;
        socket.position.set(-slot.size.x / 2 - 0.45, 2.1, 0);
        device.root.add(socket);
        const contactStem = new THREE.Mesh(this.dressingGeometry, this.steel);
        contactStem.name = `${slot.id}-contact-mount`;
        contactStem.scale.set(0.12, 2.1, 0.12);
        contactStem.position.set(socket.position.x, 1.05, 0);
        this.mapScaledDressing(contactStem);
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
          isAvailable: () => this.active && this.guardDestroyed(index),
          setConnectionState: connected => device.core.setConnectionState(connected && this.guardDestroyed(index)),
        };
        unregisterTargets.push(options.electricalTargets.register(receiverAdapter));
        device.core.setAvailable(false);
        ownedLifts.push(device);
        return device;
      });
      this.lifts = lifts;

      const guardedRoutes = [
        this.room.bobRoutePlatforms[1]!.position.clone().add(new THREE.Vector3(0, .7, 0)),
        // Scan the exposed near edge of the upper landing. The drone hovers
        // below its deck, so the centre of that deck would block its own LOS.
        this.room.bobRoutePlatforms[3]!.position.clone().add(new THREE.Vector3(2, .7, 0)),
        this.room.voltCatwalk.position.clone().setZ(132).add(new THREE.Vector3(0, .7, 0)),
      ];
      for (const [index, position] of TRANSIT_SEWER_DRONE_POSITIONS.entries()) {
        const enemy = new EmergingSewerDrone(`transit-sewer-drone-${index + 1}`, this.root,
          new THREE.Vector3(...position), options.world, options.surfaces, this.projectiles, this.resources,
          { routeTarget: guardedRoutes[index]!, acidSurfaceY: this.room.acidBounds.surfaceY, sweepMetres: index === 2 ? 2 : 1,
            followAcquiredTarget: index === 2 });
        this.emergingDrones.push(enemy); ownedDrones.push(enemy.weapon); ownedDissolves.push(enemy.target);
      }
      this.scannerBeams = new ScannerBeamPresentation(this.world, this.emergingDrones.map(enemy => ({
        mesh: enemy.beam, ignoredCollider: enemy.target.mesh, enabled: () => this.active && enemy.weapon.readModel.enabled,
      })));
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
      const bridgeDirection = bridgeEnd.clone().sub(bridgeStart);
      // Keep the width horizontal so both top corners meet each flat anchor.
      const bridgeAlong = bridgeDirection.clone().normalize();
      const bridgeAcross = new THREE.Vector3(-bridgeAlong.z, 0, bridgeAlong.x).normalize();
      const bridgeUp = new THREE.Vector3().crossVectors(bridgeAcross, bridgeAlong);
      // Anchors describe top-edge midpoints; move the slab centre below them
      // along its normal, including the horizontal offset caused by the slope.
      bridgeStart.addScaledVector(bridgeUp, -0.225);
      bridgeEnd.addScaledVector(bridgeUp, -0.225);
      const bridgeCentre = bridgeStart.clone().add(bridgeEnd).multiplyScalar(0.5);
      this.bridge = new THREE.Mesh(new THREE.BoxGeometry(bridgeDirection.length(), 0.45, 3.6), new THREE.MeshStandardMaterial({ color: 0x353e41, roughness: 0.72, metalness: 0.7 }));
      this.bridge.name = 'transit-deployable-bridge-deck'; this.bridge.position.copy(bridgeCentre);
      this.bridge.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(bridgeAlong, bridgeUp, bridgeAcross));
      this.bridge.visible = false; this.bridge.userData.surfaceTag = 'default';
      this.bridge.userData.preciseMovementCorners = true; this.root.add(this.bridge);
      this.bridgeStartPosition.copy(bridgeStart);
      this.bridgeEndPosition.copy(bridgeEnd);

      if (kit) {
        const material = this.bridge.material as THREE.MeshStandardMaterial;
        borrowBlackoutMaps(material, kit.get('floorDeck'));
        material.color.setHex(0xffffff);
        mapBlackoutPropUVs(this.bridge.geometry, material.userData.tileSizeMetres);
        this.bridgeFullUVs = new Float32Array(this.bridge.geometry.getAttribute('uv').array);
      }
      this.drones = ownedDrones;
      this.root.updateMatrixWorld(true);
      this.setActive(false);
    } catch (error) {
      this.laserPresentation?.dispose();
      for (const unregister of unregisterTargets.reverse()) unregister();
      for (const enemy of this.emergingDrones) enemy.dispose();
      for (const lift of ownedLifts.reverse()) lift.dispose();

      for (const laser of ownedLasers.reverse()) laser.dispose();
      projectileSystem?.dispose();
      this.root.removeFromParent();
      throw error;
    }
    this.bridgeAudio = new WorldAudioSource({ root: this.bridge, kind: 'machinery', progress: () => this.bridgeProgress, settled: () => this.bridgeProgress === 0 || this.bridgeProgress === 1, enabled: () => this.active });
    this.syncInterlocks();
  }

  get isActive(): boolean { return this.active; }

  setActive(active: boolean): void {
    if (this.disposed) return;
    this.active = active;
    this.syncInterlocks();
    for (let i = 0; i < this.lifts.length; i++) this.updateLiftVisual(i);
    if (!active) for (const enemy of this.emergingDrones) enemy.suspend();
    for (const laser of this.lasers) laser.root.visible = active;
    if (this.laserPresentation) this.laserPresentation.root.visible = active;
    this.updateLampBanks();
    for (const receiver of [...this.lights, this.lockReceiver]) {
      if (active) this.updateReceiver(receiver, 0);
      else receiver.light.intensity = 0;
    }
    this.updateSwitchButton();
    if (!active) {
      for (const receiver of [...this.lights, this.lockReceiver]) {
        receiver.connected = false;
      }
      this.projectiles.reset();
    }
  }

  update(dt: number, bodies: TransitBodies): TransitSlimeId | undefined {
    if (this.disposed) return undefined;
    if (!Number.isFinite(dt) || dt <= 0) throw new Error('Transit controller deltaSeconds must be positive and finite.');
    if (!this.active) return undefined;
    this.syncInterlocks();
    this.currentVoltPosition.set(bodies.volt.position.x, bodies.volt.position.y, bodies.volt.position.z);
    for (let i = 0; i < this.lights.length; i++) this.updateReceiver(this.lights[i]!, dt);
    this.updateReceiver(this.lockReceiver, dt);
    this.updateLampBanks();
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

    if (this.room.acidAt(bodies.bob.position)) {
      this.room.acidInteractions.fallPulse(bodies.bob);
      return 'bob';
    }
    if (this.room.acidAt(bodies.volt.position)) {
      this.room.acidInteractions.fallPulse(bodies.volt);
      return 'volt';
    }
    if (this.room.exitAt(bodies.bob.position) && this.room.exitAt(bodies.goop.position) && this.room.exitAt(bodies.volt.position) && this.bridgeLocked) this.complete = true;
    const bobOnPad = (mesh: THREE.Mesh, tolerance: number) => bodies.bob.isSupportedBy(mesh) && Math.abs(bodies.bob.position.z - mesh.position.z) <= tolerance;
    if (this.emergingDrones[0]?.state.state === 'destroyed' && bobOnPad(this.room.bobRoutePlatforms[1]!, 1.5)) this.checkpointTutorialReached = true;
    if (this.checkpointTutorialReached) this.checkpointStage = Math.max(this.checkpointStage, 1);
    const finalPad = this.room.bobRoutePlatforms[this.room.bobRoutePlatforms.length - 1]!;
    if (this.guardDestroyed(0) && this.guardDestroyed(1) && bobOnPad(finalPad, 2.5)) this.checkpointStage = Math.max(this.checkpointStage, 2);
    this.updateObjective();
    return undefined;
  }

  capture(): SerializableValue {
    const state: TransitSnapshot = {
      active: this.active, complete: this.complete, checkpointStage: this.checkpointStage,
      lights: this.lights.map(({ charge, latched }) => ({ charge, latched })),
      sewerDrones: this.emergingDrones.map(enemy => enemy.capture()),
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
    this.emergingDrones.forEach((enemy, i) => { if (snapshot.sewerDrones[i]) enemy.restore(snapshot.sewerDrones[i]!); else enemy.reset(); });
    this.scannerBeams?.reset();
    this.liftGrace.forEach((_, i) => { this.liftGrace[i] = snapshot.liftGrace[i] ?? 0; });
    this.lifts.forEach((lift, i) => {
      // A stale raised carrier cannot bridge its encounter while its guard lives.
      if (!this.guardDestroyed(i)) lift.reset();
      else if (snapshot.lifts[i] !== undefined) lift.restoreState(snapshot.lifts[i]!);
    });
    this.switchHeld = snapshot.switchHeld;
    this.bridgeDeployed = this.voltRouteCleared && snapshot.bridgeDeployed;
    this.bridgeProgress = this.voltRouteCleared ? Math.max(0, Math.min(1, snapshot.bridgeProgress ?? (snapshot.bridgeDeployed ? 1 : 0))) : 0;
    this.bridgeLocked = this.voltRouteCleared && snapshot.bridgeLocked;
    this.bridgeRelease = snapshot.bridgeRelease;
    this.restoreReceiver(this.lockReceiver, this.voltRouteCleared ? snapshot.lockReceiver : { charge: 0, latched: false });
    this.complete = snapshot.complete && this.bridgeLocked;
    for (const enemy of this.emergingDrones) { enemy.weapon.reset(); enemy.weapon.setCollisionEnabled(false); enemy.weapon.setPresentationVisible(false); enemy.suspend(); }
    for (const laser of this.lasers) laser.reset();
    this.laserElapsed = 0;
    this.laserPresentation?.sync();
    this.updateBridgeMeshes();
    this.bridgeAudio.reset();
    this.syncInterlocks();
    for (let i = 0; i < this.lifts.length; i++) this.updateLiftVisual(i);
    this.updateLampBanks();
    this.updateSwitchButton();
  }

  resetTransient(): void {
    this.pendingFailure = undefined;
    this.projectiles.reset();
    this.projectilePresentation.reset();
    this.damage.reset();
    for (const enemy of this.emergingDrones) { enemy.weapon.reset(); enemy.weapon.setCollisionEnabled(false); enemy.weapon.setPresentationVisible(false); enemy.suspend(); }
  }

  reset(): void {
    if (this.disposed) return;
    this.projectiles.reset(); this.damage.reset();
    this.pendingFailure = undefined;
    for (const receiver of [...this.lights, this.lockReceiver]) this.restoreReceiver(receiver, { charge: 0, latched: false });
    for (const enemy of this.emergingDrones) enemy.reset();
    this.scannerBeams?.reset();
    this.liftGrace.fill(0);
    for (const lift of this.lifts) lift.reset();
    for (let i = 0; i < this.lifts.length; i++) this.updateLiftVisual(i);
    for (const laser of this.lasers) laser.reset();
    this.laserElapsed = 0;
    this.laserPresentation?.sync();
    this.switchHeld = false; this.bridgeDeployed = false; this.bridgeLocked = false;
    this.bridgeRelease = 0; this.checkpointTutorialReached = false; this.checkpointStage = 0; this.complete = false;
    this.bridgeProgress = 0;
    this.syncInterlocks();
    this.updateBridgeMeshes();
    this.bridgeAudio.reset();
    this.updateLampBanks();
    this.updateSwitchButton();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.bridgeAudio.dispose();
    for (const unregister of [...this.targetUnregisters].reverse()) unregister();
    this.targetUnregisters.length = 0;
    for (const lift of [...this.lifts].reverse()) {
      // These fittings belong to this controller, not MovingPlatform's traversal.
      lift.root.getObjectByName(lift.id + '-conducting-contact')?.removeFromParent();
      lift.root.getObjectByName(lift.id + '-contact-mount')?.removeFromParent();
      lift.dispose();
    }
    for (const enemy of this.emergingDrones) enemy.dispose();
    if (this.bridgeRegistered) { this.world.unregister(this.bridge); this.surfaces.unregister(this.bridge); }
    this.laserPresentation?.dispose();
    for (const laser of [...this.lasers].reverse()) laser.dispose();
    this.projectilePresentation.dispose();
    this.projectiles.dispose(); this.damage.dispose(); this.resources.dispose();
    for (const light of this.lampLights) light.removeFromParent();
    this.root.removeFromParent(); this.root.clear();
    this.lightGeometry.dispose(); this.lightTargetGeometry.dispose(); this.liftSocketGeometry.dispose();
    this.dressingGeometry.dispose();
    for (const geometry of this.texturedDressing) geometry.dispose();
    this.texturedDressing.clear();
    this.thrusterGeometry.dispose(); this.plumeGeometry.dispose(); this.plumeMaterial.dispose();
    this.lampTargetGeometry.dispose();
    this.bridge.geometry.dispose(); (this.bridge.material as THREE.Material).dispose();
    for (const receiver of [...this.lights, this.lockReceiver]) {
      if (receiver.ownsTargetMaterial) receiver.targetMaterial.dispose();
      else receiver.targetMaterial.emissiveIntensity = 0;
    }
    this.steel.dispose();
    for (const material of this.indicatorMaterials) material.dispose();
  }

  private makeReceiver(id: string, displayName: string, position: THREE.Vector3, registry: ElectricalTargetRegistry, registrations: (() => void)[], isLamp = false, existingTargetMesh?: THREE.Mesh): MutableTimedReceiver {
    const root = new THREE.Group(); root.name = `${id}-receiver`; root.position.copy(position); this.root.add(root);
    if (!existingTargetMesh) {
      const backing = new THREE.Mesh(this.lightGeometry, this.steel); backing.position.y = isLamp ? 0.25 : 0.55;
      if (isLamp) backing.scale.set(2.1, 1, 3);
      this.mapScaledDressing(backing);
      root.add(backing);
    }
    const targetMaterial = existingTargetMesh?.material ?? new THREE.MeshStandardMaterial({ color: 0x39413d, roughness: 0.45, emissive: 0xffcc7a, emissiveIntensity: 0 });
    if (!(targetMaterial instanceof THREE.MeshStandardMaterial)) throw new Error(`Electrical contact ${id} requires a standard material.`);
    if (!existingTargetMesh && this.room.surfaceMaterials) borrowBlackoutMaps(targetMaterial, this.room.surfaceMaterials.detail('copper'));
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
      setConnectionState: (connected) => {
        receiver.connected = connected;
      },
    };
    Object.assign(receiver, { target, root, light, targetMaterial, ownsTargetMaterial: !existingTargetMesh, connected: false, charge: 0, latched: false, unregister: registry.register(target) });
    registrations.push(receiver.unregister);
    return receiver;
  }

  private mapScaledDressing(mesh: THREE.Mesh): void {
    if (!this.room.surfaceMaterials) return;
    // Shared unit boxes have different authored scales: each chart needs its
    // physical span. Preserve positions, normals and transforms verbatim.
    mesh.geometry = mesh.geometry.clone();
    this.texturedDressing.add(mesh.geometry);
    mesh.updateMatrix();
    mapBlackoutBoxUVs(mesh.geometry, mesh.matrix, (mesh.material as THREE.MeshStandardMaterial).userData.tileSizeMetres, 'object');
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
    if (receiver === this.lockReceiver && !this.voltRouteCleared) {
      receiver.connected = false; receiver.charge = 0; receiver.latched = false;
      receiver.targetMaterial.emissive.setHex(0xcc3020);
      receiver.targetMaterial.emissiveIntensity = .6; receiver.light.intensity = 0;
      return;
    }
    if (receiver === this.lockReceiver) receiver.targetMaterial.emissive.setHex(0xffcc7a);
    if (receiver.connected && !receiver.latched) receiver.charge = Math.min(1, receiver.charge + dt / LIGHT_CHARGE_SECONDS);
    else if (!receiver.latched) receiver.charge = Math.max(0, receiver.charge - dt * 0.5);
    if (receiver.charge >= 1 - 1e-9) {
      if (!receiver.latched) {
        const position = receiver.root.getWorldPosition(new THREE.Vector3());
        gameplayAudioEvents.emit('cue', { sound: 'volt-charge-ready-01', position });
      }
      receiver.charge = 1; receiver.latched = true;
    }
    const powered = receiver.latched || receiver.connected;
    receiver.targetMaterial.emissiveIntensity = powered ? 1.2 : 0;
    receiver.light.color.setHex(receiver.latched ? 0xffd991 : 0xffc45c);
    receiver.light.intensity = receiver.latched ? 11 : receiver.connected ? 2.8 : 0;
  }

  private restoreReceiver(receiver: MutableTimedReceiver, state: ReceiverSnapshot): void {
    receiver.connected = false; receiver.charge = Math.max(0, Math.min(1, state.charge)); receiver.latched = state.latched;
    this.updateReceiver(receiver, 0.000001);
  }

  private updateSwitchAndBridge(dt: number, bob: KinematicBody): void {
    const switchPoint = this.room.switchBodyPosition;
    const dx = bob.position.x - switchPoint.x, dy = bob.position.y - switchPoint.y, dz = bob.position.z - switchPoint.z;
    const close = dx * dx + dy * dy + dz * dz <= 0.9 * 0.9;
    const wallHeld = bob.attached && (bob.attachmentSurfaceName.includes('switch') || bob.attachmentSurfaceName.includes('bob-bridge-switch-sticky-wall'));
    const wasHeld = this.switchHeld;
    this.switchHeld = !this.bridgeLocked && close && wallHeld;
    if (wasHeld !== this.switchHeld) gameplayAudioEvents.emit('cue', {
      sound: this.switchHeld ? 'world-button-press-01' : 'world-button-release-01',
      position: this.room.switchButton.getWorldPosition(new THREE.Vector3()), maxDistance: 16,
    });
    this.updateSwitchButton();
    if (this.bridgeLocked) this.bridgeProgress = 1;
    else if (this.switchHeld) this.bridgeRelease = 0;
    else if (this.bridgeProgress > 0) {
      this.bridgeRelease += dt;
    }
    if (this.voltRouteCleared && this.lockReceiver.latched) {
      if (!this.bridgeLocked) gameplayAudioEvents.emit('cue', {
        sound: 'world-lever-lock-01', position: this.room.bridgeLockContact.getWorldPosition(new THREE.Vector3()), maxDistance: 24,
      });
      this.bridgeLocked = true; this.bridgeProgress = 1;
    }
    const wantsBridge = this.voltRouteCleared && (this.bridgeLocked || this.switchHeld || (this.bridgeProgress > 0 && this.bridgeRelease < BRIDGE_RELEASE_SECONDS));
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
    if (this.bridgeFullUVs && this.bridgeUVStretch !== this.bridge.scale.x) {
      updateBlackoutStretchUVs(this.bridge.geometry, this.bridgeFullUVs, this.bridge.scale.x);
      this.bridgeUVStretch = this.bridge.scale.x;
    }
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
    visual.socket.emissiveIntensity = !this.guardDestroyed(index) ? .6 : powered ? 1.5 : 0;
    visual.socket.emissive.setHex(!this.guardDestroyed(index) ? 0xcc3020 : powered ? 0x48bc84 : 0x8c6916);
  }

  private guardDestroyed(index: number): boolean { return this.emergingDrones[index]?.state.state === 'destroyed'; }

  private syncInterlocks(): void {
    for (let index = 0; index < this.lifts.length; index++) {
      const lift = this.lifts[index]!;
      const available = this.active && this.guardDestroyed(index);
      lift.core.setAvailable(available);
      if (!available) { lift.core.setConnectionState(false); this.liftGrace[index] = 0; }
    }
  }

  bindBurns(system: DissolveSystem): void { for (const enemy of this.emergingDrones) enemy.bindBurns(system); }

  updatePresentation(dt: number, camera: THREE.Camera): void { this.scannerBeams?.update(dt, camera); }

  private readonly roomTargets: SecurityDroneTarget[] = (['bob', 'goop', 'volt'] as const)
    .map(slimeId => ({ slimeId, position: new THREE.Vector3() }));
  private readonly roomProjectileTargets: DroneProjectileTarget[] = (['bob', 'goop', 'volt'] as const)
    .map(slimeId => ({ slimeId, position: new THREE.Vector3(), previousPosition: new THREE.Vector3(), radiusMetres: .45 }));

  private updateDrones(dt: number, bodies: TransitBodies): void {
    for (let i = 0; i < this.roomTargets.length; i++) {
      const target = this.roomTargets[i]!, projectile = this.roomProjectileTargets[i]!, body = bodies[target.slimeId];
      (target.position as THREE.Vector3).copy(body.position);
      (projectile.position as THREE.Vector3).copy(body.position);
      (projectile.previousPosition as THREE.Vector3).copy(body.previousPosition);
      (projectile as { radiusMetres: number }).radiusMetres = body.radiusMetres;
    }
    for (const enemy of this.emergingDrones) enemy.update(dt, this.roomTargets, this.active);
    this.projectiles.update(dt, this.roomProjectileTargets);
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
    else if (!this.guardDestroyed(0)) this.objective = 'Goop must destroy the first east-side drone to unlock the first lift. Then Volt must power it for Bob.';
    else if (!this.guardDestroyed(1)) this.objective = 'Goop must destroy the second east-side drone to unlock the second lift. Then Volt must power it for Bob.';
    else if (!this.voltRouteCleared) this.objective = 'Security interlock: Goop must destroy the west-side drone before Volt can cross the bridge.';
    else if (this.bridgeLocked) this.objective = 'Regroup on the far side and reach the exit.';
    else if (this.bridgeDeployed) this.objective = this.lights[2]?.latched ? 'Clear the crossing with Goop, then power the exit door’s lower edge to lock the bridge.' : 'Power the bridge-side light bank and clear the crossing with Goop.';
    else if (this.checkpointTutorialReached) this.objective = 'Reactivate the transit lifts and find the far-side switch.';
    else if (this.lights.some(light => light.latched)) this.objective = 'Use Goop to destroy the emerging sewer drones and clear the route for Bob.';
    else this.objective = 'Find Volt’s maintenance route and restore a local light bank.';
  }
}

function parseSnapshot(value: SerializableValue): TransitSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid transit checkpoint state.');
  const state = value as unknown as TransitSnapshot;
  if (!Array.isArray(state.lights) || !Array.isArray(state.sewerDrones) || !Array.isArray(state.liftGrace)) throw new Error('Incomplete transit checkpoint state.');
  return state;
}
