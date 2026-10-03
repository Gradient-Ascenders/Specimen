import * as THREE from 'three';
import { consolidateStaticRoomVisuals } from '../render/StaticRoomVisuals.ts';
import type { ContainmentStaticBatchResult } from '../render/environment/containment/ContainmentStaticBatching.ts';

import type { BlackoutCheckpointDefinition } from './BlackoutCheckpointManager.ts';

export const BLACKOUT_TRANSIT_LAYOUT = Object.freeze({
  minX: -22,
  maxX: 22,
  entryZ: 80,
  exitZ: 156,
  ceilingY: 22,
  acidStartZ: 80,
  acidEndZ: 156,
  acidSurfaceY: -0.98,
  entryDeckTopY: 0.4,
  voltCatwalkX: -16,
  voltCatwalkTopY: 2.5,
  bobRouteX: 10,
});

/** Continuous, sealed handoff between the transit exit and boss staging. */
export const BLACKOUT_TRANSIT_EXIT_HALLWAY = Object.freeze({
  startZ: BLACKOUT_TRANSIT_LAYOUT.exitZ,
  endZ: 174,
  width: 8,
  floorTopY: 0.4,
  ceilingY: 5.8,
  doorBottomY: 3.1,
});

export interface BlackoutTransitLiftSlot {
  readonly id: 'transit-lift-a' | 'transit-lift-b';
  /** Centre of the platform footprint at its authored resting height. */
  readonly position: THREE.Vector3;
  readonly size: THREE.Vector3;
  readonly minY: number;
  readonly maxY: number;
}

export const BLACKOUT_TRANSIT_LIFT_SLOTS: readonly BlackoutTransitLiftSlot[] = [
  {
    id: 'transit-lift-a',
    position: new THREE.Vector3(10, 1.2, 110),
    size: new THREE.Vector3(4.8, 0.5, 4),
    minY: 1.2,
    maxY: 4.0,
  },
  {
    id: 'transit-lift-b',
    position: new THREE.Vector3(10, 4.4, 134),
    size: new THREE.Vector3(4.8, 0.5, 4),
    minY: 4.4,
    maxY: 7.4,
  },
];

const makeSpawnSet = (
  bob: readonly [number, number, number],
  goop: readonly [number, number, number],
  volt: readonly [number, number, number],
) => ({
  bob: new THREE.Vector3(...bob),
  goop: new THREE.Vector3(...goop),
  volt: new THREE.Vector3(...volt),
});

/** Room-local checkpoints on permanent, non-moving surfaces only. */
export const BLACKOUT_TRANSIT_CHECKPOINTS: readonly BlackoutCheckpointDefinition[] = [
  {
    id: 'cp3',
    bodyPositions: makeSpawnSet([6, 0.86, 84], [8, 0.86, 84], [-16, 2.96, 86]),
    activeSlimeId: 'bob',
    room: { roomId: 'room-2', phase: 'three-slime', local: {} },
  },
  {
    id: 'cp4',
    bodyPositions: makeSpawnSet([10, 1.66, 102], [17, -0.52, 106], [-16, 2.96, 108]),
    activeSlimeId: 'bob',
    room: { roomId: 'room-2', phase: 'three-slime', local: { transitStage: 1 } },
  },
  {
    id: 'cp5',
    bodyPositions: makeSpawnSet([10, 8.06, 142.5], [10, -0.52, 139], [-16, 2.96, 132]),
    activeSlimeId: 'bob',
    room: { roomId: 'room-2', phase: 'three-slime', local: { transitStage: 2 } },
  },
];

type TransitPosition = Readonly<{ x: number; y: number; z: number }>;
type BoxSize = readonly [number, number, number];
type BoxPosition = readonly [number, number, number];

/**
 * Large, dark, three-route transit chamber. This class owns static room
 * geometry and spatial anchors; moving machinery, drones and puzzle state are
 * composed by BlackoutTransitRoomController.
 */
