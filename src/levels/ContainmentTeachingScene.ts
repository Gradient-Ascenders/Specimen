import type { GelRendering } from '../render/slime/GelRendering.ts';
import { GoopCharacterPresentation } from '../render/goop/GoopCharacterPresentation.ts';
import * as THREE from 'three';
import { GAMEPLAY_UI_LAYER } from '../render/GameplayUiLayer.ts';

import { DEFAULT_KINEMATIC_BODY_CONFIG } from '../physics/KinematicBody.ts';
import type { SurfaceTag } from '../physics/SurfaceRegistry.ts';
import {
  BobCharacterPresentation,
} from '../render/bob/BobCharacterPresentation.ts';
import type { Vector3State } from '../render/slime/SlimePresentationContract.ts';
import type { ContainmentArtResources } from '../render/environment/containment/ContainmentArtResources.ts';
import { ContainmentVentArt } from '../render/environment/containment/ContainmentVentArt.ts';
import { RoomOneArt } from '../render/environment/containment/RoomOneArt.ts';
import { RoomTwoArt } from '../render/environment/containment/RoomTwoArt.ts';
import { SPECIMEN_POD_CROWN_SECTIONS, SPECIMEN_POD_GLASS, SPECIMEN_POD_LID_RAISE_METRES,
  SPECIMEN_POD_SOLID_SECTIONS } from '../render/environment/containment/ContainmentSpecimenPod.ts';

interface BoxOptions {
  readonly name: string;
  readonly size: readonly [number, number, number];
  readonly position: readonly [number, number, number];
  readonly material: THREE.Material;
  readonly surfaceTag?: SurfaceTag;
  /** Art-facing identifier; does not affect collision or adhesion behaviour. */
  readonly textureRole?:
    | 'sticky-wall-tile'
    | 'sticky-vent-tile';
  readonly rotationX?: number;
  readonly rotationY?: number;
  readonly geometry?: THREE.BoxGeometry;
  readonly preciseMovementCorners?: boolean;
}
const ROOM_2_CENTRE_Z = 38;
const SPAWN_POSITION = new THREE.Vector3(-0.20995, 0.52507, -2.60112);
const OUT_OF_BOUNDS_TEST_POSITION = new THREE.Vector3(0, -5, -1.8);
const ROOM_2_FLOOR_TOP_Y = 0;
const TIGHT_CAMERA_VENT_BOUNDS = [
  { min: [-6.1, 4.5, 5.2], max: [-3.5, 7.8, 13.2] },
  { min: [-6.1, 4.8, 12.2], max: [-3.5, 11.4, 24.9] },
  { min: [-9.8, 9.8, 22.8], max: [-1.7, 13, 25.3] },
  { min: [-9.8, 9.8, 24.7], max: [-7, 13, 29.6] },
] as const;
// The 0.45 m player radius and 0.01 m collision skin both need clearance.
const ROOM_2_SAFE_LANDING_POSITION = new THREE.Vector3(
  -9,
  ROOM_2_FLOOR_TOP_Y +
    DEFAULT_KINEMATIC_BODY_CONFIG.radiusMetres +
    DEFAULT_KINEMATIC_BODY_CONFIG.skinWidthMetres,
  31,
);

/**
 * Level 1's first authored grey-box. It follows the Room 1/Room 2 teaching
 * layouts while keeping collision deliberately primitive and inspectable.
 */
export class ContainmentTeachingScene {
  readonly root = new THREE.Group();
  readonly roomOneArt: RoomOneArt;
  readonly roomTwoArt: RoomTwoArt;

  private readonly collisionMeshList: THREE.Mesh[] = [];
  private readonly ownedGeometries = new Set<THREE.BufferGeometry>();
  private readonly ownedMaterials = new Set<THREE.Material>();
  readonly bob: BobCharacterPresentation;
  readonly goop: GoopCharacterPresentation;
  readonly ventArt = new ContainmentVentArt();
  private disposed = false;

