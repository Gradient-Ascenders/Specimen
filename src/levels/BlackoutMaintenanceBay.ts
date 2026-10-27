import type { BlackoutMaintenanceMapData } from '../render/environment/blackout/BlackoutMaintenanceMapData.ts';
import * as THREE from 'three';
import { AcidSurfaceMaterial } from '../render/environment/containment/AcidSurfaceMaterial.ts';
import { AcidLiquidInteractions } from '../render/environment/containment/AcidLiquidInteractions.ts';
import { disposeShadowLight } from '../render/ShadowLightResources.ts';
import { consolidateStaticRoomVisuals } from '../render/StaticRoomVisuals.ts';
import type { ContainmentStaticBatchResult } from '../render/environment/containment/ContainmentStaticBatching.ts';
import { BlackoutMaintenanceMaterials, type BlackoutMaterialFamily } from '../render/environment/blackout/BlackoutMaintenanceMaterials.ts';
import { mapBlackoutBoxUVs } from '../render/environment/blackout/BlackoutMaintenanceUVs.ts';
import {buildBlackoutEntryVent} from '../render/environment/blackout/BlackoutEntryVent.ts';
import {BlackoutEntryVentCollapse} from '../render/environment/blackout/BlackoutEntryVentCollapse.ts';
import {BLACKOUT_ENTRY_VENT as ENTRY} from '../cinematics/BlackoutVentArrivalLayout.ts';
import { repairStaticBoxSurfaces, trimStaticBoxEnds } from '../render/geometry/CoplanarSurfaceGeometry.ts';
import {BlackoutMaintenanceArt, type BlackoutMaintenanceArtLoader} from '../render/environment/blackout/BlackoutMaintenanceArt.ts';
import {BlackoutConnectorAtmosphere} from '../render/environment/blackout/BlackoutConnectorAtmosphere.ts';
import type {AudioPosition} from '../audio/GameplayAudioEvents.ts';

export const BLACKOUT_BAY_LAYOUT = Object.freeze({
  chamberWidth: 34,
  rearZ: 54,
  hallwayWidth: 6,
  hallwayHeight: 4.5,
  hallwayLength: 26,
  hallwayEndZ: 80,
  acidStartZ: 7,
  acidEndZ: 48,
});

/** Geometry and spatial markers for Level 3's first maintenance bay. */
export class BlackoutMaintenanceBay {
  readonly root = new THREE.Group();
  readonly collisionMeshes: THREE.Mesh[] = [];
  readonly acidInteractions: AcidLiquidInteractions;
  readonly entryVentCollapse:BlackoutEntryVentCollapse;

  private readonly acidMaterial: AcidSurfaceMaterial;
  private readonly arcPositions = new Float32Array(3 * 8 * 2 * 3);
  private readonly arcGeometry = new THREE.BufferGeometry();
  private readonly arcMaterial = new THREE.LineBasicMaterial({color:0xafffff,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false});
  private readonly arcLights: THREE.PointLight[] = [];
  private readonly hallwayLights: THREE.SpotLight[] = [];
  private readonly hallwayBulbs: THREE.Mesh[] = [];
  private readonly connectorAtmosphere=new BlackoutConnectorAtmosphere();
  private elapsed = 0;
  private staticVisuals: ContainmentStaticBatchResult;
  private readonly staticSources: readonly THREE.Mesh[];
  readonly art: BlackoutMaintenanceArt;
  /** Runtime disposes borrowing door/controller/drone before this owning bay. */
  readonly surfaceMaterials: BlackoutMaintenanceMaterials;
  private readonly replacedMaterials = new Set<THREE.Material>();
  private disposed = false;

  get hallwayShadowLights(): readonly THREE.SpotLight[] {
    return this.hallwayLights;
  }