export class BlackoutTransitRoom {
  readonly root = new THREE.Group();
  readonly collisionMeshes: THREE.Mesh[] = [];
  readonly bobRoutePlatforms: THREE.Mesh[] = [];
  readonly stickyWalls: THREE.Mesh[] = [];
  readonly liftSlots = BLACKOUT_TRANSIT_LIFT_SLOTS.map((slot) => ({
    ...slot,
    position: slot.position.clone(),
    size: slot.size.clone(),
  }));
  readonly receiverPositions = [
    new THREE.Vector3(14, 8.4, 96),
    new THREE.Vector3(14, 12.1, 120),
    new THREE.Vector3(-4, 8.9, 139),
  ] as const;
  readonly switchPosition = new THREE.Vector3(7.12, 8.55, 142.5);
  readonly switchBodyPosition = new THREE.Vector3(7.4, 8.06, 142.5);
  readonly bridgeStart = new THREE.Vector3(-16, 2.9, 136);
  readonly bridgeEnd = new THREE.Vector3(0, 0.55, 144);
  readonly exitPosition = new THREE.Vector3(0, 0.86, 151);
  readonly switchButton: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  readonly catwalk: THREE.Mesh;
  get voltCatwalk(): THREE.Mesh { return this.catwalk; }
  readonly bobSwitchWall: THREE.Mesh;
  /** Existing shutter edge doubles as the far-side electrical contact. */
  readonly bridgeLockContact: THREE.Mesh;
  readonly acidBounds = Object.freeze({
    minX: BLACKOUT_TRANSIT_LAYOUT.minX,
    maxX: BLACKOUT_TRANSIT_LAYOUT.maxX,
    minZ: BLACKOUT_TRANSIT_LAYOUT.acidStartZ,
    maxZ: BLACKOUT_TRANSIT_LAYOUT.acidEndZ,
    surfaceY: BLACKOUT_TRANSIT_LAYOUT.acidSurfaceY,
  });

  private readonly materials: THREE.Material[] = [];
  private readonly hallwayLights: THREE.PointLight[] = [];
  private readonly hallwayBulbs: THREE.MeshStandardMaterial[] = [];
  private hallwayElapsed = 0;
  private readonly staticVisuals: ContainmentStaticBatchResult;

  constructor() {
    this.root.name = 'level-3-room-2-powered-transit-gauntlet';
    this.root.userData.levelId = 'blackout';
    this.root.userData.roomId = 'room-2';

    const darkSteel = this.material(0x10191d, 0.94, 0.28);
    const steel = this.material(0x202a2d, 0.9, 0.38);
    const platformSteel = this.material(0x222b28, 0.92, 0.25);
    const liftSteel = this.material(0x303832, 0.85, 0.42);
    const trim = this.material(0x42504c, 0.72, 0.58);
    const warning = this.material(0x665020, 0.86, 0.2);
    const sticky = this.material(0x183a35, 0.48, 0.08, 0x061511, 0.16);
    const acid = this.material(0x292d13, 0.58, 0.04, 0x181b07, 0.09);
    const glass = this.material(0x263c3d, 0.52, 0.55, 0x061011, 0.12);

    this.buildShell(darkSteel, platformSteel, trim, warning, acid);
    this.buildBobRoute(platformSteel, liftSteel, sticky, trim, warning);
    this.catwalk = this.buildVoltCatwalk(platformSteel, steel, trim, warning);
    const switchAssembly = this.buildSwitchWall(sticky, steel, trim, warning);
    this.bobSwitchWall = switchAssembly.wall;
    this.switchButton = switchAssembly.button;
    this.buildBridgeAnchors(steel, warning);
    this.buildExit(platformSteel, liftSteel, warning);
    this.bridgeLockContact = this.buildExitHallway(darkSteel, steel, platformSteel, trim, warning);
    this.buildIndustrialDressing(steel, darkSteel, trim, glass);
    this.update(0);
    const immutable: THREE.Mesh[] = [];
    this.root.traverse(object => {
      if (object instanceof THREE.Mesh && object !== this.switchButton && object !== this.bridgeLockContact &&
          object.userData.textureRole !== 'acid-floor' && !object.name.includes('hallway-bulb')) immutable.push(object);
    });
    this.staticVisuals = consolidateStaticRoomVisuals(this.root, immutable);
  }