  constructor(
    artResources: ContainmentArtResources,
    options: { readonly includeDevelopmentHelpers?: boolean; readonly gelRendering?: GelRendering } = {},
  ) {
    this.goop = new GoopCharacterPresentation(undefined, options.gelRendering);
    // Retain the validated hierarchy name for collision fingerprint stability.
    this.root.name = 'containment-climb-and-bounce-greybox';

    const roomOneMaterials = {
      floor: this.collisionOnlyMaterial('containment-room-1-shell-collision-only'),
      wall: this.collisionOnlyMaterial('containment-room-1-wall-collision-only'),
      ceiling: this.collisionOnlyMaterial('containment-room-1-ceiling-collision-only'),
      // The round pod supplies the visible shell; its compound support surfaces
      // stay collision-only instead of exposing an old square greybox.
      support: this.collisionOnlyMaterial('containment-room-1-pedestal-collision-only'),
      // Gameplay metadata owns adhesion. This collider-only material emits no
      // render fragments; RoomOneArt supplies the explicit green membrane and
      // dark backing without exposing the collider's coplanar top face.
      sticky: this.collisionOnlyMaterial(
        'containment-room-1-sticky-wall-collision-only',
      ),
      // This short floor remains sticky only to smooth the wall-to-duct
      // transition. Its appearance stays ordinary service metal so it reads as
      // part of the vent rather than a second biological membrane.
      stickyVent: this.collisionOnlyMaterial('containment-vent-sticky-collision-only'),
      platform: artResources.materials.secondaryCeramic,
      locked: artResources.materials.lockedStatus,
      exit: artResources.materials.staticCyanEmissive,
      duct: this.collisionOnlyMaterial('containment-vent-collision-only'),
      glass: artResources.materials.containmentGlass,
      egg: artResources.materials.specimenShell,
    };
    const roomTwoCollisionMaterial = this.collisionOnlyMaterial(
      'containment-room-2-production-collision-only',
    );
    const roomTwoMaterials = {
      floor: roomTwoCollisionMaterial,
      wall: roomTwoCollisionMaterial,
      support: roomTwoCollisionMaterial,
      sticky: roomTwoCollisionMaterial,
      stickyVent: roomTwoCollisionMaterial,
      platform: roomTwoCollisionMaterial,
      locked: roomTwoCollisionMaterial,
      exit: roomTwoCollisionMaterial,
      duct: roomTwoCollisionMaterial,
      glass: roomTwoCollisionMaterial,
      egg: roomTwoCollisionMaterial,
    };

    this.addRoomOne(roomOneMaterials);
    this.addVentTransition(roomOneMaterials);
    this.addRoomTwo(roomTwoMaterials);
    if (options.includeDevelopmentHelpers === true) {
      this.addReferenceMarkers(artResources.materials.staticCyanEmissive);
    }
    this.roomOneArt = new RoomOneArt(artResources);
    this.roomTwoArt = new RoomTwoArt(artResources);
    // The connecting duct must survive Room 1 occlusion when looking back
    // from its Room 2 end. It owns a separate visibility branch.
    this.root.add(this.roomOneArt.root, this.roomTwoArt.root, this.ventArt.root);

    this.bob = new BobCharacterPresentation(
      DEFAULT_KINEMATIC_BODY_CONFIG.radiusMetres, options.gelRendering,
    );
    this.bob.setSpawnYaw(Math.PI);
    this.goop.setSpawnYaw(Math.PI);
    this.root.add(this.bob.root, this.goop.root);
    this.resetTeachingPresentation();
  }

  get collisionMeshes(): readonly THREE.Mesh[] {
    return this.collisionMeshList;
  }

  copySpawnPosition(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(SPAWN_POSITION);
  }

  copyOutOfBoundsTestPosition(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(OUT_OF_BOUNDS_TEST_POSITION);
  }

  copyRoomTwoSafeLandingPosition(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(ROOM_2_SAFE_LANDING_POSITION);
  }

  isInsideCameraTightVent(position: Vector3State): boolean {
    for (let index = 0; index < TIGHT_CAMERA_VENT_BOUNDS.length; index += 1) {
      const bounds = TIGHT_CAMERA_VENT_BOUNDS[index];
      if (
        position.x >= bounds.min[0] &&
        position.x <= bounds.max[0] &&
        position.y >= bounds.min[1] &&
        position.y <= bounds.max[1] &&
        position.z >= bounds.min[2] &&
        position.z <= bounds.max[2]
      ) {
        return true;
      }
    }
    return false;
  }

