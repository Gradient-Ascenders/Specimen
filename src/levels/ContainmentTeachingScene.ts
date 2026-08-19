import * as THREE from 'three';

import type { SurfaceTag } from '../physics/SurfaceRegistry';
import {
  SlimeVisual,
  type SlimeVisualDiagnostics,
  type SlimeVisualLaunch,
  type SlimeVisualState,
  type Vector3State,
} from '../render/slime/SlimeVisual';

interface BoxOptions {
  readonly name: string;
  readonly size: readonly [number, number, number];
  readonly position: readonly [number, number, number];
  readonly material: THREE.Material;
  readonly surfaceTag?: SurfaceTag;
  readonly rotationX?: number;
}

const ROOM_2_CENTRE_Z = 38;
const SPAWN_POSITION = new THREE.Vector3(0, 0.5, -1.8);
const ROOM_2_RECOVERY_POSITION = new THREE.Vector3(-9, 0.5, 31);

/**
 * Level 1's first authored grey-box. It follows the Room 1/Room 2 teaching
 * layouts while keeping collision deliberately primitive and inspectable.
 */
export class ContainmentTeachingScene {
  readonly root = new THREE.Group();

  private readonly collisionMeshList: THREE.Mesh[] = [];
  private readonly slimeVisual: SlimeVisual;
  private recoveryDelay = 0;
  private recoveryCallback: (() => void) | undefined;

  constructor() {
    this.root.name = 'containment-climb-and-bounce-greybox';

    const materials = {
      floor: this.material(0xaeb6ba),
      wall: this.material(0xdadfe1),
      support: this.material(0x424a50),
      sticky: this.material(0x9fae38, 0x263100),
      platform: this.material(0xd6a928, 0x443300),
      locked: this.material(0x8b3030, 0x320505),
      exit: this.material(0x62bf83, 0x0a3018),
      duct: this.material(0x444a4d),
      glass: new THREE.MeshStandardMaterial({
        color: 0x9ee7e4,
        emissive: 0x163d42,
        emissiveIntensity: 0.2,
        transparent: true,
        opacity: 0.28,
        roughness: 0.18,
        metalness: 0.15,
      }),
      egg: this.material(0x70c8ff, 0x063b63),
    };

    this.addRoomOne(materials);
    this.addVentTransition(materials);
    this.addRoomTwo(materials);
    this.addReferenceMarkers(materials.exit);

    this.slimeVisual = new SlimeVisual({ radiusMetres: 0.45 });
    this.root.add(this.slimeVisual.mesh);
    this.resetProbe();
  }

  get collisionMeshes(): readonly THREE.Mesh[] {
    return this.collisionMeshList;
  }

  get slimeDiagnostics(): SlimeVisualDiagnostics {
    return this.slimeVisual.diagnostics;
  }

  copySpawnPosition(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(SPAWN_POSITION);
  }

  copyRecoveryPosition(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(ROOM_2_RECOVERY_POSITION);
  }

  setProbePosition(position: Vector3State): void {
    this.slimeVisual.setPosition(position);
  }

  setProbeYaw(yawRadians: number): void {
    this.slimeVisual.mesh.rotation.set(0, yawRadians, 0);
  }

  presentProbe(): void {
    this.slimeVisual.present();
  }

  update(deltaSeconds: number, visualState?: SlimeVisualState): void {
    if (visualState) this.slimeVisual.update(deltaSeconds, visualState);
    if (this.recoveryDelay <= 0) return;

    this.recoveryDelay -= deltaSeconds;
    if (this.recoveryDelay > 0) return;

    this.resetProbe();
    this.recoveryCallback?.();
    this.recoveryCallback = undefined;
  }

  resetProbe(): void {
    this.recoveryDelay = 0;
    this.slimeVisual.setPosition(SPAWN_POSITION);
    this.slimeVisual.reset();
  }

  simulateFall(onRecovered: () => void): void {
    this.slimeVisual.setPosition(ROOM_2_RECOVERY_POSITION);
    this.recoveryCallback = onRecovered;
    this.recoveryDelay = 0.7;
  }