  constructor(mapData: BlackoutMaintenanceMapData) {
    this.surfaceMaterials = new BlackoutMaintenanceMaterials(mapData);
    this.root.name = 'level-3-room-1-blackout-maintenance-bay';
    const steel = new THREE.MeshStandardMaterial({ color: 0x20272b, roughness: 0.93, metalness: 0.48 });
    const darkSteel = new THREE.MeshStandardMaterial({ color: 0x11171b, roughness: 0.96, metalness: 0.3 });
    const platform = new THREE.MeshStandardMaterial({ color: 0x343a36, roughness: 0.9, metalness: 0.3 });
    const submergedSteel = new THREE.MeshStandardMaterial({color:0x30391c,roughness:.55,metalness:.18});
    const warning = new THREE.MeshStandardMaterial({ color: 0x8b6b21, roughness: 0.85, metalness: 0.18 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x515956, roughness: 0.72, metalness: 0.58 });
    this.acidMaterial = new AcidSurfaceMaterial();

    const { chamberWidth, rearZ, hallwayWidth, hallwayLength, acidStartZ, acidEndZ } = BLACKOUT_BAY_LAYOUT;
    const halfWidth = chamberWidth / 2;
    const hallwayEndCenter = rearZ + hallwayLength / 2;
    const hallwayCenterX = 6;
    const hallwayHeight = BLACKOUT_BAY_LAYOUT.hallwayHeight;
    // Main chamber bounds: x +/-17, z -2..54, y 0..12. The broad basin is
    // sealed beneath the entrance apron as well as under the stepping route.
    this.box('entry-safe-platform', [chamberWidth, 1.05, 11], [0, -0.525, 3.5], platform);
    // A real open wall vent replaces the old decorative ceiling grille.
    const shoulder=halfWidth-ENTRY.halfWidth;
    this.box('front-perimeter-wall', [shoulder,12,.45],[-ENTRY.halfWidth-shoulder/2,6,-2],darkSteel);
    this.box('front-perimeter-wall-east', [shoulder,12,.45],[ENTRY.halfWidth+shoulder/2,6,-2],darkSteel);
    this.box('entry-vent-wall-below',[ENTRY.halfWidth*2,ENTRY.floorY,.45],[0,ENTRY.floorY/2,-2],darkSteel);
    const upper=12-ENTRY.floorY-ENTRY.height;
    this.box('entry-vent-wall-above',[ENTRY.halfWidth*2,upper,.45],[0,12-upper/2,-2],darkSteel);
    const entryVentDetails=buildBlackoutEntryVent(this.root,this.collisionMeshes,this.surfaceMaterials);
    this.box('acid-basin-bed', [chamberWidth - 0.8, 0.5, acidEndZ - acidStartZ], [0, -1.25, (acidEndZ + acidStartZ) / 2], darkSteel);
    const acid = this.box('animated-acid-surface', [chamberWidth - 1, 0.08, acidEndZ - acidStartZ - 0.2], [0, -0.99, (acidEndZ + acidStartZ) / 2], this.acidMaterial);
    acid.userData.textureRole = 'acid-floor';
    // Close the exposed under-apron corners, but leave a clear 5 m doorway
    // aligned to Bob's first step so this seal does not become a jump wall.
    this.box('entry-apron-riser-west', [8.2, 1, 0.25], [-12.6, -0.5, acidStartZ], darkSteel);
    this.box('entry-apron-riser-east', [18, 1, 0.25], [5.5, -0.5, acidStartZ], darkSteel);

    // Three broad, staggered steps borrow Level 2 Room 1's alternating layout,
    // but extend the centre spacing to 11.5 m for this wider acid basin.
    const steps: readonly [number, number, number, number, number][] = [
      [-3, 0.15, 17, 5, 7],
      [1.5, 0.45, 28.5, 5, 7],
      [-2.5, 0.15, 40, 5, 7],
    ];
    for (const [x, y, z, width, depth] of steps) {
      // Keep the tested jump heights, but extend each solid foundation into
      // the basin bed so there is no air gap beneath the stepping blocks.
      const bottom = -1.05;
      this.box(`bob-route-platform-${z}`, [width, y - bottom, depth], [x, (y + bottom) / 2, z], submergedSteel);
    }

    // The exit bank begins after the last long jump. A wide side ramp lets Goop
    // walk out of the expanded basin without jumping.
    this.box('exit-safe-platform', [chamberWidth, 1.05, 6], [0, -0.525, 51], platform).userData.preciseMovementCorners = true;
    const rampLength = Math.hypot(5.5, 1);
    const ramp = this.box('acid-exit-ramp', [7, 0.18, rampLength], [12.4, -0.59, 45.25], platform);
    ramp.rotation.x = -Math.atan2(1, 5.5);
    ramp.userData.preciseMovementCorners = true;

    // Main chamber walls and ceiling silhouette. Bob and Goop leave through
    // the broad doorway at x=6; Volt uses the separate low side duct at x=-6.
    this.box('west-perimeter-wall', [0.4, 14, rearZ + 2], [-halfWidth + 0.2, 5, (rearZ - 2) / 2], darkSteel);
    this.box('east-perimeter-wall', [0.4, 14, rearZ + 2], [halfWidth - 0.2, 5, (rearZ - 2) / 2], darkSteel);
    // Deliberately separate the main doorway (x=3..9) from Volt's vent
    // (x=-6.75..-5.25); no shared cross-hall connects the two routes.
    this.box('rear-wall-west', [10.05, 12, 0.45], [-11.775, 6, rearZ], darkSteel);
    this.box('rear-wall-between-openings', [8.25, 12, 0.45], [-1.125, 6, rearZ], darkSteel);
    this.box('rear-wall-east', [7.8, 12, 0.45], [12.9, 6, rearZ], darkSteel);
    this.box('door-header', [6, 7.5, 0.45], [6, 8.25, rearZ], darkSteel);
    // Taller service duct with a flush landing. Its 1.5 m clear width admits
    // Volt comfortably but still excludes the 1.65 m maintenance drone.
    this.box('vent-mouth-left-jamb', [0.2, 12, 0.45], [-6.85, 6, rearZ], steel);
    this.box('vent-mouth-right-jamb', [0.2, 12, 0.45], [-5.15, 6, rearZ], steel);
    this.box('vent-mouth-upper-wall', [1.5, 9.8, 0.45], [-6, 7.1, rearZ], darkSteel);
    this.box('main-ceiling', [chamberWidth, 0.35, rearZ + 2], [0, 12.15, (rearZ - 2) / 2], darkSteel);

    // Main route: keep the existing first 20 m of corridor, then add a broad
    // shallow ramp to Room 2's raised entry deck. It stays centered on x=6.
    this.box('hallway-floor', [hallwayWidth, 0.4, 20], [hallwayCenterX, -0.2, rearZ + 10], platform);
    // Finish a few centimetres above the raised entry deck: the playable
    // spheres otherwise catch on its vertical leading edge at the exact seam.
    const hallwayRampRise = 0.45;
    const hallwayRampAngle = Math.atan2(hallwayRampRise, 6);
    const hallwayRamp = this.box('hallway-ramp', [hallwayWidth, 0.18, 6], [hallwayCenterX, hallwayRampRise / 2 - 0.09 / Math.cos(hallwayRampAngle), 77], platform);
    hallwayRamp.rotation.x = -hallwayRampAngle;
    hallwayRamp.userData.preciseMovementCorners = true;
    this.box('hallway-west-wall', [0.35, hallwayHeight, hallwayLength], [hallwayCenterX - hallwayWidth / 2, hallwayHeight / 2, hallwayEndCenter], darkSteel);
    this.box('hallway-east-wall', [0.35, hallwayHeight, hallwayLength], [hallwayCenterX + hallwayWidth / 2, hallwayHeight / 2, hallwayEndCenter], darkSteel);
    this.box('hallway-roof', [hallwayWidth, 0.35, hallwayLength], [hallwayCenterX, hallwayHeight + 0.15, hallwayEndCenter], darkSteel);

    // Volt's route initially leaves the bay through the old straight vent,
    // turns west in an enclosed service chamber, then climbs to the far-west
    // side catwalk. The vent and main hallway remain physically separated.
    this.box('vent-interior-floor', [1.5, 0.2, 6], [-6, -0.1, rearZ + 3], steel).userData.preciseMovementCorners = true;
    this.box('vent-duct-west-wall', [0.2, 2.2, 6], [-6.85, 1.1, rearZ + 3], steel);
    this.box('vent-duct-east-wall', [0.2, 2.2, 6], [-5.15, 1.1, rearZ + 3], steel);
    this.box('vent-duct-ceiling', [1.5, 0.2, 6], [-6, 2.3, rearZ + 3], steel);
    // Turn chamber bounds x[-16.75,-5.25], z[60,63]. Portal positions line
    // up exactly with the northbound inlet and westbound ascending shaft.
    this.box('vent-turn-floor', [11.5, 0.2, 3], [-11, -0.1, 61.5], steel);
    this.box('vent-turn-ceiling', [11.5, 0.2, 3], [-11, 2.3, 61.5], darkSteel);
    // Put wall thickness outside the authored clear turn chamber. Centring it
    // on the boundaries formerly left 15 cm ledges at both duct openings.
    this.box('vent-turn-south-west', [10, 2.2, 0.3], [-11.75, 1.1, 59.85], darkSteel);
    this.box('vent-turn-north-east', [10, 2.2, 0.3], [-10.25, 1.1, 63.15], darkSteel);
    this.box('vent-turn-east-wall', [0.3, 2.2, 3], [-5.1, 1.1, 61.5], darkSteel);
    this.box('vent-turn-west-wall', [0.3, 2.2, 3], [-16.9, 1.1, 61.5], darkSteel);
    // The last few centimetres rise above the catwalk lip so Volt's sphere
    // clears the deck's vertical edge instead of snagging on a coplanar seam.
    const ductRise = 2.58;
    const ductLength = Math.hypot(17, ductRise);
    const ductAngle = Math.atan2(ductRise, 17);
    const ductCenterZ = 71.5;
    const ductFloor = this.box('volt-rising-duct-floor', [1.5, 0.2, ductLength], [-16, ductRise / 2 - 0.1 / Math.cos(ductAngle), ductCenterZ], steel);
    ductFloor.rotation.x = -ductAngle;
    ductFloor.userData.preciseMovementCorners = true;
    trimStaticBoxEnds(ductFloor, 63, 80);
    const ductCeiling = this.box('volt-rising-duct-ceiling', [1.5, 0.2, ductLength], [-16, ductRise / 2 + 2.3, ductCenterZ], darkSteel);
    ductCeiling.rotation.x = -ductAngle;
    trimStaticBoxEnds(ductCeiling, 63, 79.75);
    for (const sideX of [-16.85, -15.15]) {
      const sideWall = this.box(`volt-rising-duct-side-${sideX}`, [0.2, 2.2, ductLength], [sideX, ductRise / 2 + 1.1, ductCenterZ], steel);
      sideWall.rotation.x = -ductAngle;
      // The tilted end face stops short at floor level. Extend only its render
      // skin far enough to cut a complete vertical join; retain the collider.
      sideWall.geometry.computeBoundingBox();
      const collisionBounds = sideWall.geometry.boundingBox!.clone();
      sideWall.geometry.scale(1, 1, (ductLength + 2.2 * Math.tan(ductAngle) + .002) / ductLength);
      sideWall.geometry.boundingBox = collisionBounds;
      trimStaticBoxEnds(sideWall, 63, 79.75);
    }
    // Short level outlet apron joins the rising shaft to Volt's separate
    // service catwalk (top 2.5 m) at the west side of Room 2.
    this.box('volt-catwalk-entry-extension', [2.8, 0.2, 6], [-16, 2.4, 83], steel);
    // Recessed industrial rim and repeated duct seams, outside the walking bore.
    for (const z of [rearZ - 0.25, rearZ + 1.5, rearZ + 3.5, rearZ + 5.5]) {
      const flushZ = z === rearZ - .25 ? rearZ - .185 : z;
      for (const x of [-6.77, -5.23]) this.box(`vent-frame-side-${x}-${z}`, [0.08, 2.3, 0.08], [x < -6 ? -6.79 : -5.21, 1.1, flushZ], trim);
      this.box(`vent-frame-header-${z}`, [1.62, 0.08, 0.08], [-6, 2.28, flushZ], trim);
    }

    // Visible but non-emissive hazard markings, conduit, and the ceiling entry grille.
    for (const z of [-1.5, acidStartZ - 0.7]) this.warningStrip(`entry-warning-${z}`, chamberWidth - 2, [0, -.0125, z], warning);
    for (const z of [acidEndZ + 0.4, rearZ - 1.2]) this.warningStrip(`exit-warning-${z}`, chamberWidth - 2, [0, -.0125, z], warning);

    this.arcGeometry.setAttribute('position',new THREE.BufferAttribute(this.arcPositions,3));
    const arcs=new THREE.LineSegments(this.arcGeometry,this.arcMaterial);
    arcs.name='vent-live-electrical-arcs';arcs.frustumCulled=false;this.root.add(arcs);
    const sparks=new THREE.Points(this.arcGeometry,new THREE.PointsMaterial({color:0xe5ffff,size:.035,transparent:true,opacity:.65,blending:THREE.AdditiveBlending,depthWrite:false}));
    sparks.name='vent-electrical-sparks';sparks.frustumCulled=false;this.root.add(sparks);
    const arcLight=new THREE.PointLight(0x76eaff,.5,3);
    arcLight.position.set(-6,1.1,rearZ-.4);this.root.add(arcLight);this.arcLights.push(arcLight);

    for (const [index, z] of [rearZ + 2.5, rearZ + 8, rearZ + 14, rearZ + 20].entries()) {
      const bulbMaterial = new THREE.MeshStandardMaterial({ color: 0x886d38, emissive: 0xf2be58, emissiveIntensity: 0.22 });
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.1, 1.1), bulbMaterial);
      bulb.name = `hallway-flicker-bulb-${index + 1}`;
      bulb.position.set(hallwayCenterX, hallwayHeight - 0.3, z);
      this.root.add(bulb);
      this.hallwayBulbs.push(bulb);
      const light = new THREE.SpotLight(0xffcf70, 8, 8.2, .95, .45, 2);
      light.name = `hallway-flicker-light-${index + 1}`;
      light.position.set(hallwayCenterX, hallwayHeight - 0.8, z);
      light.target.position.set(hallwayCenterX, 0, z);
      if(index===1)light.target.position.set(4.6,1.0,z+1);
      if(index===3)light.target.position.set(7,.4,z+2);
      light.castShadow = true;
      light.shadow.mapSize.set(256, 256);
      light.shadow.camera.near = .15;
      light.shadow.bias = -.0001;
      light.shadow.normalBias = .015;
      light.shadow.radius = 1.5;
      this.root.add(light, light.target);
      this.hallwayLights.push(light);
    }
    this.applySurfaceMaterials();
    repairStaticBoxSurfaces(this.root, mesh => /^(vent-|volt-|rear-wall-|entry-|exit-safe-platform|exit-warning-)/.test(mesh.name));
    this.root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const solid = materials.some(material => material instanceof THREE.MeshStandardMaterial &&
        material.visible && !material.transparent && material !== this.acidMaterial);
      object.castShadow = solid && !object.name.startsWith('hallway-flicker-bulb-');
      object.receiveShadow = solid;
    });
    this.staticSources = [...this.collisionMeshes.filter(mesh => mesh.material !== this.acidMaterial),...entryVentDetails];
    this.staticVisuals = consolidateStaticRoomVisuals(this.root, this.staticSources);
    this.art = new BlackoutMaintenanceArt(this.surfaceMaterials);
    // Keep the moving debris out of the bay's immutable visual batches. Only
    // its separate fixed blocker joins the normal static collision registry.
    this.entryVentCollapse=new BlackoutEntryVentCollapse(this.root,this.surfaceMaterials);
    this.collisionMeshes.push(this.entryVentCollapse.collisionMesh);
    this.acidInteractions = new AcidLiquidInteractions(this.acidMaterial, acid, 3);
  }

  acidAt(position: Readonly<{ readonly x: number; readonly y: number; readonly z: number }>): boolean {
    return position.x >= -16.6 && position.x <= 16.6 && position.z >= BLACKOUT_BAY_LAYOUT.acidStartZ && position.z <= BLACKOUT_BAY_LAYOUT.acidEndZ && position.y <= -0.35;
  }

  ventAt(position: Readonly<{ readonly x: number; readonly y: number; readonly z: number }>): boolean {
    return Math.abs(position.x + 6) <= 0.75 && position.z >= BLACKOUT_BAY_LAYOUT.rearZ - 0.5 && position.z <= BLACKOUT_BAY_LAYOUT.rearZ + 6 && position.y >= 0 && position.y <= 2.2;
  }

  vestibuleAt(position: Readonly<{ readonly x: number; readonly y: number; readonly z: number }>): boolean {
    return position.x >= 3.4 && position.x <= 8.6 && position.z >= BLACKOUT_BAY_LAYOUT.rearZ + 1 && position.z <= BLACKOUT_BAY_LAYOUT.hallwayEndZ - 0.5 && position.y >= 0 && position.y <= BLACKOUT_BAY_LAYOUT.hallwayHeight;
  }

  transitAt(position: Readonly<{ readonly x: number; readonly y: number; readonly z: number }>): boolean {
    return position.x >= -22 && position.x <= 22 && position.z >= BLACKOUT_BAY_LAYOUT.hallwayEndZ && position.z <= 156 && position.y >= -1 && position.y <= 22;
  }

  voltExitAt(position: Readonly<{ readonly x: number; readonly y: number; readonly z: number }>): boolean {
    // Volt exits through the far-west side duct onto his elevated catwalk.
    // Once in Room 2, the broader room trigger keeps route completion latched;
    // the main Bob/Goop corridor is never treated as Volt's vent exit.
    return (position.x >= -17.4 && position.x <= -14.6 && position.z >= 79 && position.z <= 87 && position.y >= 2 && position.y <= 5) || this.transitAt(position);
  }

  update(dt: number, powered: boolean,listener?:AudioPosition): void {
    this.elapsed += Math.max(0, dt);
    this.art.update(dt, powered);
    this.connectorAtmosphere.update(dt,listener);
    this.advanceAcid(Math.max(0, dt));
    // Fixed buffers: three jagged discharges bridge the vent's grounded edges.
    // Endpoints stay attached to its metal rim while interior nodes crackle.
    const phase=Math.floor(this.elapsed*24);
    for(let strand=0;strand<3;strand++) for(let segment=0;segment<8;segment++) for(let end=0;end<2;end++) {
      const node=segment+end,t=node/8;
      const jitter=Math.sin(node*17.1+phase*4.7+strand*2.3)*Math.sin(Math.PI*t)*.14;
      const offset=(strand*16+segment*2+end)*3;
      this.arcPositions[offset]=-6-.73+t*1.46;
      this.arcPositions[offset+1]=.45+strand*.65+jitter;
      this.arcPositions[offset+2]=BLACKOUT_BAY_LAYOUT.rearZ-.28+Math.sin(node*9.3+phase)*Math.sin(Math.PI*t)*.035;
    }
    this.arcGeometry.attributes.position!.needsUpdate=true;
    this.arcMaterial.opacity=.2+.7*Math.abs(Math.sin(this.elapsed*19));
    this.arcLights.forEach((light, index) => {
      light.intensity = (powered ? .35 : .2) + this.arcMaterial.opacity * (index === 0 ? 1.4 : .5);
    });
    this.hallwayLights.forEach((light, index) => {
      light.intensity=this.connectorAtmosphere.lightIntensity(index);
      const material = this.hallwayBulbs[index]?.material;
      if (material instanceof THREE.MeshStandardMaterial) {
        material.emissiveIntensity = .015+light.intensity*.12;
      }
    });
  }

  resetConnector():void {this.connectorAtmosphere.reset();this.art.resetConnector();}

  /** Continue the visible liquid during a death, without advancing machinery. */
  advanceAcid(deltaSeconds: number): void {
    this.acidMaterial.update(deltaSeconds);
  }

  /** Replace visible coverage before shader preparation; physics keeps the
   * original registered meshes and their surface/interaction metadata. */
  prepareArt(door: THREE.Mesh, loader?: BlackoutMaintenanceArtLoader): Promise<void> {
    return this.art.prepare(this.root, door, () => this.staticVisuals.dispose(),
      () => { this.staticVisuals = consolidateStaticRoomVisuals(this.root, this.staticSources); }, loader);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.acidInteractions.reset();
    this.entryVentCollapse.dispose();
    this.staticVisuals.dispose();
    this.art.dispose();
    this.root.removeFromParent();
    const geometries=new Set<THREE.BufferGeometry>();
    const materials=new Set<THREE.Material>(this.replacedMaterials);
    this.root.traverse((object) => {
      if (object instanceof THREE.Light) disposeShadowLight(object);
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    });
    for(const geometry of geometries)geometry.dispose();
    for(const material of materials)if(!this.surfaceMaterials.owns(material))material.dispose();
    this.root.clear();
    this.surfaceMaterials.dispose();
    this.replacedMaterials.clear();
  }

  /** Explicit presentation bindings; material/name never supplies gameplay meaning. */
  private applySurfaceMaterials(): void {
    const surfaces: Record<string, BlackoutMaterialFamily> = {
      'front-perimeter-wall': 'wallPanel',
      'front-perimeter-wall-east':'wallPanel',
      'entry-vent-wall-below':'wallPanel',
      'entry-vent-wall-above':'wallPanel',
      'west-perimeter-wall': 'wallPanel',
      'east-perimeter-wall': 'wallPanel',
      'rear-wall-west': 'wallPanel',
      'rear-wall-between-openings': 'wallPanel',
      'rear-wall-east': 'wallPanel',
      'door-header': 'wallPanel',
      'vent-mouth-upper-wall': 'wallPanel',
      'main-ceiling': 'ceilingPanel',
      'entry-safe-platform': 'floorDeck',
      'exit-safe-platform': 'floorDeck',
      'acid-exit-ramp': 'floorDeck',
      'bob-route-platform-17': 'acidPlatform',
      'bob-route-platform-28.5': 'acidPlatform',
      'bob-route-platform-40': 'acidPlatform',
      'acid-basin-bed': 'basinMetal',
      'entry-apron-riser-west': 'basinMetal',
      'entry-apron-riser-east': 'basinMetal',
      'entry-warning--1.5': 'warningPaint',
      'entry-warning-6.3': 'warningPaint',
      'exit-warning-48.4': 'warningPaint',
      'exit-warning-52.8': 'warningPaint',
      'hallway-floor': 'floorDeck',
      'hallway-ramp': 'floorDeck',
      'hallway-west-wall': 'wallPanel',
      'hallway-east-wall': 'wallPanel',
      'hallway-roof': 'ceilingPanel',
      'vent-mouth-left-jamb': 'machineryMetal',
      'vent-mouth-right-jamb': 'machineryMetal',
      'vent-interior-floor': 'ductSteel',
      'vent-duct-west-wall': 'ductSteel',
      'vent-duct-east-wall': 'ductSteel',
      'vent-duct-ceiling': 'ductSteel',
      'vent-turn-floor': 'ductSteel',
      'vent-turn-ceiling': 'ductSteel',
      'vent-turn-south-west': 'ductSteel',
      'vent-turn-north-east': 'ductSteel',
      'vent-turn-east-wall': 'ductSteel',
      'vent-turn-west-wall': 'ductSteel',
      'volt-rising-duct-floor': 'ductSteel',
      'volt-rising-duct-ceiling': 'ductSteel',
      'volt-rising-duct-side--16.85': 'ductSteel',
      'volt-rising-duct-side--15.15': 'ductSteel',
      'volt-catwalk-entry-extension': 'floorDeck',
    };
    for (const z of [BLACKOUT_BAY_LAYOUT.rearZ - .25, 55.5, 57.5, 59.5]) {
      for (const x of [-6.77, -5.23]) surfaces[`vent-frame-side-${x}-${z}`] = 'machineryMetal';
      surfaces[`vent-frame-header-${z}`] = 'machineryMetal';
    }
    for (const [name, family] of Object.entries(surfaces)) {
      const mesh = this.root.getObjectByName(name) as THREE.Mesh;
      for (const original of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) this.replacedMaterials.add(original);
      const material = this.surfaceMaterials.get(family);
      mesh.updateMatrix();
      // Each box already owns unique geometry; replace only its UV attribute.
      mapBlackoutBoxUVs(mesh.geometry, mesh.matrix, material.userData.tileSizeMetres);
      mesh.material = material;
      // Enclosing opaque ducts reject hidden fragment work before later materials.
      // Batching preserves renderOrder; depth/shadows and collider data are unchanged.
      if (family === 'ductSteel') mesh.renderOrder = -1;
    }
  }

  private box(name: string, size: readonly [number, number, number], position: readonly [number, number, number], material: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.userData.surfaceTag = 'default';
    mesh.userData.authoringRole = 'blackout-maintenance-bay-collision';
    this.root.add(mesh);
    this.collisionMeshes.push(mesh);
    return mesh;
  }

  private warningStrip(name: string, width: number, position: readonly [number, number, number], material: THREE.Material): void {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.025, 0.18), material);
    mesh.name = name;
    mesh.position.set(...position);
    this.root.add(mesh);
  }
}