  resetTeachingPresentation(): void {
    this.roomOneArt.reset();
    this.bob.setPosition(SPAWN_POSITION);
    this.bob.reset();
    this.goop.reset();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.bob.dispose();
    this.goop.dispose();
    this.roomOneArt.dispose();
    this.ventArt.dispose();
    this.roomTwoArt.dispose();
    this.root.removeFromParent();
    for (const geometry of this.ownedGeometries) geometry.dispose();
    for (const material of this.ownedMaterials) material.dispose();
    this.ownedGeometries.clear();
    this.ownedMaterials.clear();
    this.collisionMeshList.length = 0;
    this.root.clear();
  }

  private addRoomOne(
    materials: Record<string, THREE.Material>,
  ): void {
    // 14 × 12 × 8 m sterile containment chamber.
    this.addCollider({ name: 'room-1-floor', size: [14, 0.4, 12], position: [0, -0.2, 0], material: materials.floor });
    this.addCollider({ name: 'room-1-rear-wall', size: [14, 8, 0.4], position: [0, 4, -6], material: materials.wall });
    this.addCollider({ name: 'room-1-west-wall', size: [0.4, 8, 12], position: [-7, 4, 0], material: materials.wall });
    this.addCollider({ name: 'room-1-east-wall', size: [0.4, 8, 12], position: [7, 4, 0], material: materials.wall });
    this.addCollider({ name: 'room-1-ceiling', size: [14, 0.3, 12], position: [0, 8, 0], material: materials.ceiling });

    // The north perimeter is split so the contaminated wall and open vent are
    // real authored collision surfaces instead of decorative overlays.
    // The sticky route is directly below the opening. Its top is exactly level
    // with the duct floor so edge traversal can roll smoothly over the lip.
    this.addCollider({ name: 'room-1-north-clean-west', size: [1.2, 8, 0.4], position: [-6.4, 4, 6], material: materials.wall });
    this.addCollider({
      name: 'room-1-vent-sticky-entry-wall',
      size: [2, 5.225, 0.4],
      position: [-4.8, 2.6125, 6],
      material: materials.sticky,
      surfaceTag: 'sticky',
      textureRole: 'sticky-wall-tile',
    });
    this.addCollider({ name: 'room-1-north-clean-centre', size: [4, 8, 0.4], position: [-1.8, 4, 6], material: materials.wall });
    this.addCollider({ name: 'room-1-north-clean-east', size: [6.8, 8, 0.4], position: [3.6, 4, 6], material: materials.wall });
    this.addCollider({ name: 'room-1-north-above-vent', size: [2, 1.2, 0.4], position: [-4.8, 7.4, 6], material: materials.wall });

    this.addPedestalColliders(materials.support);
    this.addRaisedChamberColliders(materials.support);

  }

  private addPedestalColliders(material: THREE.Material): void {
    // Eight overlapping inscribed rectangles approximate each 16-sided round
    // solid within 6% of its radius, with no invisible square corners. Share
    // four box geometries; the existing static broadphase/box sweep stays intact.
    for (const section of [...SPECIMEN_POD_SOLID_SECTIONS].reverse()) {
      const size = [2 * section.radius * Math.cos(Math.PI / 8), section.height,
        2 * section.radius * Math.sin(Math.PI / 8)] as const;
      const geometry = new THREE.BoxGeometry(...size);
      for (let index = 0; index < 8; index++) {
        this.addCollider({
          name: section.name === 'lower-gasket' && index === 0 ? 'room-1-containment-pedestal'
            : `room-1-containment-pedestal-${section.name}-${index}`,
          size, position: [0, section.y, -0.5], material,
          rotationY: index * Math.PI / 8, geometry,
        });
      }
    }
  }

