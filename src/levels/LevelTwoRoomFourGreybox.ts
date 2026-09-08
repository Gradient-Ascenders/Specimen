import * as THREE from 'three';
import { GreyboxRoomBuilder } from './GreyboxRoomBuilder.ts';
import { CultivationRoomFourController, ROOM_FOUR_SPAWNS } from './CultivationRoomFourController.ts';
import { ProximityShutterDoor } from '../puzzle/ProximityShutterDoor.ts';
import type { SphereTriggerOccupant } from '../puzzle/BoxTriggerSensor.ts';

export const ROOM_FOUR_ANCHORS = [[-3, 13], [0, 13], [3, 13], [-3.5, 10],
  [3.5, 10], [-3, 7], [0, 7], [3, 7]] as const;

/** Static local arena; recycled shaft scenery conveys the authoritative descent. */
export class LevelTwoRoomFourGreybox {
  readonly builder = new GreyboxRoomBuilder('cultivation-room-4');
  readonly root = this.builder.root;
  readonly collisionMeshes = this.builder.collisionMeshes;
  readonly controller = new CultivationRoomFourController();
  readonly entrance = new ProximityShutterDoor({ id: 'room-4-boarding', widthMetres: 4,
    heightMetres: 4.6, proximityDepthMetres: 12 });
  readonly boardingWall: THREE.Mesh;
  readonly boardingGuard: THREE.Mesh;
  readonly arrivalWall: THREE.Mesh;
  readonly cableRoots: THREE.Group[] = [];
  readonly solubleTargetMeshes: THREE.Mesh[] = [];
  readonly shield: THREE.Mesh;
  readonly movingEntranceMeshes: THREE.Mesh[] = [];
  private readonly entrancePieces: { mesh: THREE.Mesh; y: number }[] = [];
  private readonly modules: THREE.Group[] = [];
  private readonly local = new THREE.Vector3();

  constructor() {
    const b = this.builder, m = b.materials;
    const box = (name: string, size: [number, number, number], position: [number, number, number], material = m.wall) =>
      b.addCollider({ name: `room-4-${name}`, size, position, material });
    box('boarding-floor', [10, .4, 5], [0, 0, 2.5]);
    box('lift-floor', [10, .8, 10], [0, -.2, 10], m.support);
    // Raised machinery deck and continuous guide rails echo Containment's lift.
    b.addVisualBox({ name: 'room-4-lift-tread', size: [9.6, .04, 9.6], position: [0, .22, 10], material: m.duct });
    for (const x of [-4.65, 4.65]) {
      b.addVisualBox({ name: `room-4-deck-warning-edge-${x}`, size: [.2, .05, 9.5], position: [x, .25, 10], material: m.platform });
      for (const z of [6, 14]) {
        box(`guide-rail-${x}-${z}`, [.25, 44, .3], [x, 22, z], m.support);
        b.addVisualBox({ name: `room-4-carriage-${x}-${z}`, size: [.5, 1.1, .65], position: [x, -.2, z], material: m.containment });
      }
    }
    // Tall shaft walls stop charged jumps escaping over the reinforced rails.
    box('west-shaft', [.4, 52, 22], [-5.2, 20, 11], m.duct);
    box('east-shaft', [.4, 52, 22], [5.2, 20, 11], m.duct);
    for (const z of [0]) {
      for (const x of [-3.7, 3.7]) box(`partition-${z}-${x}`, [2.6, 44, .4], [x, 22, z], m.duct);
      box(`header-${z}`, [4.8, 39.05, .4], [0, 24.475, z], m.duct);
    }
    this.boardingWall = box('boarding-shaft-wall', [10, 200, .4], [0, -100, 4.9], m.duct);
    this.boardingGuard = box('boarding-safety-guard', [10, 4.5, .22], [0, -2.1, 5.23], m.support);
    this.movingEntranceMeshes.push(this.boardingGuard);
    for (const x of [-3.05, 3.05]) box(`destination-wall-${x}`, [3.9, 44, .4], [x, 22, 15], m.duct);
    box('destination-vent-header', [2.2, 41.6, .4], [0, 23.2, 15], m.duct);
    this.arrivalWall = box('destination-vent-shutter', [2.2, 2.2, .4], [0, 1.3, 15.025], m.duct);
    box('winch-roof', [10, .4, 10], [0, 44.4, 10], m.duct);
    for (const [i, [x, z]] of ROOM_FOUR_ANCHORS.entries()) {
      b.addVisualBox({ name: `room-4-roof-winch-${i}`, size: [.9, .5, .9], position: [x, 44.05, z], material: m.support });
    }
    for (const x of [-4.9, 4.9]) box(`rail-${x}`, [.18, 1.2, 10], [x, .8, 10], m.platform);
    b.addVisualBox({ name: 'room-4-underdeck-motor', size: [3, 1.2, 3], position: [0, -1.2, 10], material: m.containment });
    box('boarding-ceiling', [10, .3, 5], [0, 6.5, 2.5]);
    // Fixed doorway at Room 3's exit, five metres behind the lift deck.
    this.entrance.root.position.z = 0;
    this.root.add(this.entrance.root);
    this.collisionMeshes.push(this.entrance.collisionMesh);
    this.shield = box('arrival-shield', [10, .35, 9.5], [-11, 11.6, 10], m.support);
    for (const mesh of this.collisionMeshes) {
      if (mesh.name === 'room-4-boarding-floor' || mesh.name === 'room-4-boarding-ceiling' ||
        mesh.name.startsWith('room-4-partition-') || mesh.name.startsWith('room-4-header-')) {
        this.entrancePieces.push({ mesh, y: mesh.position.y }); this.movingEntranceMeshes.push(mesh);
      }
    }
    for (let i = 0; i < 8; i++) {
      const group = new THREE.Group(); group.name = `room-4-shaft-module-${i}`;
      for (const x of [-4.85, 4.85]) {
        const beam = b.addVisualBox({ name: `room-4-shaft-beam-${i}-${x}`, size: [.22, .35, 9.5],
          position: [x, 0, 10], material: m.platform });
        group.add(beam);
        const pipe = b.addVisualBox({ name: `room-4-shaft-pipe-${i}-${x}`, size: [.2, 7.8, .2],
          position: [x, 3.9, 13.8], material: m.support });
        group.add(pipe);
      }
      this.modules.push(group); this.root.add(group);
    }
    for (let i = 0; i < ROOM_FOUR_SPAWNS.length; i++) {
      const group = new THREE.Group(); group.name = `room-4-drone-anchor-${i + 1}`;
      const [x, z] = ROOM_FOUR_ANCHORS[ROOM_FOUR_SPAWNS[i].anchor];
      group.position.set(x, 30, z); group.visible = false;
      const cable = b.addVisualBox({ name: `room-4-cable-${i + 1}`, size: [.28, 6, .28],
        position: [0, 3.5, 0], material: m.cable, textureRole: 'soluble-cable' });
      Object.assign(cable.userData, { roomId: 4, soluble: true, solubleId: cable.name,
        dissolveDurationSeconds: .8, dissolveCollisionDisableProgress: .95,
        textureRole: 'soluble-cable' });
      group.add(cable); this.root.add(group);
      this.cableRoots.push(group); this.solubleTargetMeshes.push(cable);
    }
    b.addLight('room-4-lift-light', [0, 5, 10], 0xc8eaff, 65, 18);
    b.addLight('room-4-boarding-light', [0, 4, 2], 0xc8eaff, 22, 10);
    this.reset();
  }