  dispose(): void {
    this.slimeVisual.dispose();
    this.root.removeFromParent();
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) {
        return;
      }
      object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) material.dispose();
    });
    this.collisionMeshList.length = 0;
    this.root.clear();
  }

  onSlimeLanding(
    normalWorld: Vector3State,
    impactSpeedMetresPerSecond: number,
  ): void {
    this.slimeVisual.onLanding(normalWorld, impactSpeedMetresPerSecond);
  }

  onSlimeLaunch(launch: SlimeVisualLaunch): void {
    this.slimeVisual.onLaunch(launch);
  }

  private addRoomOne(materials: Record<string, THREE.Material>): void {
    // 14 × 12 × 8 m sterile containment chamber.
    this.addCollider({ name: 'room-1-floor', size: [14, 0.4, 12], position: [0, -0.2, 0], material: materials.floor });
    this.addCollider({ name: 'room-1-rear-wall', size: [14, 8, 0.4], position: [0, 4, -6], material: materials.wall });
    this.addCollider({ name: 'room-1-west-wall', size: [0.4, 8, 12], position: [-7, 4, 0], material: materials.wall });
    this.addCollider({ name: 'room-1-east-wall', size: [0.4, 8, 12], position: [7, 4, 0], material: materials.wall });
    this.addCollider({ name: 'room-1-ceiling', size: [14, 0.3, 12], position: [0, 8, 0], material: materials.wall });

    // The north perimeter is split so the contaminated wall and open vent are
    // real authored collision surfaces instead of decorative overlays.
    // The sticky route is directly below the opening and continues into its
    // left interior wall. This makes the intended climb-to-vent route obvious
    // without a balancing ledge or a separate lateral transfer.
    this.addCollider({ name: 'room-1-north-clean-west', size: [1.2, 8, 0.4], position: [-6.4, 4, 6], material: materials.wall });
    this.addCollider({ name: 'room-1-vent-sticky-entry-wall', size: [2, 5.2, 0.4], position: [-4.8, 2.6, 6], material: materials.sticky, surfaceTag: 'sticky' });
    this.addCollider({ name: 'room-1-north-clean-centre', size: [4, 8, 0.4], position: [-1.8, 4, 6], material: materials.wall });
    this.addCollider({ name: 'room-1-north-clean-east', size: [6.8, 8, 0.4], position: [3.6, 4, 6], material: materials.wall });
    this.addCollider({ name: 'room-1-north-above-vent', size: [2, 1.2, 0.4], position: [-4.8, 7.4, 6], material: materials.wall });

    this.addVisualBox('room-1-locked-door-false-lead', [2.6, 3, 0.18], [4.3, 1.5, 5.76], materials.locked);
    this.addOpenVentFrame('room-1-vent-open-frame', [-4.8, 6, 5.74], materials.duct);

    this.addCollider({ name: 'room-1-containment-pedestal', size: [2.6, 1.1, 2.6], position: [0, 0.55, -0.5], material: materials.support });
    this.addVisualBox('room-1-glass-containment-box', [1.8, 1.9, 1.8], [0, 2.05, -0.5], materials.glass);
    const egg = new THREE.Mesh(new THREE.SphereGeometry(0.48, 20, 14), materials.egg);
    egg.name = 'room-1-specimen-egg';
    egg.scale.set(0.82, 1.18, 0.82);
    egg.position.set(0, 1.85, -0.5);
    this.root.add(egg);

    this.addCeilingLight('room-1-fluorescent-a', [-3.8, 7.7, -1.5]);
    this.addCeilingLight('room-1-fluorescent-b', [3.8, 7.7, -1.5]);
  }

  private addVentTransition(materials: Record<string, THREE.Material>): void {
    // A single, fully enclosed rising duct creates meaningful separation before
    // the Room 2 drop without becoming a maze. Its floor sections overlap so
    // there is never an invisible gap between the slope and its landing.
    this.addCollider({ name: 'duct-segment-a-floor', size: [2, 0.25, 7], position: [-4.8, 5.1, 9.5], material: materials.duct });
    this.addCollider({ name: 'duct-segment-a-roof', size: [2, 0.18, 7], position: [-4.8, 7.3, 9.5], material: materials.duct });
    // This side used to be sticky. It remains a solid duct wall so the route
    // is enclosed, but it is now ordinary metal and cannot be climbed.
    this.addDuctSide('-a-west', [-5.85, 6.2, 9.5], [0.18, 2.2, 7], materials.duct);
    this.addDuctSide('-a-east', [-3.75, 6.2, 9.5], [0.18, 2.2, 7], materials.duct);

    const rampAngle = -THREE.MathUtils.degToRad(26);
    this.addCollider({ name: 'duct-segment-b-ramp', size: [2, 0.25, 12], position: [-4.8, 7.85, 18.5], material: materials.duct, rotationX: rampAngle });
    this.addCollider({ name: 'duct-segment-b-roof', size: [2, 0.18, 12], position: [-4.8, 9.83, 17.54], material: materials.duct, rotationX: rampAngle });
    this.addCollider({ name: 'duct-segment-b-west-wall', size: [0.18, 2.2, 12], position: [-5.8, 8.84, 18.02], material: materials.duct, rotationX: rampAngle });
    this.addCollider({ name: 'duct-segment-b-east-wall', size: [0.18, 2.2, 12], position: [-3.8, 8.84, 18.02], material: materials.duct, rotationX: rampAngle });

    // The ramp's high end is 10.49m, exactly level with this short turning
    // bay. It is intentionally low enough to read as one connected route.
    this.addCollider({ name: 'duct-segment-c-floor', size: [7.2, 0.25, 2], position: [-5.7, 10.36, 24], material: materials.duct });
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
    // Split the rear wall around the elevated duct outlet. The opening aligns
    // with the final duct interior and lets the player fall onto Room 2's
    // bounce landing rather than colliding with an invisible sealed wall.
    this.addCollider({ name: 'room-2-rear-wall-west', size: [5.5, 18, 0.4], position: [-12.25, 9, ROOM_2_CENTRE_Z - 11], material: materials.wall });
    this.addCollider({ name: 'room-2-rear-wall-east', size: [22.3, 18, 0.4], position: [3.85, 9, ROOM_2_CENTRE_Z - 11], material: materials.wall });
    this.addCollider({ name: 'room-2-rear-wall-below-duct', size: [2.2, 10.2, 0.4], position: [-8.4, 5.1, ROOM_2_CENTRE_Z - 11], material: materials.wall });
    this.addCollider({ name: 'room-2-rear-wall-above-duct', size: [2.2, 5.2, 0.4], position: [-8.4, 15.4, ROOM_2_CENTRE_Z - 11], material: materials.wall });
    this.addCollider({ name: 'room-2-front-wall', size: [30, 18, 0.4], position: [0, 9, ROOM_2_CENTRE_Z + 11], material: materials.wall });
    // Zones 2-3: a forgiving four-jump zig-zag fills the lower chamber and
    // teaches progressively higher and longer charged jumps. Every miss lands
    // on the safe room floor, and the generous tops keep this a tutorial.
    this.addCollider({ name: 'room-2-platform-a-height-lesson', size: [4.5, 0.5, 3.5], position: [-5.5, 1.35, 34], material: materials.platform });
    this.addCollider({ name: 'room-2-platform-b-gap-lesson', size: [4, 0.5, 3.5], position: [-0.5, 2.55, 37], material: materials.platform });
    this.addCollider({ name: 'room-2-platform-c-side-jump', size: [3.8, 0.5, 3.5], position: [4.2, 3.85, 34], material: materials.platform });
    this.addCollider({ name: 'room-2-platform-d-sticky-launch', size: [4, 0.5, 4], position: [8.5, 5.2, 38.5], material: materials.platform });

    // Zone 4: the sticky patch is embedded in the east perimeter wall rather
    // than presented as a freestanding slab. Platform D leaves a deliberate
    // four-metre air gap so the player must jump, catch, and climb.
    this.addCollider({ name: 'room-2-sticky-catch-wall', size: [0.12, 6, 5], position: [14.73, 6, 42.5], material: materials.sticky, surfaceTag: 'sticky' });
    this.addCollider({ name: 'room-2-top-of-sticky-wall-ledge', size: [3.1, 0.35, 5.5], position: [13.25, 9.15, 42.5], material: materials.support });

    // Zone 5: three more readable upper-level jumps carry the route back
    // across the room to the obvious green exit.
    this.addCollider({ name: 'room-2-upper-step-a', size: [4, 0.4, 3.5], position: [8.8, 9.65, 44], material: materials.platform });
    this.addCollider({ name: 'room-2-upper-step-b', size: [3.6, 0.4, 3.4], position: [4.2, 10.15, 40.5], material: materials.platform });
    this.addCollider({ name: 'room-2-exit-balcony', size: [7, 0.5, 4], position: [0, 10.65, 46], material: materials.platform });
    this.addVisualBox('room-2-open-exit-door', [2.6, 3, 0.2], [0, 12.4, 47.9], materials.exit);

    // A short low route sits beneath the sticky-wall challenge. It both fills
    // the unused corner and lets a missed wall catch return to Platform D
    // without replaying the entire lower ascent.
    this.addCollider({ name: 'room-2-recovery-step-a', size: [3, 0.4, 3], position: [5.5, 0.65, 45.5], material: materials.support });
    this.addCollider({ name: 'room-2-recovery-step-b', size: [3, 0.4, 3], position: [8.5, 1.55, 45.5], material: materials.support });
    this.addCollider({ name: 'room-2-recovery-step-c', size: [3, 0.4, 3], position: [10.8, 2.55, 43.5], material: materials.support });
    this.addCollider({ name: 'room-2-recovery-step-d', size: [3, 0.4, 3], position: [10, 3.65, 40.5], material: materials.support });

    this.addCeilingLight('room-2-fluorescent-a', [-8, 16.7, 35]);
    this.addCeilingLight('room-2-fluorescent-b', [0, 16.7, 39]);
    this.addCeilingLight('room-2-fluorescent-c', [8, 16.7, 43]);
  }

  private addReferenceMarkers(exitMaterial: THREE.Material): void {
    const roomOneMarker = new THREE.Mesh(
      new THREE.TorusGeometry(0.72, 0.055, 10, 40),
      new THREE.MeshBasicMaterial({ color: 0x54e8e0 }),
    );
    roomOneMarker.name = 'room-1-safe-spawn-marker';
    roomOneMarker.position.set(SPAWN_POSITION.x, 0.04, SPAWN_POSITION.z);
    roomOneMarker.rotation.x = Math.PI / 2;
    this.root.add(roomOneMarker);

    const roomTwoMarker = new THREE.Mesh(
      new THREE.TorusGeometry(0.72, 0.055, 10, 40),
      exitMaterial,
    );
    roomTwoMarker.name = 'room-2-safe-recovery-marker';
    roomTwoMarker.position.set(ROOM_2_RECOVERY_POSITION.x, 0.04, ROOM_2_RECOVERY_POSITION.z);
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
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...options.size),
      options.material,
    );
    mesh.name = options.name;
    mesh.position.set(...options.position);
    mesh.rotation.x = options.rotationX ?? 0;
    mesh.userData.surfaceTag = options.surfaceTag ?? 'default';
    mesh.userData.sizeMetres = [...options.size];
    this.root.add(mesh);
    this.collisionMeshList.push(mesh);

    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: 0x24302f }),
    );
    outline.name = `${options.name}-outline`;
    outline.position.copy(mesh.position);
    outline.rotation.copy(mesh.rotation);
    this.root.add(outline);
  }

  private addVisualBox(name: string, size: readonly [number, number, number], position: readonly [number, number, number], material: THREE.Material): void {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.name = name;
    mesh.position.set(...position);
    this.root.add(mesh);
  }

  /** A frame, not a filled panel: the Room 1 vent must read as open. */
  private addOpenVentFrame(
    name: string,
    position: readonly [number, number, number],
    material: THREE.Material,
  ): void {
    const [x, y, z] = position;
    const width = 2.1;
    const height = 1.4;
    const thickness = 0.14;
    this.addVisualBox(`${name}-top`, [width, thickness, thickness], [x, y + height * 0.5, z], material);
    this.addVisualBox(`${name}-bottom`, [width, thickness, thickness], [x, y - height * 0.5, z], material);
    this.addVisualBox(`${name}-left`, [thickness, height, thickness], [x - width * 0.5, y, z], material);
    this.addVisualBox(`${name}-right`, [thickness, height, thickness], [x + width * 0.5, y, z], material);
  }

  private addCeilingLight(name: string, position: readonly [number, number, number]): void {
    const light = new THREE.PointLight(0xe7fff1, 10, 12);
    light.name = name;
    light.position.set(...position);
    this.root.add(light);
  }

  private material(colour: number, emissive = 0x000000): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: colour,
      emissive,
      emissiveIntensity: emissive === 0 ? 0 : 0.28,
      roughness: 0.7,
      metalness: 0.05,
    });
  }
}