  private addRaisedChamberColliders(material: THREE.Material): void {
    // Gameplay starts only after the opening raises the chamber, and restart
    // retains that pose. Keep these boxes static: no per-frame transform/cache
    // updates and no extra draw calls or duplicate visible glass.
    const segments = 16, halfAngle = Math.PI / segments;
    const radius = SPECIMEN_POD_GLASS.radius * Math.cos(halfAngle);
    const size = [2 * SPECIMEN_POD_GLASS.radius * Math.sin(halfAngle) + 0.01,
      SPECIMEN_POD_GLASS.height, 0.04] as const;
    const geometry = new THREE.BoxGeometry(...size);
    for (let index = 0; index < segments; index++) {
      const angle = index * Math.PI * 2 / segments;
      this.addCollider({ name: `room-1-containment-chamber-glass-${index}`, size, geometry, material,
        position: [Math.sin(angle) * radius, SPECIMEN_POD_GLASS.y + SPECIMEN_POD_LID_RAISE_METRES,
          -0.5 + Math.cos(angle) * radius], rotationY: angle, preciseMovementCorners: true });
    }
    // Only the real top is capped. Filling the entire cylinder would create an
    // invisible wall below the raised glass and prevent using the pedestal.
    for (const section of SPECIMEN_POD_CROWN_SECTIONS) {
      const capSize = [2 * section.radius * Math.cos(Math.PI / 8), section.height,
        2 * section.radius * Math.sin(Math.PI / 8)] as const;
      const capGeometry = new THREE.BoxGeometry(...capSize);
      for (let index = 0; index < 8; index++) {
        this.addCollider({ name: `room-1-containment-chamber-${section.name}-${index}`,
          size: capSize, geometry: capGeometry, material,
          position: [0, section.y + SPECIMEN_POD_LID_RAISE_METRES, -0.5], rotationY: index * Math.PI / 8,
          preciseMovementCorners: true });
      }
    }
  }

