import { batchMaintenanceScout } from '../render/hazards/BatchMaintenanceScout.ts';
import * as THREE from 'three';
import { BeamOcclusion } from '../render/hazards/BeamOcclusion.ts';
import { SlimeLightSampler } from '../render/slime/SlimeLightSampler.ts';
import type { SlimeMaterial } from '../render/slime/SlimeMaterial.ts';
import { RoomFivePatrol } from './RoomFivePatrol.ts';
import { ROOM_FIVE_JUMPS } from '../levels/RoomFiveParkour.ts';
import { createRustedSewerDrone } from '../levels/RustedSewerDrone.ts';
import type { SecurityNetwork } from '../puzzle/SecurityNetworkController.ts';
import { SewerDroneDamage } from '../render/hazards/SewerDroneDamage.ts';
import { CultivationSewerLighting } from '../render/environment/cultivation/CultivationSewerLighting.ts';
import { SEWER_DRONE_POSITION } from '../levels/RoomFiveSewer.ts';
import { SecurityDrone, type SecurityDroneTarget } from './SecurityDrone.ts';
import { DroneProjectileSystem, type DroneProjectileTarget } from './DroneProjectileSystem.ts';
import { SecurityDronePresentationResources } from '../render/hazards/SecurityDronePresentation.ts';
import { DroneProjectilePresentation } from '../render/hazards/DroneProjectilePresentation.ts';
import { SlimeDamageSystem } from '../systems/SlimeDamageSystem.ts';
import type { CollisionWorld } from '../physics/CollisionWorld.ts';
import type { SurfaceRegistry } from '../physics/SurfaceRegistry.ts';
import type { KinematicBody } from '../physics/KinematicBody.ts';
import { LevelTwoRoomFiveGreybox, ROOM_FIVE_SAFE_STATIONS, ROOM_FIVE_ROUTE_NETWORKS, ROOM_FIVE_NETWORK_COLOURS } from '../levels/LevelTwoRoomFiveGreybox.ts';