  acidAt(position: TransitPosition): boolean {
    return position.x >= this.acidBounds.minX &&
      position.x <= this.acidBounds.maxX &&
      position.z >= this.acidBounds.minZ &&
      position.z <= this.acidBounds.maxZ &&
      position.y <= -0.2;
  }

  exitAt(position: TransitPosition): boolean {
    return Math.abs(position.x - this.exitPosition.x) <= 4.4 &&
      position.z >= 147 && position.z <= 155 &&
      position.y >= -0.2 && position.y <= 3;
  }

  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) return;
    this.hallwayElapsed += deltaSeconds;
    for (let index = 0; index < this.hallwayLights.length; index += 1) {
      // Separate phases and dropouts prevent the whole corridor flashing in
      // sync. Only existing light/material values change, with no allocations.
      const seed = 0.7 + index * 2.1;
      const fast = 0.5 + 0.5 * Math.sin(this.hallwayElapsed * (13 + index * 1.3) + seed);
      const slow = 0.5 + 0.5 * Math.sin(this.hallwayElapsed * (1.7 + index * 0.2) + seed * 3);
      const dropout = Math.sin(this.hallwayElapsed * 0.9 + seed) > 0.88 ? 0.035 : 1;
      this.hallwayLights[index]!.intensity = dropout * (5 + fast * 12 + slow * 8);
      this.hallwayBulbs[index]!.emissiveIntensity = dropout * (0.5 + fast + slow * 0.7);
    }
  }

  dispose(): void {
    this.staticVisuals.dispose();
    this.root.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>();
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.materials.length = 0;
    this.collisionMeshes.length = 0;
    this.bobRoutePlatforms.length = 0;
    this.stickyWalls.length = 0;
    this.hallwayLights.length = 0;
    this.hallwayBulbs.length = 0;
    this.root.clear();
  }

  private buildShell(
    darkSteel: THREE.Material,
    platformSteel: THREE.Material,
    trim: THREE.Material,
    warning: THREE.Material,
    acid: THREE.Material,
  ): void {
    const entryAccent = this.material(0x6f5730, 0.62, 0.28, 0x8b651f, 0.14);
    const width = BLACKOUT_TRANSIT_LAYOUT.maxX - BLACKOUT_TRANSIT_LAYOUT.minX;
    const length = BLACKOUT_TRANSIT_LAYOUT.exitZ - BLACKOUT_TRANSIT_LAYOUT.entryZ;
    // This is a broad, non-jump entry bay for Bob and Goop. The side opening
    // at x=-16 feeds Volt directly onto his elevated maintenance catwalk.
    this.box('transit-entry-platform', [22, 0.8, 8], [6, 0, 84], platformSteel);

    // Acid is a continuous lower floor; its dark surface is intentionally
    // walkable for Goop and lethal only through the controller's acidAt test.
    this.box('transit-acid-basin-subfloor', [width, 0.35, length + 0.5], [0, -1.18, 118], darkSteel);
    const acidSurface = this.visualBox('transit-acid-surface', [width - 0.5, 0.035, length], [0, -0.985, 118], acid);
    acidSurface.userData.textureRole = 'acid-floor';
    acidSurface.userData.authoringRole = 'blackout-transit-acid-visual';

    // Walls seal the basin; the rear doorway opens into a fully enclosed
    // corridor rather than an unrendered gap beyond the room.
    this.box('transit-west-wall', [0.5, 22, length], [-21.75, 11, 118], darkSteel);
    this.box('transit-east-wall', [0.5, 22, length], [21.75, 11, 118], darkSteel);
    // The recessed basin sits a metre below the decks. Seal below every wall
    // and beneath both portals, overlapping the floor instead of leaving sky gaps.
    for (const x of [-21.75, 21.75]) this.box(`transit-basin-side-skirt-${x}`, [0.5, 1.4, length + 0.5], [x, -0.65, 118], darkSteel);
    for (const z of [80, 156]) this.box(`transit-basin-end-skirt-${z}`, [width, 1.4, 0.5], [0, -0.65, z], darkSteel);
    this.box('transit-volt-entry-under-wall', [1.5, 2.3, 0.5], [-16, 1.15, 80], darkSteel);
    // Room 1 now feeds two physically distinct entrances: a walk-through
    // doorway for Bob/Goop and a raised side duct opening for Volt. Keep the
    // wall solid everywhere else so neither route leaks into the void.
    this.box('transit-entry-wall-west', [5.25, 22, 0.5], [-19.375, 11, 80], darkSteel);
    this.box('transit-entry-wall-between-routes', [18.25, 22, 0.5], [-6.125, 11, 80], darkSteel);
    this.box('transit-entry-wall-east', [13, 22, 0.5], [15.5, 11, 80], darkSteel);
    this.box('transit-main-entry-header', [6, 17.5, 0.5], [6, 13.25, 80], darkSteel);
    this.box('transit-volt-entry-header', [1.5, 17.3, 0.5], [-16, 13.35, 80], darkSteel);
    // An empty, structural frame: jambs sit outside the six-metre walking bore.
    for (const x of [2.86, 9.14]) this.box(`transit-main-entry-jamb-${x}`, [0.28, 4.5, 0.65], [x, 2.25, 79.65], trim);
    this.box('transit-main-entry-lintel', [6.56, 0.28, 0.65], [6, 4.64, 79.65], trim);
    // Fine emissive strips mark the open passage at floor and lintel level,
    // making the route legible in the blackout without lighting the room.
    this.visualBox('transit-main-entry-threshold-light', [5.8, 0.035, 0.08], [6, 0.425, 79.64], entryAccent);
    this.visualBox('transit-main-entry-frame-top', [6.2, 0.055, 0.08], [6, 4.54, 79.64], entryAccent);
    this.visualBox('transit-volt-entry-threshold-light', [1.35, 0.035, 0.08], [-16, 2.525, 79.64], entryAccent);
    this.visualBox('transit-volt-entry-frame-top', [1.7, 0.055, 0.08], [-16, 4.74, 79.64], trim);
    const exitWidth = BLACKOUT_TRANSIT_EXIT_HALLWAY.width;
    const flankWidth = (width - exitWidth) / 2;
    for (const sign of [-1, 1]) {
      this.box(`transit-exit-wall-${sign}`, [flankWidth, 22, 0.5], [sign * (exitWidth + flankWidth) / 2, 11, 156], darkSteel);
    }
    this.box('transit-exit-wall-header', [exitWidth, 16.2, 0.5], [0, 13.9, 156], darkSteel);
    this.box('transit-ceiling', [width, 0.5, length], [0, 22.25, 118], darkSteel);

    // Subtle non-emissive stripes separate raised entry/exit aprons from the
    // lower acid floor without turning the chamber into a bright marked runway.
    for (const z of [88.3, 147.1]) {
      this.visualBox(`transit-basin-warning-edge-${z}`, [40, 0.025, 0.16], [0, -0.965, z], warning);
    }
    for (const x of [-20.7, 20.7]) {
      this.visualBox(`transit-basin-side-edge-${x}`, [0.12, 0.025, length - 0.4], [x, -0.965, 118], trim);
    }
  }

  private buildBobRoute(
    platformSteel: THREE.Material,
    liftSteel: THREE.Material,
    sticky: THREE.Material,
    trim: THREE.Material,
    warning: THREE.Material,
  ): void {
    const route: readonly { x: number; z: number; top: number; width: number; depth: number; name: string }[] = [
      { x: 10, z: 94, top: 1.0, width: 4.8, depth: 3.5, name: 'approach' },
      { x: 10.5, z: 102, top: 1.2, width: 4.8, depth: 3.5, name: 'cover-a-landing' },
      { x: 10, z: 118, top: 4.2, width: 4.8, depth: 3.5, name: 'lift-a-landing' },
      { x: 9.5, z: 126, top: 4.4, width: 4.8, depth: 3.5, name: 'cover-b-landing' },
    ];
    for (const step of route) {
      const mesh = this.platform(`bob-route-${step.name}`, [step.width, 0.5, step.depth], [step.x, step.top - 0.25, step.z], platformSteel);
      this.bobRoutePlatforms.push(mesh);
      this.warningEdges(mesh, warning, step.width, step.depth);
    }

    // Two authored moving-platform footprints. Controllers own the live
    // carriers; these rails, empty shafts and anchors are fixed scene geometry.
    for (const slot of this.liftSlots) {
      const shaftBottom = slot.minY - 0.35;
      const shaftTop = slot.maxY + 0.55;
      const shaftHeight = shaftTop - shaftBottom;
      this.box(`${slot.id}-shaft-west`, [0.18, shaftHeight, slot.size.z + 0.3], [slot.position.x - slot.size.x / 2 - 0.08, (shaftTop + shaftBottom) / 2, slot.position.z], liftSteel);
      this.box(`${slot.id}-shaft-east`, [0.18, shaftHeight, slot.size.z + 0.3], [slot.position.x + slot.size.x / 2 + 0.08, (shaftTop + shaftBottom) / 2, slot.position.z], liftSteel);
      this.visualBox(`${slot.id}-level-indicator`, [0.08, 1.1, 0.12], [slot.position.x - slot.size.x / 2 - 0.19, slot.position.y + 1.2, slot.position.z - 1.55], trim);
      this.visualBox(`${slot.id}-yellow-caution-mark`, [slot.size.x - 0.8, 0.028, 0.14], [slot.position.x, slot.minY - 0.1, slot.position.z - slot.size.z / 2 - 0.19], warning);
    }

    this.addStickyClimb('bob-sticky-climb-a', [7, 4.7, 98.3], 6.2, 3.6, sticky, trim);
    this.addStickyClimb('bob-sticky-climb-b', [7, 5.5, 122.4], 6.4, 3.6, sticky, trim);

    // A small safe shelf after the second lift holds the physical switch and
    // gives Bob room to stick, orient and remain attached while the bridge opens.
    const switchApproach = this.platform('bob-bridge-switch-approach', [5.2, 0.5, 4.2], [10, 7.35, 142.5], platformSteel);
    this.bobRoutePlatforms.push(switchApproach);
    this.warningEdges(switchApproach, warning, 5.2, 4.2);
  }

  private buildVoltCatwalk(
    platformSteel: THREE.Material,
    steel: THREE.Material,
    trim: THREE.Material,
    warning: THREE.Material,
  ): THREE.Mesh {
    const catwalk = this.platform('volt-service-catwalk', [2.8, 0.5, 50], [-16, 2.25, 111], platformSteel);
    catwalk.userData.textureRole = 'blackout-service-catwalk';
    for (let z = 90; z <= 134; z += 8) {
      this.box(`volt-catwalk-support-${z}`, [0.28, 2.1, 0.28], [-16, 1.15, z], steel);
      this.visualBox(`volt-catwalk-bracket-${z}`, [3.4, 0.16, 0.35], [-16, 1.7, z], trim);
    }
    for (const x of [-17.25, -14.75]) {
      this.box(`volt-catwalk-rail-${x}`, [0.14, 0.42, 48], [x, 2.71, 111], steel);
    }
    for (const z of [88.5, 111, 133.5]) {
      this.visualBox(`volt-catwalk-caution-${z}`, [2.4, 0.025, 0.13], [-16, 2.512, z], warning);
    }
    return catwalk;
  }

  private buildSwitchWall(
    sticky: THREE.Material,
    steel: THREE.Material,
    trim: THREE.Material,
    warning: THREE.Material,
  ): { wall: THREE.Mesh; button: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> } {
    const wall = this.box('bob-bridge-switch-sticky-wall', [0.22, 7, 4.8], [6.85, 9.1, 142.5], sticky);
    wall.userData.surfaceTag = 'sticky';
    wall.userData.textureRole = 'sticky-wall-tile';
    wall.userData.movementFaceMode = 'vertical-sides';
    this.stickyWalls.push(wall);
    this.visualBox('bob-bridge-switch-wall-frame', [0.18, 7.3, 5.1], [6.68, 9.1, 142.5], steel);
    this.visualBox('bob-bridge-switch-wall-top-rail', [0.32, 0.16, 5.2], [6.75, 12.78, 142.5], trim);
    this.visualBox('bob-bridge-pressure-button-bezel', [0.22, 0.86, 1.06], [7.08, this.switchPosition.y, this.switchPosition.z], warning);
    const buttonMaterial = this.material(0x8b662b, 0.6, 0.32, 0x50340c, 0.22);
    const button = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.82), buttonMaterial);
    button.name = 'bob-bridge-pressure-button';
    button.position.set(7.21, this.switchPosition.y, this.switchPosition.z);
    button.castShadow = true;
    button.receiveShadow = true;
    this.root.add(button);
    button.userData.indicatorRole = 'transit-bridge-switch';
    return { wall, button };
  }

  private buildBridgeAnchors(
    steel: THREE.Material,
    warning: THREE.Material,
  ): void {
    // Anchoring pads are fixed, collision-safe endpoints. The controller owns
    // the retractable bridge deck spanning diagonally between these points.
    this.box('transit-bridge-start-anchor', [3.8, 0.5, 3.5], [-16, 2.25, 136], steel);
    this.box('transit-bridge-end-anchor', [7, 0.5, 6], [0, 0.55, 144], steel);
    this.visualBox('transit-bridge-start-marking', [3.1, 0.025, 0.13], [-16, 2.512, 136], warning);
    this.visualBox('transit-bridge-end-marking', [3.5, 0.025, 0.13], [0, 0.512, 144], warning);
  }

  private buildExit(
    platformSteel: THREE.Material,
    liftSteel: THREE.Material,
    warning: THREE.Material,
  ): void {
    const exit = this.platform('transit-room-3-exit-deck', [14, 0.8, 8], [0, 0, 151], platformSteel);
    exit.userData.authoringRole = 'blackout-transit-exit-platform';
    this.warningEdges(exit, warning, 14, 8);

    // Goop's continuous lower route climbs a broad, shallow ramp; the bridge
    // reaches the same shared deck from Volt's isolated catwalk.
    const rampRise = 1.63;
    const rampAngle = Math.atan2(rampRise, 10);
    const ramp = this.box('goop-acid-exit-ramp', [10, 0.22, Math.hypot(10, rampRise)], [9, -0.165 - 0.11 / Math.cos(rampAngle), 145], liftSteel);
    ramp.rotation.x = -rampAngle;
    ramp.userData.preciseMovementCorners = true;
    ramp.userData.textureRole = 'blackout-transit-ramp';
    // Dry landing joins the left-hand route and ramp to the central exit.
    // Its top is just below the ramp tip, avoiding another raised-box lip.
    this.box('transit-exit-left-apron', [10, 0.5, 5], [9, 0.3, 152.5], platformSteel);
  }

  private buildExitHallway(
    darkSteel: THREE.Material,
    steel: THREE.Material,
    platformSteel: THREE.Material,
    trim: THREE.Material,
    warning: THREE.Material,
  ): THREE.Mesh {
    const { startZ, endZ, width, floorTopY, ceilingY, doorBottomY } = BLACKOUT_TRANSIT_EXIT_HALLWAY;
    const length = endZ - startZ;
    const centreZ = (startZ + endZ) / 2;
    const wallHeight = ceilingY - floorTopY;

    // Floor starts exactly at the existing exit deck's edge. No elevated lip,
    // coplanar duplicate floor or open seam interrupts the walk-through route.
    this.box('transit-exit-hallway-floor', [width + 0.8, 0.8, length + 1], [0, 0, centreZ - 0.5], platformSteel);
    for (const sign of [-1, 1]) {
      this.box(`transit-exit-hallway-wall-${sign}`, [0.4, wallHeight, length + 0.5], [sign * (width / 2 + 0.2), (floorTopY + ceilingY) / 2, centreZ], darkSteel);
      this.box(`transit-exit-door-jamb-${sign}`, [0.3, wallHeight, 0.85], [sign * (width / 2 + 0.15), (floorTopY + ceilingY) / 2, startZ], trim);
      this.visualBox(`transit-exit-door-guide-${sign}`, [0.12, 8.6, 0.28], [sign * (width / 2 + 0.38), 4.7, startZ - 0.33], steel);
      this.visualBox(`transit-exit-hallway-service-rail-${sign}`, [0.08, 0.12, length - 0.5], [sign * (width / 2 - 0.045), 1.25, centreZ], trim);
    }
    this.box('transit-exit-hallway-ceiling', [width + 0.8, 0.35, length + 0.5], [0, ceilingY + 0.175, centreZ], darkSteel);
    this.box('transit-exit-door-lintel', [width + 0.6, 0.3, 0.85], [0, ceilingY + 0.15, startZ], trim);

    // A jammed shutter, physically resting on the shipping crate. The other
    // half of the opening remains wide and tall enough for all three slimes.
    const doorMaterial = this.material(0x37403d, 0.68, 0.66);
    const doorHeight = wallHeight;
    this.box('transit-exit-half-raised-door', [width - 0.1, doorHeight, 0.28], [0, doorBottomY + doorHeight / 2, startZ], doorMaterial);
    // Reuse this structural edge as Volt's contact rather than putting a
    // floating socket on the bridge landing. Its material is room-owned and
    // separate from the shared trim so powering it cannot light every frame.
    const contactMaterial = this.material(0x42504c, 0.72, 0.58, 0xffcc7a);
    const bridgeLockContact = this.visualBox('transit-exit-door-bottom-rail', [width - 0.1, 0.13, 0.06], [0, doorBottomY + 0.065, startZ - 0.18], contactMaterial);
    for (let index = 0; index < 7; index += 1) {
      this.visualBox(`transit-exit-door-shutter-rib-${index}`, [width - 0.25, 0.055, 0.06], [0, doorBottomY + 0.38 + index * 0.72, startZ - 0.18], steel);
    }
    for (const x of [-2.8, 2.8]) {
      this.visualBox(`transit-exit-door-caution-${x}`, [0.52, 0.1, 0.065], [x, doorBottomY + 0.16, startZ - 0.185], warning);
    }

    const crateMaterial = this.material(0x51422c, 0.94, 0.12);
    const crateHeight = doorBottomY - floorTopY;
    const crateX = 1.75;
    const crateY = (doorBottomY + floorTopY) / 2;
    const crateZ = startZ + 0.15;
    this.box('transit-exit-door-prop-crate', [2.2, crateHeight, 1.8], [crateX, crateY, crateZ], crateMaterial);
    for (const x of [crateX - 1.04, crateX + 1.04]) {
      this.visualBox(`transit-exit-crate-corner-${x}`, [0.12, crateHeight, 1.84], [x, crateY, crateZ], trim);
    }
    for (const y of [floorTopY + 0.1, doorBottomY - 0.1]) {
      this.visualBox(`transit-exit-crate-band-${y}`, [2.24, 0.16, 1.84], [crateX, y, crateZ], steel);
    }
    const brace = this.visualBox('transit-exit-crate-diagonal-brace', [0.14, Math.hypot(1.8, crateHeight - 0.4), 0.08], [crateX, crateY, crateZ - 0.95], trim);
    brace.rotation.z = -Math.atan2(1.8, crateHeight - 0.4);
    this.visualBox('transit-exit-crate-shipping-label', [0.42, 0.28, 0.025], [crateX + 0.45, crateY + 0.35, crateZ - 0.92], warning);

    for (const [index, z] of [startZ + 3, centreZ, endZ - 3].entries()) {
      this.visualBox(`transit-exit-hallway-fixture-${index + 1}`, [1.2, 0.18, 0.65], [0, ceilingY - 0.09, z], steel);
      const bulbMaterial = this.material(0x95865f, 0.5, 0.18, 0xffcf70, 1);
      this.visualBox(`transit-exit-hallway-bulb-${index + 1}`, [0.9, 0.07, 0.4], [0, ceilingY - 0.215, z], bulbMaterial);
      const light = new THREE.PointLight(0xffcf70, 18, 8, 2);
      light.name = `transit-exit-hallway-light-${index + 1}`;
      light.position.set(0, ceilingY - 0.5, z);
      this.root.add(light);
      this.hallwayLights.push(light);
      this.hallwayBulbs.push(bulbMaterial);
    }
    return bridgeLockContact;
  }

  private buildIndustrialDressing(
    steel: THREE.Material,
    darkSteel: THREE.Material,
    trim: THREE.Material,
    glass: THREE.Material,
  ): void {
    // Repeated ceiling beams make the room read as an abandoned transit hall
    // without crowding the three traversal routes or hiding drone sightlines.
    for (const z of [89, 106, 123, 140, 153]) {
      this.box(`transit-ceiling-beam-${z}`, [43, 0.32, 0.42], [0, 20.7, z], steel);
    }
    for (const z of [96, 116, 136]) {
      this.box(`transit-west-service-conduit-${z}`, [0.2, 0.42, 9], [-20.8, 13.5, z], trim);
      this.box(`transit-east-service-conduit-${z}`, [0.2, 0.42, 9], [20.8, 13.5, z], trim);
    }
    // Darkened observation panels hint at the chamber's old control gallery.
    for (const z of [98, 118, 138]) {
      this.visualBox(`transit-gallery-panel-${z}`, [0.12, 4, 6], [21.42, 15, z], glass);
    }
    this.visualBox('transit-main-power-trunk', [0.45, 0.38, 54], [-19, 17.5, 116], darkSteel);
  }

  private addStickyClimb(
    name: string,
    center: BoxPosition,
    height: number,
    depth: number,
    material: THREE.Material,
    trim: THREE.Material,
  ): void {
    const wall = this.box(name, [0.22, height, depth], center, material);
    wall.userData.surfaceTag = 'sticky';
    wall.userData.textureRole = 'sticky-wall-tile';
    wall.userData.movementFaceMode = 'vertical-sides';
    this.stickyWalls.push(wall);
    this.visualBox(`${name}-edge-trim`, [0.1, height + 0.08, 0.1], [center[0] + 0.16, center[1], center[2]], trim);
  }

  private warningEdges(mesh: THREE.Mesh, material: THREE.Material, width: number, depth: number): void {
    const inset = 0.15;
    for (const zSign of [-1, 1]) {
      this.visualBox(`${mesh.name}-warning-${zSign}`, [width - inset * 2, 0.025, 0.08], [mesh.position.x, mesh.position.y + 0.263, mesh.position.z + zSign * (depth / 2 - inset)], material);
    }
  }

  private platform(name: string, size: BoxSize, position: BoxPosition, material: THREE.Material): THREE.Mesh {
    return this.box(name, size, position, material);
  }

  private box(name: string, size: BoxSize, position: BoxPosition, material: THREE.Material): THREE.Mesh {
    const mesh = this.visualBox(name, size, position, material);
    mesh.userData.authoringRole = 'blackout-transit-collision';
    mesh.userData.surfaceTag ??= 'default';
    this.collisionMeshes.push(mesh);
    return mesh;
  }

  private visualBox(name: string, size: BoxSize, position: BoxPosition, material: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    return mesh;
  }

  private material(color: number, roughness: number, metalness: number, emissive = 0x000000, emissiveIntensity = 0): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity });
    this.materials.push(material);
    return material;
  }
}