  private addVentTransition(materials: Record<string, THREE.Material>): void {
    // A single, fully enclosed rising duct creates meaningful separation before
    // the Room 2 drop without becoming a maze. Its floor sections overlap so
    // there is never an invisible gap between the slope and its landing.
    // A short sticky floor continuation gives edge traversal an adhesive face
    // to acquire at the vent mouth. The remaining duct immediately returns to
    // ordinary metal once the slime is safely through the opening.
    this.addCollider({ name: 'duct-segment-a-sticky-vent-tile', size: [2, 0.25, 1.8], position: [-4.8, 5.1, 6.9], material: materials.stickyVent, surfaceTag: 'sticky', textureRole: 'sticky-vent-tile' });
    this.addCollider({ name: 'duct-segment-a-floor', size: [2, 0.25, 5.2], position: [-4.8, 5.1, 10.4], material: materials.duct });
    this.addCollider({ name: 'duct-segment-a-roof', size: [2, 0.18, 7], position: [-4.8, 7.3, 9.5], material: materials.duct });
    // This side used to be sticky. It remains a solid duct wall so the route
    // is enclosed, but it is now ordinary metal and cannot be climbed.
    this.addDuctSide('-a-west', [-5.85, 6.2, 9.5], [0.18, 2.2, 7], materials.duct);
    this.addDuctSide('-a-east', [-3.75, 6.2, 9.5], [0.18, 2.2, 7], materials.duct);

    const rampAngle = -THREE.MathUtils.degToRad(26);
    this.addCollider({ name: 'duct-segment-b-ramp', size: [2, 0.25, 11.007675305709084], position: [-4.8, 7.6587990116956295, 18.107979879165793], material: materials.duct, rotationX: rampAngle, preciseMovementCorners: true });
    // A tangent crest eases the 26-degree climb into the landing. The
    // landing notch extends to its end so no flat slab cuts across the curve.
    this.addCollider({ name: 'duct-crest-0', size: [2, 0.25, 0.17141233711992504], position: [-4.8, 10.105586690680639, 23.12944697198106], material: materials.duct, rotationX: -0.42857573929063497, preciseMovementCorners: true });
    this.addCollider({ name: 'duct-crest-1', size: [2, 0.25, 0.16767419467584727], position: [-4.8, 10.169086579834351, 23.27845822260632], material: materials.duct, rotationX: -0.3764977449633387, preciseMovementCorners: true });
    this.addCollider({ name: 'duct-crest-2', size: [2, 0.25, 0.16441744195881117], position: [-4.8, 10.223295747943318, 23.42710044760089], material: materials.duct, rotationX: -0.32235757792940717, preciseMovementCorners: true });
    this.addCollider({ name: 'duct-crest-3', size: [2, 0.25, 0.16166608566190022], position: [-4.8, 10.268296905513262, 23.57540344192413], material: materials.duct, rotationX: -0.26636620280504997, preciseMovementCorners: true });
    this.addCollider({ name: 'duct-crest-4', size: [2, 0.25, 0.15944112986698014], position: [-4.8, 10.304170289364524, 23.723410190486952], material: materials.duct, rotationX: -0.2087953090736997, preciseMovementCorners: true });
    this.addCollider({ name: 'duct-crest-5', size: [2, 0.25, 0.1577596233107115], position: [-4.8, 10.330990424901657, 23.871176504170716], material: materials.duct, rotationX: -0.14997360455175285, preciseMovementCorners: true });
    this.addCollider({ name: 'duct-crest-6', size: [2, 0.25, 0.15663379284572454], position: [-4.8, 10.34882288320142, 24.01876948649716], material: materials.duct, rotationX: -0.09027847332367255, preciseMovementCorners: true });
    this.addCollider({ name: 'duct-crest-7', size: [2, 0.25, 0.15607035059803032], position: [-4.8, 10.357721455170378, 24.16626482905219], material: materials.duct, rotationX: -0.03012318787331432, preciseMovementCorners: true });
    this.addCollider({ name: 'duct-segment-b-roof', size: [2, 0.18, 11.88], position: [-4.8, 9.83, 17.54], material: materials.duct, rotationX: rampAngle });
    this.addCollider({ name: 'duct-segment-b-west-wall', size: [0.18, 2.2, 11.88], position: [-5.8, 8.84, 18.02], material: materials.duct, rotationX: rampAngle });
    this.addCollider({ name: 'duct-segment-b-east-wall', size: [0.18, 2.2, 11.88], position: [-3.8, 8.84, 18.02], material: materials.duct, rotationX: rampAngle });

    // The ramp's high end is 10.49m, exactly level with this short turning
    // bay. It is intentionally low enough to read as one connected route.
    // Blender Boolean notch converted to three ordinary box colliders.
    // This preserves the rectangular cut-out while remaining compatible with
    // the game's box-based collision behaviour.
    // At the uphill join, an expanded-box sweep invents a vertical curb one
    // player radius before the landing. Use the existing rounded sphere/box
    // edge sweep for these three slabs; keep the real notch and solid floor.
    this.addCollider({
      name: 'duct-segment-c-floor-main',
      size: [7.2, 0.25, 0.7699950000000015],
      position: [-5.7, 10.36, 24.6249975],
      material: materials.duct,
      preciseMovementCorners: true,
    });
    this.addCollider({
      name: 'duct-segment-c-floor-front-left',
      size: [3.5, 0.25, 1.240005],
      position: [-7.55, 10.36, 23.619997499999997],
      material: materials.duct,
      preciseMovementCorners: true,
    });
    this.addCollider({
      name: 'duct-segment-c-floor-front-right',
      size: [1.7, 0.25, 1.240005],
      position: [-2.95, 10.36, 23.619997499999997],
      material: materials.duct,
      preciseMovementCorners: true,
    });
    this.addCollider({ name: 'duct-segment-c-roof', size: [7.2, 0.18, 2], position: [-5.7, 12.56, 24], material: materials.duct });
    // Enclose the turning bay, leaving only the ramp entry and the final-run
    // exit open. The short split walls prevent a player falling into the void.
    this.addCollider({ name: 'duct-segment-c-west-wall', size: [0.18, 2.2, 2], position: [-9.25, 11.46, 24], material: materials.duct });
    this.addCollider({ name: 'duct-segment-c-east-wall', size: [0.18, 2.2, 2], position: [-2.15, 11.46, 24], material: materials.duct });
    this.addCollider({ name: 'duct-segment-c-south-wall-west', size: [3.35, 2.2, 0.18], position: [-7.58, 11.46, 23.05], material: materials.duct });
    this.addCollider({ name: 'duct-segment-c-south-wall-east', size: [1.55, 2.2, 0.18], position: [-2.93, 11.46, 23.05], material: materials.duct });
    this.addCollider({ name: 'duct-segment-c-north-wall', size: [5.65, 2.2, 0.18], position: [-4.53, 11.46, 24.95], material: materials.duct });
    // Close the small outer-side seam between the bay and final duct without
    // placing geometry across the route itself.
    this.addCollider({ name: 'duct-turn-to-final-west-seal', size: [0.3, 2.2, 0.35], position: [-9.4, 11.46, 25], material: materials.duct });
    // End the floor before Room 2. The uncovered final 0.8 m is the actual
    // drop opening; it is intentionally not represented by a solid visual box.
    this.addCollider({ name: 'duct-final-run-floor', size: [2, 0.25, 4.2], position: [-8.4, 10.36, 27.1], material: materials.duct });
    this.addCollider({ name: 'duct-final-run-roof', size: [2, 0.18, 4.2], position: [-8.4, 12.56, 27.1], material: materials.duct });
    this.addDuctSide('-final-west', [-9.45, 11.46, 27.1], [0.18, 2.2, 4.2], materials.duct);
    this.addDuctSide('-final-east', [-7.35, 11.46, 27.1], [0.18, 2.2, 4.2], materials.duct);
  }

