import type {SecurityDroneGeometrySource} from '../render/hazards/SecurityDronePresentation.ts';
import { SewerDroneMotion, sewerDroneLampPower, WEAK_SEWER_DRONE } from './WeakSewerDrone.ts';
import { batchMaintenanceScout } from '../render/hazards/BatchMaintenanceScout.ts';
import { WorldAudioSource } from '../audio/WorldAudio.ts';
import { disposeShadowLight } from '../render/ShadowLightResources.ts';
import { applyCultivationShadowRoles } from '../render/environment/cultivation/CultivationShadowCoverage.ts';
import { CultivationPlatformBoosters } from '../render/environment/cultivation/CultivationPlatformBoosters.ts';
import * as THREE from 'three';
import { ScannerBeamPresentation } from '../render/hazards/ScannerBeamPresentation.ts';
import { ShadowedDroneBeam } from '../render/hazards/ShadowedDroneBeam.ts';
import type { GraphicsSettings } from '../render/GraphicsProfiles.ts';
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
  private readonly flightAudio: WorldAudioSource[] = [];
  private readonly networks: SecurityNetwork[] = [];
  private readonly flyers: {body:THREE.Object3D;eye:THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>;authored:boolean}[] = [];
  private readonly authoredModels:boolean;
  private readonly resources: SecurityDronePresentationResources;
  private readonly targets: readonly SecurityDroneTarget[];
  private readonly projectileTargets: readonly DroneProjectileTarget[];
  private readonly beams: THREE.Mesh[] = [];
  private readonly beamVolumes: ShadowedDroneBeam[] = [];
  private contactHardening = false;
  private readonly lampPosition = new THREE.Vector3();
  private readonly scannerBeams: ScannerBeamPresentation;
  private readonly searchLights: THREE.SpotLight[] = [];
  private readonly sewerLight = new THREE.PointLight(0xff7935, 0, 8);
  private readonly sewerLighting: CultivationSewerLighting;
  readonly platformBoosters: CultivationPlatformBoosters;
  private readonly unsubscribe: () => void;
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly direction = new THREE.Vector3();
  private readonly sewerMotion = new SewerDroneMotion();
  private readonly sewerForward = new THREE.Vector3(0, 0, -1);
  private readonly sewerDamage: SewerDroneDamage;
  private disposed = false;
  private cinematic = false;
  readonly room: LevelTwoRoomFiveGreybox;
  constructor(room: LevelTwoRoomFiveGreybox, world: CollisionWorld, surfaces: SurfaceRegistry,
    bob: KinematicBody, goop: KinematicBody, requestDeath: (id: 'bob' | 'goop') => boolean,
    surfaceMaps?: { bumpMap: THREE.Texture | null; roughnessMap: THREE.Texture | null },
    boosterScope?: THREE.Object3D, models?:SecurityDroneGeometrySource) {
    this.authoredModels=!!models;
    this.resources = new SecurityDronePresentationResources(surfaceMaps,!!models,!!models,models);
    this.room = room;
    this.sewerLighting = new CultivationSewerLighting(room.root, surfaceMaps);
    this.platformBoosters = new CultivationPlatformBoosters(room, surfaceMaps, boosterScope);
    this.sewerDamage = new SewerDroneDamage(room.brokenCore);
    this.sewerLight.name = 'room-5-rusted-drone-light';
    // Keep the light registered after dissolution: removing a light changes shader
    // variants across the entire room. Power it down without hiding its parent.
    room.root.add(this.sewerLight);
    this.updateSewerLightPosition();
    this.projectiles = new DroneProjectileSystem(world, this.damage, { damage: WEAK_SEWER_DRONE.projectileDamage, speedMetresPerSecond: WEAK_SEWER_DRONE.projectileSpeed });
    this.presentation = new DroneProjectilePresentation(this.projectiles.states);
    // Projectile state is world-space, unlike authored room geometry.
    this.targets = [{ slimeId: 'bob', position: bob.position }, { slimeId: 'goop', position: goop.position }];
    this.projectileTargets = [{ slimeId: 'bob', position: bob.position, previousPosition: bob.previousPosition, radiusMetres: bob.radiusMetres },
      { slimeId: 'goop', position: goop.position, previousPosition: goop.previousPosition, radiusMetres: goop.radiusMetres }];
    const create = (id: string, position: THREE.Vector3, forward: THREE.Vector3, sewer = false) => {
      const drone = new SecurityDrone({ id, type: 'ceiling', initialPosition: position,
        colliderSize: new THREE.Vector3(2, 1.3, 2), forward: forward.normalize(), scanAxis: new THREE.Vector3(0, 1, 0),
        scanHalfAngleRadians: .035, scanSpeedRadiansPerSecond: .12, detectionHalfAngleRadians: sewer ? Math.PI : ROOM_FIVE_DRONE_VIEW_HALF_ANGLE,
        detectionRangeMetres: sewer ? WEAK_SEWER_DRONE.attackRangeMetres : ROOM_FIVE_DRONE_VIEW_RANGE, warningSeconds: sewer ? WEAK_SEWER_DRONE.warningSeconds : .6,
        detectionAnchor: sewer ? undefined : new THREE.Vector3(),
        forwardAnchorMetres: sewer ? undefined : 1.4,
        fireIntervalSeconds: sewer ? WEAK_SEWER_DRONE.fireIntervalSeconds : .12, targetLossGraceSeconds: .1, cooldownSeconds: .5,
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
      if(models){
        const shell=drone.presentation.root.getObjectByName(`${drone.id}-tracking-head`)!;
        // The finale already owns this shell's flight orientation. Retain its
        // anchor on the existing aim pivot, avoiding a second rotation layer.
        shell.name=`${drone.id}-flying-shell`;
        this.flyers.push({body:shell,eye:drone.frontIndicator,authored:true});
      }else{
        const flyer = createRustedSewerDrone(false);
        batchMaintenanceScout(flyer.body, flyer.eye, surfaceMaps);
        flyer.body.scale.setScalar(.75);
        flyer.body.name = `${drone.id}-flying-shell`;
        drone.presentation.root.visible = false; drone.root.add(flyer.body);
        this.flyers.push({...flyer,authored:false});
      }
      // Network switches disable weapons; these patrols still hover in place.
      this.flightAudio.push(new WorldAudioSource({ root: drone.root, kind: 'drone', enabled: () => !this.cinematic }));
      // Saturated blue, with stronger opacity so it stays readable without whitening it.
      const beamColour = network === 'blue' ? 0x165dff : ROOM_FIVE_NETWORK_COLOURS[network];
      const search = new THREE.SpotLight(beamColour, 65, ROOM_FIVE_DRONE_VIEW_RANGE, ROOM_FIVE_DRONE_VIEW_HALF_ANGLE, .2, 2);
      search.name = `${drone.id}-search-light`; search.castShadow = true;
      search.shadow.mapSize.set(512, 512); search.shadow.bias = -.00015; search.shadow.normalBias = .012;
      search.shadow.camera.near = .35;
      room.root.add(search, search.target); this.searchLights.push(search);
      const volume = new ShadowedDroneBeam(search, ROOM_FIVE_DRONE_VIEW_RANGE, ROOM_FIVE_DRONE_VIEW_HALF_ANGLE,
        { colour: beamColour, opacity: network === 'blue' ? .09 : .075, soft: true, occlusionFallback: true });
      const beam = volume.mesh; beam.name = `room-5-${network}-scanner-${index}`;
      beam.position.copy(position); room.root.add(beam); this.beams.push(beam); this.beamVolumes.push(volume);
      return drone;
    };
    const drones = ROOM_FIVE_ROUTE_NETWORKS.map((network, index) => makePatrol(network, index));
    // Three increasingly elevated paired crossings before Volt's release lever.
    for (const index of [0, 2, 5]) drones.push(makePatrol(ROOM_FIVE_ROUTE_NETWORKS[(index + 1) % 3], index, true));
    this.drones = drones;
    this.scannerBeams = new ScannerBeamPresentation(world, this.beams.map((mesh, i) => ({
      mesh, ignoredCollider: drones[i].collider,
      enabled: () => drones[i].readModel.enabled && this.room.controller.security.isEnabled(this.networks[i]),
    })));
    this.brokenDrone = create('room-5-damaged-sewer-drone', SEWER_DRONE_POSITION.clone(), new THREE.Vector3(0, 0, -1), true);
    // The authored rusted shell is the visible, acid-targetable collider.
    this.brokenDrone.presentation.root.visible = false;
    this.brokenDrone.setCollisionEnabled(false);
    this.flightAudio.push(new WorldAudioSource({ root: room.brokenCore, kind: 'drone', enabled: () =>
      (room.controller.brokenDroneState === 'rebooting' || room.controller.brokenDroneState === 'active') && room.controller.brokenDroneHits < 3 }));
    this.unsubscribe = this.damage.events.on('died', ({ slimeId }) => { if (slimeId !== 'volt') requestDeath(slimeId); });
    // Encounter geometry is attached after room dressing. Preserve its explicit
    // exclusions and the platform hull/receiver split on this final assignment.
    const acidMaterials = new Set<THREE.Material>();
    room.root.traverse(object => {
      if (object instanceof THREE.Mesh && object.userData.textureRole === 'acid-floor') {
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) acidMaterials.add(material);
      }
    });
    applyCultivationShadowRoles(room.root, acidMaterials);
    this.reset();
  }
  update(dt: number): void {
    if (this.disposed || this.cinematic) return;
    this.damage.update(dt);
    this.sewerLighting.update(dt);
    this.platformBoosters.update(dt, this.targets[0].position);
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
      this.direction.copy(drone.readModel.scanDirection);
      if(!this.flyers[i].authored)this.flyers[i].body.quaternion.setFromUnitVectors(this.sewerForward, this.direction);
      this.flyers[i].eye.material.color.copy(drone.frontIndicator.material.color);
      const search = this.searchLights[i]; search.intensity = enabled ? 65 : 0;
      search.shadow.autoUpdate = enabled;
      search.shadow.needsUpdate = enabled || search.shadow.map === null;
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
    this.sewerMotion.update(dt, shell, this.room.controller.sewerDrone, SEWER_DRONE_POSITION, this.targets[1].position);
    this.updateSewerLightPosition();
    this.brokenDrone.root.position.copy(shell.position);
    this.brokenDrone.root.quaternion.copy(shell.quaternion);
    this.brokenDrone.setEnabled(sewerState === 'active');
    this.brokenDrone.update(dt, this.targets);
    if (this.room.controller.brokenDroneState === 'rebooting') {
      this.brokenDrone.frontIndicator.material.color.setHex(sewerDroneLampPower(this.room.controller.rebootElapsed) > .5 ? 0xffa13b : 0x202020);
    }
    this.room.sewer.eye.material.color.copy(this.brokenDrone.frontIndicator.material.color);
    if (sewerState === 'dormant') this.room.sewer.eye.material.color.setHex(0x080b07);
    this.projectiles.update(dt, this.projectileTargets);
  }
  /** Skins/effects only: the render scope never hides colliders or light owners. */
  get chamberPresentationRoots():readonly THREE.Object3D[]{
    return [...this.drones.map(drone=>drone.presentation.root),...this.flyers.filter(flyer=>!flyer.authored).map(flyer=>flyer.body),
      ...this.beams,this.platformBoosters.root];
  }

  /** Cosmetic queries run once per presented frame, after room/camera selection. */
  updatePresentation(deltaSeconds: number, camera: THREE.Camera): void {
    if (this.disposed) return;
    let hero = -1, nearest = Infinity;
    for (let i = 0; this.contactHardening && i < this.searchLights.length; i++) {
      const light = this.searchLights[i];
      const distance = light.getWorldPosition(this.lampPosition).distanceToSquared(camera.position);
      if (light.intensity > 0 && distance < nearest) { nearest = distance; hero = i; }
    }
    for (let i = 0; i < this.drones.length; i++) {
      const drone = this.drones[i], beam = this.beams[i];
      this.searchLights[i].shadow.radius = i === hero ? -ROOM_FIVE_DRONE_VIEW_RANGE : 1.25;
      drone.presentation.updateDetail(camera);
      beam.position.copy(drone.root.position).addScaledVector(drone.readModel.scanDirection, 1.4);
      this.direction.copy(drone.readModel.scanDirection).negate();
      beam.quaternion.setFromUnitVectors(this.up, this.direction);
    }
    this.scannerBeams.update(deltaSeconds, camera);
  }
  setLightingQuality(settings: GraphicsSettings, type: THREE.ShadowMapType): void {
    this.contactHardening = type === THREE.BasicShadowMap;
    for (let i = 0; i < this.beamVolumes.length; i++) {
      const volume = this.beamVolumes[i]; volume.setShadowType(type);
      const base = this.networks[i] === 'blue' ? .09 : .075;
      volume.mesh.material.uniforms.beamOpacity.value = base * (.7 + .3 * settings.effectsDensity);
    }
  }
  private updateSewerLightPosition(): void {
    const shell = this.room.brokenCore;
    this.sewerLight.position.set(0, .2, -1.4).multiply(shell.scale)
      .applyQuaternion(shell.quaternion).add(shell.position);
  }
  beginCinematic(): void {
    this.cinematic = true; this.projectiles.reset(); this.presentation.mesh.visible = false;
    for (const drone of this.drones) drone.setEnabled(false);
    for (const beam of this.beams) beam.visible = false;
    for (const light of this.searchLights) light.intensity = 0;
  }
  endCinematic(): void { this.cinematic = false; }
  reset(): void {
    this.cinematic = false;
    this.damage.reset(); this.projectiles.reset(); this.presentation.reset();
    this.scannerBeams.reset();
    for (const search of this.searchLights) {
      search.intensity = 0; search.shadow.autoUpdate = false;
      // Zero-intensity lights retain live PCF sampler slots. Allocate their
      // first map even if a teleport draws the room before its next fixed step.
      search.shadow.needsUpdate = search.shadow.map === null;
    }
    for (let i = 0; i < this.drones.length; i++) {
      this.patrols[i].reset(); this.drones[i].reset();
      this.drones[i].setPresentationVisible(this.authoredModels);
      this.drones[i].root.position.copy(this.patrols[i].position);
      this.drones[i].setPatrolDirection(this.patrols[i].direction);
    }
    this.brokenDrone.reset(); this.brokenDrone.setEnabled(false);
    // SecurityDrone.reset restores its stock model and box. This adapter owns
    // a separate authored shell/acid target, including its destruction lifetime.
    this.brokenDrone.setPresentationVisible(false);
    this.brokenDrone.setCollisionEnabled(false);
    this.sewerMotion.reset();
    this.sewerLighting.reset();
    this.platformBoosters.reset();
    this.room.brokenCore.position.copy(SEWER_DRONE_POSITION);
    this.room.brokenCore.rotation.set(.2, 0, 1.1);
    this.updateSewerLightPosition();
    this.sewerDamage.reset(this.room.controller.brokenDroneHits);
    this.sewerLight.intensity = 0;
    this.room.sewer.eye.material.color.setHex(0x080b07);
  }
  dispose(): void {
    for (const source of this.flightAudio) source.dispose();
    if (this.disposed) return; this.disposed = true;
    this.unsubscribe();
    for (const drone of this.drones) drone.dispose();
    this.brokenDrone.dispose(); this.presentation.dispose(); this.projectiles.dispose(); this.damage.dispose(); this.resources.dispose();
    this.sewerDamage.dispose();
    this.sewerLighting.dispose();
    this.platformBoosters.dispose();
    this.sewerLight.removeFromParent(); disposeShadowLight(this.sewerLight);
    for (const light of this.searchLights) { light.target.removeFromParent(); light.removeFromParent(); disposeShadowLight(light); }
    for (const flyer of this.flyers) {
      if(flyer.authored)continue;
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