/** Room-local security networks reuse existing LOS, projectiles and health. */
export const ROOM_FIVE_DRONE_VIEW_HALF_ANGLE = .4;
export const ROOM_FIVE_DRONE_VIEW_RANGE = 15;
export class RoomFiveDroneEncounter {
  readonly damage = new SlimeDamageSystem();
  readonly projectiles: DroneProjectileSystem;
  readonly presentation: DroneProjectilePresentation;
  readonly drones: readonly SecurityDrone[];
  readonly brokenDrone: SecurityDrone;
  readonly patrols: RoomFivePatrol[] = [];
  private readonly networks: SecurityNetwork[] = [];
  private readonly flyers: ReturnType<typeof createRustedSewerDrone>[] = [];
  private readonly resources: SecurityDronePresentationResources;
  private readonly targets: readonly SecurityDroneTarget[];
  private readonly projectileTargets: readonly DroneProjectileTarget[];
  private readonly beams: THREE.Mesh[] = [];
  private readonly beamOcclusion = new BeamOcclusion();
  private readonly beamOrigin = new THREE.Vector3();
  private presentationStep = 0;
  private readonly beamLengths: number[] = [];
  private readonly world: CollisionWorld;
  private readonly slimeLighting = new SlimeLightSampler();
  private readonly searchLights: THREE.SpotLight[] = [];
  private readonly sewerLight = new THREE.PointLight(0xff7935, 0, 8);
  private readonly sewerLighting: CultivationSewerLighting;
  private readonly unsubscribe: () => void;
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly direction = new THREE.Vector3();
  private readonly sewerAim = new THREE.Vector3();
  private readonly sewerRotation = new THREE.Quaternion();
  private readonly sewerForward = new THREE.Vector3(0, 0, -1);
  private sewerTime = 0;
  private readonly sewerDamage: SewerDroneDamage;
  private disposed = false;
  readonly room: LevelTwoRoomFiveGreybox;
  constructor(room: LevelTwoRoomFiveGreybox, world: CollisionWorld, surfaces: SurfaceRegistry,
    bob: KinematicBody, goop: KinematicBody, requestDeath: (id: 'bob' | 'goop') => boolean,
    surfaceMaps?: { bumpMap: THREE.Texture | null; roughnessMap: THREE.Texture | null }) {
    this.resources = new SecurityDronePresentationResources(surfaceMaps);
    this.room = room;
    this.world = world;
    this.sewerLighting = new CultivationSewerLighting(room.root, surfaceMaps);
    this.sewerDamage = new SewerDroneDamage(room.brokenCore);
    this.sewerLight.name = 'room-5-rusted-drone-light';
    // Keep the light registered after dissolution: removing a light changes shader
    // variants across the entire room. Power it down without hiding its parent.
    room.root.add(this.sewerLight);
    this.updateSewerLightPosition();
    this.projectiles = new DroneProjectileSystem(world, this.damage, { damage: 30, speedMetresPerSecond: 120 });
    this.presentation = new DroneProjectilePresentation(this.projectiles.states);
    // Projectile state is world-space, unlike authored room geometry.
    this.targets = [{ slimeId: 'bob', position: bob.position }, { slimeId: 'goop', position: goop.position }];
    this.projectileTargets = [{ slimeId: 'bob', position: bob.position, previousPosition: bob.previousPosition, radiusMetres: bob.radiusMetres },
      { slimeId: 'goop', position: goop.position, previousPosition: goop.previousPosition, radiusMetres: goop.radiusMetres }];
    const create = (id: string, position: THREE.Vector3, forward: THREE.Vector3, sewer = false) => {
      const drone = new SecurityDrone({ id, type: 'ceiling', initialPosition: position,
        colliderSize: new THREE.Vector3(2, 1.3, 2), forward: forward.normalize(), scanAxis: new THREE.Vector3(0, 1, 0),
        scanHalfAngleRadians: .035, scanSpeedRadiansPerSecond: .12, detectionHalfAngleRadians: sewer ? Math.PI : ROOM_FIVE_DRONE_VIEW_HALF_ANGLE,
        detectionRangeMetres: sewer ? 40 : ROOM_FIVE_DRONE_VIEW_RANGE, warningSeconds: sewer ? .4 : .6,
        detectionAnchor: sewer ? undefined : new THREE.Vector3(),
        forwardAnchorMetres: sewer ? undefined : 1.4,
        fireIntervalSeconds: sewer ? .65 : .12, targetLossGraceSeconds: .1, cooldownSeconds: .5,
        muzzleAnchor: new THREE.Vector3(0, -.1, sewer ? -2.5 : -1.1), targetPolicy: sewer ? 'goop-only' : 'bob-only', initialScanPhase: 0 },
      world, surfaces, this.projectiles, this.resources);
      room.root.add(drone.root); return drone;
    };
    const makePatrol = (network: SecurityNetwork, index: number, partner = false) => {
      const a = new THREE.Vector3(...ROOM_FIVE_SAFE_STATIONS[index]);
      const b = new THREE.Vector3(...ROOM_FIVE_SAFE_STATIONS[index + 1]);
      const centre = a.clone().lerp(b, .5); centre.y += 1;
      const along = b.clone().sub(a); along.y = 0; along.normalize();
      const perpendicular = new THREE.Vector3(along.z, 0, -along.x);
      const position = centre.clone().addScaledVector(perpendicular, 7); position.y += index === 2 || index === 5 ? .8 : 3;
      if (partner) position.addScaledVector(perpendicular, 7);
      // First blue guard watches across the approach, not through its red partner.
      if (index === 0 && partner) position.set(-8, 16.5, 24);
      // Offset the later red partner sideways, keeping green's beam clear even
      // when Goop independently shifts the two patrol clocks.
      if (index === 2 && partner) position.set(3, 20.3, 58);
      // Keep the blue patrol south of the pod's swept glass volume.
      if (index === 4) position.z += 6;
      if (index === 3) position.z += 5;
      if (index === 5) position.set(partner ? 9 : 6, partner ? 33.5 : 29.3, partner ? 51.5 : 48);
      if (index === 5 && partner) position.set(9, 33.5, 49.5);
      // Aim red guards through the actual landing heights, not the midpoint
      // between sheltered stations (which can leave the jumping route clear).
      if (network === 'red') {
        centre.set(0, 0, 0);
        for (const [x, y, z] of ROOM_FIVE_JUMPS[index]) centre.add(new THREE.Vector3(x, y + .66, z));
        centre.divideScalar(ROOM_FIVE_JUMPS[index].length);
      }
      const forward = centre.clone().sub(position).normalize();
      const drone = create(`room-5-${network}-security-${index}${partner ? '-partner' : ''}`, position, forward);
      drone.root.userData.network = network;
      drone.root.userData.route = index;
      this.networks.push(network);
      this.patrols.push(new RoomFivePatrol(position.clone(), forward.clone(), partner ? Math.PI : 0));
      const flyer = createRustedSewerDrone(false);
      batchMaintenanceScout(flyer.body, flyer.eye, surfaceMaps);
      flyer.body.scale.setScalar(.75);
      flyer.body.name = `${drone.id}-flying-shell`;
      drone.presentation.root.visible = false; drone.root.add(flyer.body); this.flyers.push(flyer);
      // Saturated blue, with stronger opacity so it stays readable without whitening it.
      const beamColour = network === 'blue' ? 0x165dff : ROOM_FIVE_NETWORK_COLOURS[network];
      const beam = new THREE.Mesh(new THREE.ConeGeometry(Math.tan(ROOM_FIVE_DRONE_VIEW_HALF_ANGLE) * ROOM_FIVE_DRONE_VIEW_RANGE, ROOM_FIVE_DRONE_VIEW_RANGE, 24, 1, true),
        new THREE.MeshBasicMaterial({ color: beamColour, transparent: true, opacity: network === 'blue' ? .09 : .02, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }));
      beam.geometry.translate(0, -ROOM_FIVE_DRONE_VIEW_RANGE / 2, 0); beam.name = `room-5-${network}-scanner-${index}`;
      beam.position.copy(position); room.root.add(beam); this.beams.push(beam);
      this.beamLengths.push(-1);
      const search = new THREE.SpotLight(beamColour, network === 'blue' ? 65 : 45, ROOM_FIVE_DRONE_VIEW_RANGE, ROOM_FIVE_DRONE_VIEW_HALF_ANGLE, .2, 2);
      search.name = `${drone.id}-search-light`; search.castShadow = true;
      search.shadow.mapSize.set(512, 512); search.shadow.bias = -.0002; search.shadow.normalBias = .025;
      search.shadow.camera.near = .2;
      room.root.add(search, search.target); this.searchLights.push(search);
      return drone;
    };
    const drones = ROOM_FIVE_ROUTE_NETWORKS.map((network, index) => makePatrol(network, index));
    // Three increasingly elevated paired crossings before Volt's release lever.
    for (const index of [0, 2, 5]) drones.push(makePatrol(ROOM_FIVE_ROUTE_NETWORKS[(index + 1) % 3], index, true));
    this.drones = drones;
    this.brokenDrone = create('room-5-damaged-sewer-drone', SEWER_DRONE_POSITION.clone(), new THREE.Vector3(0, 0, -1), true);
    // The authored rusted shell is the visible, acid-targetable collider.
    this.brokenDrone.presentation.root.visible = false;
    this.brokenDrone.setCollisionEnabled(false);
    this.unsubscribe = this.damage.events.on('died', ({ slimeId }) => requestDeath(slimeId));
    room.root.traverse(object => {
      if (object instanceof THREE.Mesh) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        object.castShadow = !object.userData.shadowProxyReceiver && materials.some(material => material.visible && !material.transparent);
        object.receiveShadow = true;
      }
      if (object instanceof THREE.PointLight || object instanceof THREE.SpotLight) {
        const index = this.searchLights.indexOf(object as THREE.SpotLight);
        this.slimeLighting.sources.push({ light: object, ignored: index >= 0 ? this.drones[index].collider : object === this.sewerLight ? room.brokenCore : undefined });
      }
    });
    room.captiveVolt.castShadow = false;
    this.reset();
  }
  lightSlime(material: SlimeMaterial, position: THREE.Vector3): void {
    this.slimeLighting.apply(material, position, this.world);
  }
  update(dt: number): void {
    if (this.disposed) return;
    this.damage.update(dt);
    this.sewerLighting.update(dt);
    this.presentationStep++;
    for (let i = 0; i < this.drones.length; i++) {
      const drone = this.drones[i];
      const network = this.networks[i];
      const enabled = this.room.controller.security.isEnabled(network);
      this.patrols[i].update(dt, enabled);
      drone.root.position.copy(this.patrols[i].position);
      drone.setPatrolDirection(this.patrols[i].direction);
      drone.setEnabled(enabled);
      drone.update(dt, this.targets);
      drone.frontIndicator.material.color.setHex(drone.readModel.enabled ? ROOM_FIVE_NETWORK_COLOURS[network] : 0x20252a);
      const beam = this.beams[i]; beam.visible = drone.readModel.enabled;
      beam.position.copy(drone.root.position).addScaledVector(drone.readModel.scanDirection, 1.4);
      this.direction.copy(drone.readModel.scanDirection).negate();
      beam.quaternion.setFromUnitVectors(this.up, this.direction);
      this.direction.negate();
      beam.getWorldPosition(this.beamOrigin);
      // Spread collision sampling across ticks instead of casting every cone every tick.
      if (enabled && (i % 3 === this.presentationStep % 3 || this.beamLengths[i] < 0)) {
        this.beamOcclusion.clipGeometry(this.world, this.beamOrigin, beam.quaternion, beam.geometry, drone.collider);
        this.beamLengths[i] = ROOM_FIVE_DRONE_VIEW_RANGE;
      }
      beam.visible = enabled;
      this.flyers[i].body.quaternion.setFromUnitVectors(this.sewerForward, this.direction);
      this.flyers[i].eye.material.color.copy(drone.frontIndicator.material.color);
      const search = this.searchLights[i]; search.intensity = enabled ? (network === 'blue' ? 65 : 45) : 0;
      // Shadow maps now handle partial occlusion without cutting all illumination short.
      search.distance = ROOM_FIVE_DRONE_VIEW_RANGE;
      search.position.copy(drone.root.position).addScaledVector(this.direction, 1.4);
      search.target.position.copy(search.position).addScaledVector(this.direction, ROOM_FIVE_DRONE_VIEW_RANGE);
    }
    const sewerState = this.room.controller.brokenDroneState;
    this.sewerLight.intensity = sewerState === 'active' ? 45 : sewerState === 'rebooting'
      ? 18 * THREE.MathUtils.smoothstep(this.room.controller.rebootElapsed, .9, 1.5) : 0;
    const shell = this.room.brokenCore;
    this.sewerDamage.update(dt, this.room.controller.brokenDroneHits);
    if (sewerState === 'rebooting' || sewerState === 'active') {
      this.sewerTime += dt;
      const lift = THREE.MathUtils.smoothstep(this.room.controller.rebootElapsed, 0, 1.5);
      shell.position.y = THREE.MathUtils.damp(shell.position.y, SEWER_DRONE_POSITION.y + lift * (4 + Math.sin(this.sewerTime * 2.2) * .18), 6, dt);
      this.sewerAim.copy(this.targets[1].position); this.room.root.worldToLocal(this.sewerAim);
      this.sewerAim.sub(shell.position).normalize();
      this.sewerRotation.setFromUnitVectors(this.sewerForward, this.sewerAim);
      shell.quaternion.slerp(this.sewerRotation, 1 - Math.exp(-8 * dt));
    }
    this.updateSewerLightPosition();
    this.brokenDrone.root.position.copy(shell.position);
    this.brokenDrone.root.quaternion.copy(shell.quaternion);
    this.brokenDrone.setEnabled(sewerState === 'active');
    this.brokenDrone.update(dt, this.targets);
    if (this.room.controller.brokenDroneState === 'rebooting') {
      this.brokenDrone.frontIndicator.material.color.setHex(Math.sin(this.room.controller.rebootElapsed * 35) > 0 ? 0xffa13b : 0x202020);
    }
    this.room.sewer.eye.material.color.copy(this.brokenDrone.frontIndicator.material.color);
    if (sewerState === 'dormant') this.room.sewer.eye.material.color.setHex(0x080b07);
    this.projectiles.update(dt, this.projectileTargets);
  }
  private updateSewerLightPosition(): void {
    const shell = this.room.brokenCore;
    this.sewerLight.position.set(0, .2, -1.4).multiply(shell.scale)
      .applyQuaternion(shell.quaternion).add(shell.position);
  }
  reset(): void {
    this.damage.reset(); this.projectiles.reset(); this.presentation.reset();
    this.beamLengths.fill(-1); this.presentationStep = 0;
    for (const beam of this.beams) beam.visible = false;
    for (const search of this.searchLights) search.intensity = 0;
    for (let i = 0; i < this.drones.length; i++) {
      this.patrols[i].reset(); this.drones[i].reset();
      this.drones[i].setPresentationVisible(false);
      this.drones[i].root.position.copy(this.patrols[i].position);
      this.drones[i].setPatrolDirection(this.patrols[i].direction);
    }
    this.brokenDrone.reset(); this.brokenDrone.setEnabled(false);
    // SecurityDrone.reset restores its stock model and box. This adapter owns
    // a separate authored shell/acid target, including its destruction lifetime.
    this.brokenDrone.setPresentationVisible(false);
    this.brokenDrone.setCollisionEnabled(false);
    this.sewerTime = 0;
    this.sewerLighting.reset();
    this.room.brokenCore.position.copy(SEWER_DRONE_POSITION);
    this.room.brokenCore.rotation.set(.2, 0, 1.1);
    this.updateSewerLightPosition();
    this.sewerDamage.reset(this.room.controller.brokenDroneHits);
    this.sewerLight.intensity = 0;
    this.room.sewer.eye.material.color.setHex(0x080b07);
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    this.unsubscribe();
    for (const drone of this.drones) drone.dispose();
    this.brokenDrone.dispose(); this.presentation.dispose(); this.projectiles.dispose(); this.damage.dispose(); this.resources.dispose();
    this.sewerDamage.dispose();
    this.sewerLighting.dispose();
    this.sewerLight.removeFromParent(); this.sewerLight.dispose();
    for (const light of this.searchLights) { light.target.removeFromParent(); light.removeFromParent(); light.dispose(); }
    for (const flyer of this.flyers) {
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      flyer.body.traverse(object => { if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      } });
      flyer.body.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    }
    for (const beam of this.beams) { beam.removeFromParent(); beam.geometry.dispose(); (beam.material as THREE.Material).dispose(); }
  }
}