  private addRoomTwo(materials: Record<string, THREE.Material>): void {
    // 30 × 22 × 18 m calibration chamber. It is intentionally open, safe,
    // and vertical; only the final catch wall is sticky.
    this.addCollider({ name: 'room-2-floor', size: [30, 0.4, 22], position: [0, -0.2, ROOM_2_CENTRE_Z], material: materials.floor });
    this.addCollider({ name: 'room-2-west-wall', size: [0.4, 18, 22], position: [-15, 9, ROOM_2_CENTRE_Z], material: materials.wall });
    this.addCollider({ name: 'room-2-east-wall', size: [0.4, 18, 22], position: [15, 9, ROOM_2_CENTRE_Z], material: materials.wall });
    this.addCollider({ name: 'room-2-ceiling', size: [30, 0.4, 22], position: [0, 18.2, ROOM_2_CENTRE_Z], material: materials.wall });
    // Split the rear wall around the elevated duct outlet. The opening aligns
    // with the final duct interior and lets the player fall onto Room 2's
    // bounce landing rather than colliding with an invisible sealed wall.
    this.addCollider({ name: 'room-2-rear-wall-west', size: [5.5, 18, 0.4], position: [-12.25, 9, ROOM_2_CENTRE_Z - 11], material: materials.wall });
    this.addCollider({ name: 'room-2-rear-wall-east', size: [22.3, 18, 0.4], position: [3.85, 9, ROOM_2_CENTRE_Z - 11], material: materials.wall });
    this.addCollider({ name: 'room-2-rear-wall-below-duct', size: [2.2, 10.2, 0.4], position: [-8.4, 5.1, ROOM_2_CENTRE_Z - 11], material: materials.wall });
    this.addCollider({ name: 'room-2-rear-wall-above-duct', size: [2.2, 5.2, 0.4], position: [-8.4, 15.4, ROOM_2_CENTRE_Z - 11], material: materials.wall });
    // Split the front wall around the elevated exit so Room 3 is physically
    // reachable. The previous green door was only a visual laid over a solid
    // wall, which was sufficient while issue #20 ended in Room 2.
    this.addCollider({ name: 'room-2-front-wall-west', size: [13.5, 18, 0.4], position: [-8.25, 9, ROOM_2_CENTRE_Z + 11], material: materials.wall });
    this.addCollider({ name: 'room-2-front-wall-east', size: [13.5, 18, 0.4], position: [8.25, 9, ROOM_2_CENTRE_Z + 11], material: materials.wall });
    this.addCollider({ name: 'room-2-front-wall-below-exit', size: [3, 10.4, 0.4], position: [0, 5.2, ROOM_2_CENTRE_Z + 11], material: materials.wall });
    this.addCollider({ name: 'room-2-front-wall-above-exit', size: [3, 3.9, 0.4], position: [0, 16.05, ROOM_2_CENTRE_Z + 11], material: materials.wall });
    // Zones 2-3: a forgiving four-jump zig-zag fills the lower chamber and
    // teaches progressively higher and longer charged jumps. Every miss lands
    // on the safe room floor, and the generous tops keep this a tutorial.
    this.addCollider({ name: 'room-2-platform-a-height-lesson', size: [3.15, 0.5, 3.15], position: [-6.37855, 1.46779, 37.78357], material: materials.platform });
    this.addCollider({ name: 'room-2-platform-b-gap-lesson', size: [2.82146, 0.5, 3.5], position: [-0.5, 2.55, 37], material: materials.platform });
    this.addCollider({ name: 'room-2-platform-c-side-jump', size: [3.8, 0.5, 3.5], position: [4.2, 3.85, 31.0999], material: materials.platform });
    this.addCollider({ name: 'room-2-platform-d-sticky-launch', size: [4, 0.5, 4], position: [8.5, 5.2, 38.5], material: materials.platform });

    // Zone 4: the sticky patch is embedded in the east perimeter wall rather
    // than presented as a freestanding slab. Platform D leaves a deliberate
    // four-metre air gap so the player must jump, catch, and climb.
    this.addCollider({ name: 'room-2-sticky-catch-wall', size: [0.12, 6.94462, 6.5], position: [14.73472, 7.73804, 43.0006], material: materials.sticky, surfaceTag: 'sticky', textureRole: 'sticky-wall-tile' });
    // Blender-authored version: the separate sticky ledge fascia/top strip were removed.
    this.addCollider({ name: 'room-2-top-of-sticky-wall-ledge', size: [3.1, 0.35, 4.7], position: [13.25, 9.15, 42.9], material: materials.support });

    // Zone 5: three more readable upper-level jumps carry the route back
    // across the room to the obvious green exit.
    this.addCollider({ name: 'room-2-upper-step-a', size: [4, 0.4, 3.5], position: [8.8, 9.65, 37.65683], material: materials.platform });
    this.addCollider({ name: 'room-2-upper-step-b', size: [3.6, 0.4, 3.4], position: [0.87909, 10.15, 38.41571], material: materials.platform });
    this.addCollider({ name: 'room-2-exit-balcony', size: [7, 0.5, 4], position: [0, 10.65, 46.79795], material: materials.platform });

    // Blender-authored version: the four low recovery steps were removed.

  }