  update(dt: number, occupants: readonly SphereTriggerOccupant[]): void {
    let bob = false, goop = false;
    for (const occupant of occupants) {
      this.local.set(occupant.position.x, occupant.position.y, occupant.position.z); this.root.worldToLocal(this.local);
      const r = occupant.radiusMetres;
      const inside = Math.abs(this.local.x) + r <= 4.95 && this.local.z - r > 5.35 &&
        this.local.z + r < 14.65 && this.local.y >= .2 && this.local.y < 5;
      if (occupant.id === 'bob') bob = inside;
      if (occupant.id === 'goop') goop = inside;
    }
    this.controller.update(dt, bob, goop);
    const travel = this.controller.progress * 120;
    this.entrance.root.position.y = travel;
    this.entrance.update(dt, occupants);
    for (const piece of this.entrancePieces) piece.mesh.position.y = piece.y + travel;
    this.boardingWall.position.y = -100 + travel;
    this.boardingGuard.position.y = -2.1 + 4.6 * Math.min(1, this.controller.readModel.confirmation / 1.5);
    // Passing the end of the shaft reveals an open landing, without a door
    // standing on the elevator deck. This is part of the scrolling shaft.
    this.arrivalWall.position.y = 1.3 + 2.4 * Math.min(1, this.controller.readModel.arrivalElapsed / 1.5);
    const arrived = this.controller.readModel.elapsed >= 60;
    this.shield.position.x = arrived ? -11 * (1 - Math.min(1, this.controller.readModel.arrivalElapsed / .8)) : -11;
    for (let i = 0; i < this.modules.length; i++) {
      this.modules[i].position.y = ((i * 8 + travel) % 64) - 8;
    }
  }
  reset(): void {
    this.controller.reset(); this.entrance.reset();
    this.entrance.root.position.y = 0;
    for (const piece of this.entrancePieces) piece.mesh.position.y = piece.y;
    this.boardingWall.position.y = -100;
    this.boardingGuard.position.y = -2.1;
    this.arrivalWall.position.y = 1.3;
    this.shield.position.x = -11;
    for (let i = 0; i < this.modules.length; i++) this.modules[i].position.y = i * 8 - 8;
    for (const root of this.cableRoots) { root.visible = false; root.position.y = 30; }
    this.syncCables();
  }
  syncCables(): void {
    for (let i = 0; i < this.cableRoots.length; i++) {
      const bottom = .55;
      const length = 44 - this.cableRoots[i].position.y - bottom;
      const cable = this.solubleTargetMeshes[i];
      cable.scale.y = length / 6;
      cable.position.y = bottom + length / 2;
    }
  }
  dispose(): void { this.entrance.dispose(); this.builder.dispose(); }
}