  private addReferenceMarkers(exitMaterial: THREE.Material): void {
    const roomTwoMarkerGeometry = new THREE.TorusGeometry(0.72, 0.055, 10, 40);
    this.ownedGeometries.add(roomTwoMarkerGeometry);
    const roomTwoMarker = new THREE.Mesh(roomTwoMarkerGeometry, exitMaterial);
    roomTwoMarker.name = 'room-2-safe-recovery-marker';
    roomTwoMarker.layers.set(GAMEPLAY_UI_LAYER);
    roomTwoMarker.position.set(
      ROOM_2_SAFE_LANDING_POSITION.x,
      ROOM_2_FLOOR_TOP_Y + 0.01,
      ROOM_2_SAFE_LANDING_POSITION.z,
    );
    roomTwoMarker.rotation.x = Math.PI / 2;
    this.root.add(roomTwoMarker);
  }

  private addDuctSide(
    name: string,
    position: readonly [number, number, number],
    size: readonly [number, number, number],
    material: THREE.Material,
    surfaceTag: SurfaceTag = 'default',
  ): void {
    this.addCollider({
      name: `duct-side${name}`,
      position,
      size,
      material,
      surfaceTag,
    });
  }


  private addCollider(options: BoxOptions): void {
    const geometry = options.geometry ?? new THREE.BoxGeometry(...options.size);
    this.ownedGeometries.add(geometry);
    const mesh = new THREE.Mesh(
      geometry,
      options.material,
    );
    mesh.name = options.name;
    mesh.position.set(...options.position);
    mesh.rotation.x = options.rotationX ?? 0;
    mesh.rotation.y = options.rotationY ?? 0;
    mesh.userData.surfaceTag = options.surfaceTag ?? 'default';
    if (options.preciseMovementCorners) mesh.userData.preciseMovementCorners = true;
    if (options.textureRole) mesh.userData.textureRole = options.textureRole;
    mesh.userData.sizeMetres = [...options.size];
    this.root.add(mesh);
    this.collisionMeshList.push(mesh);
  }

  private collisionOnlyMaterial(name: string): THREE.MeshBasicMaterial {
    const material = new THREE.MeshBasicMaterial();
    material.name = name;
    material.visible = false;
    this.ownedMaterials.add(material);
    return material;
  }
}
