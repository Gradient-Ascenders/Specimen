import * as THREE from 'three';
import { RoomFiveVentWaste } from './RoomFiveVentWaste.ts';
import { addRoomFiveCover } from './RoomFiveCover.ts';
import { addRoomFiveParkour } from './RoomFiveParkour.ts';
import type { DissolveTarget } from '../abilities/DissolveTarget.ts';
import type { DissolveSystem } from '../abilities/DissolveSystem.ts';
import type { LevelTwoRoomTwoOccupant } from './LevelTwoRoomTwoGreybox.ts';
import { GreyboxRoomBuilder } from './GreyboxRoomBuilder.ts';
import { CultivationRoomFiveController, type RoomFiveCheckpoint } from './CultivationRoomFiveController.ts';
import { RoomFiveSewer, SEWER_CONTROL_SPAWN, SEWER_FLOOR_Y } from './RoomFiveSewer.ts';
import type { SecurityNetwork } from '../puzzle/SecurityNetworkController.ts';

export const ROOM_FIVE_NETWORK_COLOURS = { red: 0xff475c, blue: 0x245bff, green: 0x61db65 } as const;
export const ROOM_FIVE_SAFE_STATIONS = [
  [-12, 10, 23], [-12, 13, 35], [-12, 17, 49], [-3, 20, 62],
  [11, 23, 60], [11, 26, 45], [0, 29, 37],
] as const;
export const ROOM_FIVE_ROUTE_NETWORKS: readonly SecurityNetwork[] = ['red', 'blue', 'green', 'red', 'blue', 'green'];
export const ROOM_FIVE_BOB_START = new THREE.Vector3(-12, 10.66, 23);
export const ROOM_FIVE_GOOP_CONTROLS = SEWER_CONTROL_SPAWN;
export const ROOM_FIVE_VOLT_SPAWN = new THREE.Vector3(1, .66, 64);

/** Authored room-local geometry. All interactive objects have stable Blender-friendly names. */
export class LevelTwoRoomFiveGreybox {
  readonly builder = new GreyboxRoomBuilder('cultivation-room-5');
  readonly root = this.builder.root;
  readonly collisionMeshes = this.builder.collisionMeshes;
  readonly controller = new CultivationRoomFiveController();
  readonly solubleTargetMeshes: THREE.Mesh[] = [];
  readonly dynamicCollisionMeshes: THREE.Mesh[] = [];
  private readonly acidVentPatches: RoomFiveVentWaste[] = [];
  readonly controls = new Map<SecurityNetwork, THREE.Mesh>();
  readonly lever: THREE.Mesh;
  private readonly reunionFloors: THREE.Mesh[] = [];
  readonly terminal: THREE.Mesh;
  readonly reunionDoor: THREE.Mesh;
  readonly exitDoor: THREE.Mesh;
  readonly shortcut: THREE.Mesh;
  private readonly shortcutEntry: THREE.Mesh;
  readonly pod = new THREE.Group();
  readonly captiveVolt: THREE.Mesh;
  readonly brokenCore: THREE.Mesh;
  private readonly glassPanels: THREE.Mesh[] = [];
  private readonly local = new THREE.Vector3();
  private readonly bobLocal = new THREE.Vector3();
  private readonly goopLocal = new THREE.Vector3();
  private readonly subscriptions: Array<() => void> = [];
  private targets: readonly DissolveTarget[] = [];
  private readonly resetControls: DissolveTarget[] = [];
  private readonly contactOrder = new Map<DissolveTarget, number>();
  private nextContactOrder = 0;
  private appliedContactOrder = 0;
  readonly sewer: RoomFiveSewer;
  private readonly requestFailure: (failure: { roomId: 5; slimeId: 'bob' | 'goop'; reason: 'radiation' }) => void;
  constructor(requestFailure: (failure: { roomId: 5; slimeId: 'bob' | 'goop'; reason: 'radiation' }) => void) {
    this.requestFailure = requestFailure;
    const b = this.builder, m = b.materials;
    const box = (name: string, size: readonly [number, number, number], position: readonly [number, number, number], material: THREE.Material = m.wall, sticky = false) => {
      const mesh = b.addCollider({ name: `room-5-${name}`, size, position, material,
        surfaceTag: sticky ? 'sticky' : 'default', textureRole: sticky ? 'sticky-wall-tile' : undefined });
      mesh.userData.roomId = 5; return mesh;
    };
    const duct = (name: string, x: number, z: number, length: number) => {
      box(`${name}-floor`, [2.2, .4, length], [x, 0, z], m.duct);
      box(`${name}-roof`, [2.8, .3, length], [x, 2.55, z], m.duct);
      for (const side of [-1, 1]) box(`${name}-side-${side}`, [.3, 2.2, length], [x + side * 1.25, 1.3, z], m.duct);
    };
    duct('shared-vent', 0, 4, 8);
    box('fork-floor', [54.2, .4, 2.2], [14, 0, 9.1], m.duct);
    box('fork-roof', [54.8, .3, 2.8], [14, 2.55, 9.1], m.duct);
    box('fork-front-left', [12, 2.2, .3], [-7.1, 1.3, 7.85], m.duct);
    box('fork-front-right', [40, 2.2, .3], [21.1, 1.3, 7.85], m.duct);
    box('fork-rear', [49.8, 2.2, .3], [14, 1.3, 10.35], m.duct);
    for (const x of [-13.25, 41.25]) box(`fork-end-${x}`, [.3, 2.2, 2.5], [x, 1.3, 9.1], m.duct);
    box('bob-shaft-floor', [2.2, .4, 7.8], [-12, 0, 14.1], m.duct);
    for (const x of [-13.25, -10.75]) {
      box(`bob-shaft-side-${x}`, [.3, 10, 7.8], [x, 5, 14.1], m.duct);
      box(`bob-shaft-upper-side-${x}`, [.3, 2.4, 7.55], [x, 11.2, 13.975], m.duct);
    }
    box('bob-shaft-climb', [2.2, 10, .3], [-12, 5, 18], m.sticky, true);
    box('bob-shaft-front-upper', [2.2, 10, .3], [-12, 7.4, 15.65], m.duct);
    box('bob-shaft-roof', [2.8, .3, 2.15], [-12, 12.55, 16.675], m.duct);
    box('bob-approach-roof', [2.8, .3, 5.3], [-12, 2.55, 12.85], m.duct);
    box('bob-shaft-landing-tile', [2.2, .3, 2.35], [-12, 9.85, 19.325], m.floor);
    for (const x of [-13.55, -10.45]) box(`bob-exit-shoulder-${x}`, [.9, 3.5, .5], [x, 11.75, 18], m.duct);
    box('bob-exit-header', [2.2, 1.1, .5], [-12, 12.95, 18], m.duct);
    // Flat dead-end duct. Only its final floor panel is missing, exposing the sewer below.
    duct('goop-vent', 40, 14.55, 8.7);
    box('goop-drop-roof', [2.8, .3, 2.2], [40, 2.55, 20], m.duct);
    box('goop-drop-end', [2.8, 2.2, .3], [40, 1.3, 21.25], m.duct);
    for (const x of [38.75, 41.25]) box(`goop-drop-side-${x}`, [.3, 2.2, 2.2], [x, 1.3, 20], m.duct);
    // No vertical pipe below the opening: the player drops freely into the vaulted sewer.
    // Seal only the ceiling void; nothing hangs down into the sewer itself.
    for (const x of [38.725, 41.275]) box(`drop-ceiling-seal-x-${x}`, [.35, 2.6, 2.9], [x, -1.1, 20], m.duct);
    for (const z of [18.725, 21.275]) box(`drop-ceiling-seal-z-${z}`, [2.2, 2.6, .35], [40, -1.1, z], m.duct);
    for (const x of [38.55, 41.45]) box(`drop-ceiling-flange-x-${x}`, [.7, .25, 3.6], [x, -2.2, 20], m.duct);
    for (const z of [18.55, 21.45]) box(`drop-ceiling-flange-z-${z}`, [2.2, .25, .7], [40, -2.2, z], m.duct);
    for (let i = 0; i < 6; i++) {
      this.acidVentPatches.push(new RoomFiveVentWaste(18 + i * 2, 9.1 + (i % 2 ? .15 : -.15),
        .7 + i * .2, .35 + i * .28, i));
    }
    this.acidVentPatches.push(new RoomFiveVentWaste(35, 9.1, 12.2, 2.2, 6, true),
      new RoomFiveVentWaste(40, 14.55, 2.2, 8.7, 7, true));
    for (const [i, patch] of this.acidVentPatches.entries()) b.root.add(patch.createMesh(m.acid, i));
    this.sewer = new RoomFiveSewer(b);
    this.brokenCore = this.sewer.drone;
    this.reunionDoor = this.sewer.door;
    for (const [network, mesh] of this.sewer.controls) this.controls.set(network, mesh);
    this.solubleTargetMeshes.push(...this.sewer.targets);
    this.dynamicCollisionMeshes.push(...this.sewer.targets);
    // Tall chamber: acid catch floor prevents a downward shortcut onto safe parkour.
    // Goop's drop shaft is outside this chamber, so its acid bed stays continuous.
    const chamberAcid = m.acid.clone(); chamberAcid.emissiveIntensity = .12;
    box('chamber-acid-bed', [40, .5, 55], [0, -.3, 52.5], chamberAcid).userData.textureRole = 'acid-floor';
    box('chamber-acid-front', [40, .5, 9], [0, -.3, 20.5], chamberAcid).userData.textureRole = 'acid-floor';
    box('chamber-roof', [41, .5, 64], [0, 38.25, 48], m.support);
    box('chamber-west', [.5, 38, 64], [-20.25, 19, 48]);
    box('chamber-east', [.5, 38, 42], [20.25, 19, 37]);
    box('chamber-east-upper', [.5, 31.5, 22], [20.25, 22.25, 69]);
    box('chamber-back', [40, 38, .5], [0, 19, 80]);
    box('chamber-front-upper', [40, 24.5, .5], [0, 25.75, 18]);
    box('chamber-front-east', [30, 13.5, .5], [5, 6.75, 18]);
    box('chamber-front-west', [6, 13.5, .5], [-17, 6.75, 18]);
    for (let i = 0; i < ROOM_FIVE_SAFE_STATIONS.length; i++) {
      const [x, y, z] = ROOM_FIVE_SAFE_STATIONS[i];
      const covers: { x: number; z: number; colour: number; route: number }[] = [];
      // Directional blast baffles shelter the waiting point without boxing in
      // its jump exits or hiding Volt behind seven identical towers.
      for (const route of [i - 1, i]) {
        if (route < 0 || route >= ROOM_FIVE_ROUTE_NETWORKS.length) continue;
        const a = new THREE.Vector3(...ROOM_FIVE_SAFE_STATIONS[route]);
        const c = new THREE.Vector3(...ROOM_FIVE_SAFE_STATIONS[route + 1]);
        const along = c.clone().sub(a); along.y = 0; along.normalize();
        const drone = a.lerp(c, .5).add(new THREE.Vector3(along.z, 0, -along.x).multiplyScalar(7));
        const dx = drone.x - x, dz = drone.z - z, length = Math.hypot(dx, dz);
        const nx = dx / length, nz = dz / length;
        covers.push({ x: nx, z: nz, colour: ROOM_FIVE_NETWORK_COLOURS[ROOM_FIVE_ROUTE_NETWORKS[route]], route });
      }
      addRoomFiveCover(b, i, [x, y, z], covers);
      if (i === ROOM_FIVE_SAFE_STATIONS.length - 1) break;
    }
    addRoomFiveParkour(b);
    // Leave the final safe platform away from the cage and patrol arena.
    box('release-quiet-walk', [3, .5, 8], [0, 28.75, 30.5], m.support);
    b.addLight('room-5-release-wayfinding', [0, 32, 27], 0xffe3a0, 40, 8);
    this.lever = box('manual-release-lever', [.16, 1, .16], [0, 30, 27.35], m.cable);
    this.lever.geometry.translate(0, .5, 0);
    const grip = b.addVisualBox({ name: 'room-5-release-lever-grip', size: [.85, .22, .25],
      position: [0, 1, 0], material: m.platform });
    this.lever.add(grip);
    box('release-pedestal', [1.3, 1.7, .35], [0, 30, 26.95], m.support);
    this.dynamicCollisionMeshes.push(this.lever);
    this.pod.name = 'room-5-volt-containment'; this.pod.position.set(0, 25, 49); this.root.add(this.pod);
    const podBox = (name: string, size: readonly [number, number, number], position: readonly [number, number, number], material: THREE.Material) => {
      const mesh = box(name, size, position, material); this.pod.add(mesh); this.dynamicCollisionMeshes.push(mesh); return mesh;
    };
    podBox('pod-base', [6, .4, 6], [0, -2, 0], m.containment);
    podBox('pod-cap', [6, .4, 6], [0, 2, 0], m.containment);
    for (const side of [-1, 1]) {
      this.glassPanels.push(podBox(`pod-glass-x-${side}`, [.12, 4, 6], [side * 3, 0, 0], m.glass));
      this.glassPanels.push(podBox(`pod-glass-z-${side}`, [6, 4, .12], [0, 0, side * 3], m.glass));
      b.addVisualBox({ name: `room-5-pod-cable-${side}`, size: [.2, 11, .2], position: [side * 2.5, 32.5, 49], material: m.cable });
    }
    this.captiveVolt = new THREE.Mesh(new THREE.SphereGeometry(.65, 20, 12), new THREE.MeshStandardMaterial({ color: 0xffe85c, emissive: 0xffd21a, emissiveIntensity: 1.5 }));
    this.captiveVolt.name = 'room-5-captive-volt'; this.pod.add(this.captiveVolt);
    const voltGlow = b.addLight('room-5-volt-glow', [0, 0, 0], 0xffdc35, 50, 12);
    this.pod.add(voltGlow);
    voltGlow.castShadow = true; voltGlow.shadow.mapSize.set(512, 512);
    voltGlow.shadow.bias = -.0002; voltGlow.shadow.normalBias = .025;
    voltGlow.shadow.camera.near = .2;
    // Volt and the transparent glass must not eclipse the light inside the pod.
    this.captiveVolt.castShadow = false;
    // Ground-level reunion route, separate from the upper puzzle route.
    this.reunionFloors.push(box('reunion-floor', [32, .5, 12], [4, -4, 65], m.floor));
    this.reunionFloors.push(box('reunion-east-landing', [8, .5, 5], [24, -4, 61.5], m.floor));
    for (const floor of this.reunionFloors) floor.visible = false;
    this.dynamicCollisionMeshes.push(...this.reunionFloors);
    box('reunion-east', [.4, 7, 14], [28, 3.5, 65], m.wall);
    box('reunion-roof', [8, .4, 12], [24, 6.5, 65], m.wall);
    this.exitDoor = box('unpowered-exit-door', [5, 5, .35], [16, 2.5, 71], m.containment);
    box('exit-wall-left', [25.5, 7, .4], [.75, 3.5, 71], m.wall);
    box('exit-wall-right', [9.5, 7, .4], [23.25, 3.5, 71], m.wall);
    box('exit-header', [5, 2, .4], [16, 6, 71], m.wall);
    box('exit-floor', [8, .5, 8], [16, -.25, 75], m.floor);
    this.terminal = box('volt-conductive-terminal', [2, .35, 2], [16, .175, 68], m.etch);
    this.terminal.userData.authoringRole = 'volt-electrical-terminal';
    this.shortcut = box('rescue-shortcut-catwalk', [2, .3, 33], [-4.5, 40, 46.5], m.support);
    this.shortcutEntry = box('rescue-shortcut-entry', [2, .3, 2], [-2.5, 40, 31], m.support);
    this.dynamicCollisionMeshes.push(this.shortcut, this.shortcutEntry);
    this.dynamicCollisionMeshes.push(this.reunionDoor, this.exitDoor);
  }
  bindDissolveTargets(targets: readonly DissolveTarget[]): void {
    this.targets = targets.filter(target => target.mesh.userData.roomId === 5);
  }
  bindBurns(system: DissolveSystem): void {
    this.subscriptions.push(system.events.on('burnStarted', ({ target }) => {
      if (target.mesh === this.brokenCore) this.controller.hitBrokenDrone();
      for (const mesh of this.controls.values()) if (mesh === target.mesh) {
        this.contactOrder.set(target, ++this.nextContactOrder); break;
      }
    }));
    // Reset reusable contacts only AFTER the coordinator removes their completed burn.
    this.subscriptions.push(system.events.on('burnCompleted', ({ target }) => {
      for (const [network, mesh] of this.controls) if (mesh === target.mesh) {
        const order = this.contactOrder.get(target) ?? 0;
        if (order >= this.appliedContactOrder) {
          this.appliedContactOrder = order; this.controller.security.toggle(network);
        }
        this.resetControls.push(target); return;
      }
      if (target.mesh === this.brokenCore && this.controller.brokenDroneHits < 3) {
        // The completed reaction has already left the coordinator's active set.
        // Rearm without a hidden frame; permanent damage belongs to the room controller.
        target.reset();
      }
    }));
  }
  update(dt: number, occupants: readonly LevelTwoRoomTwoOccupant[]): void {
    for (const target of this.resetControls) target.reset(); this.resetControls.length = 0;
    let usingLever = false;
    for (const occupant of occupants) {
      this.local.set(occupant.position.x, occupant.position.y, occupant.position.z); this.root.worldToLocal(this.local);
      if (occupant.id === 'bob') {
        this.bobLocal.copy(this.local);
        usingLever = Math.abs(this.local.x) < .9 && Math.abs(this.local.y - 29.66) < .8
          && this.local.z > 27.4 && this.local.z < 28.7;
        if (this.isAcidAt(occupant.position)) this.requestFailure({ roomId: 5, slimeId: 'bob', reason: 'radiation' });
      } else this.goopLocal.copy(this.local);
    }
    this.controller.update(dt,
      this.goopLocal.distanceToSquared(this.brokenCore.position) < 9 * 9,
      this.bobLocal.distanceToSquared(ROOM_FIVE_BOB_START) < 5 * 5,
      this.goopLocal.distanceToSquared(ROOM_FIVE_GOOP_CONTROLS) < 5 * 5, usingLever);
    this.syncPresentation(dt);
  }
  isAtVoltTerminal(position: { readonly x: number; readonly y: number; readonly z: number }): boolean {
    this.local.set(position.x, position.y, position.z); this.root.worldToLocal(this.local);
    const p = this.local;
    return p.x > 14.5 && p.x < 17.5 && p.y >= 0 && p.y < 1.8 && p.z > 66.5 && p.z < 69.5;
  }
  isAtFinalExit(position: { readonly x: number; readonly y: number; readonly z: number }): boolean {
    this.local.set(position.x, position.y, position.z); this.root.worldToLocal(this.local);
    const p = this.local;
    return p.x > 12 && p.x < 20 && p.y >= 0 && p.y < 3 && p.z > 72 && p.z < 79;
  }
  isAcidAt(position: { readonly x: number; readonly y: number; readonly z: number }): boolean {
    this.local.set(position.x, position.y, position.z); this.root.worldToLocal(this.local);
    const p = this.local;
    const acidDuct = p.x > 37 && p.x < 43 && p.z > 16 && p.z < 140 && p.y < SEWER_FLOOR_Y + .6;
    const dryReunion = (this.controller.releasing || this.controller.rescued)
      && p.x > -12 && p.x < 28 && p.y >= 0 && p.y < 3 && p.z >= 59 && p.z <= 71;
    const dryExit = p.x >= 12 && p.x <= 20 && p.y >= 0 && p.y < 3 && p.z > 71 && p.z < 79;
    const contaminatedVent = p.y < .7 && p.y > -.5 && this.acidVentPatches.some(patch => patch.contains(p.x, p.z));
    return contaminatedVent || acidDuct || (Math.abs(p.x) < 20 && p.z > 18 && p.z < 80 && p.y < .6 && !dryReunion && !dryExit);
  }
  syncPresentation(dt = 1): void {
    const c = this.controller;
    this.lever.rotation.x = .3 + c.leverProgress * 1.5;
    for (const floor of this.reunionFloors) {
      floor.visible = c.releasing || c.rescued;
      floor.position.y = floor.visible ? -.25 : -4;
    }
    this.sewer.sync(c.security, dt);
    const t = Math.min(1, c.releaseElapsed / 4);
    this.pod.position.set(0, 25 - 22.35 * t, 49 + 15 * t);
    for (const panel of this.glassPanels) {
      const side = panel.name.endsWith('-1') && !panel.name.endsWith('--1') ? 1 : -1;
      if (panel.name.includes('-x-')) panel.position.x = side * (3 + Math.max(0, t - .6) * 8);
      else panel.position.z = side * (3 + Math.max(0, t - .6) * 8);
    }
    this.captiveVolt.visible = !c.rescued;
    this.reunionDoor.position.y = -8.7 + 5.5 * Math.max(0, (t - .75) / .25);
    this.exitDoor.position.y = 2.5 + (c.exitPowered ? 5.5 : 0);
    this.shortcut.position.y = c.rescued ? 28.75 : 40;
    this.shortcutEntry.position.y = this.shortcut.position.y;
  }
  copyCheckpointSpawn(slimeId: 'bob' | 'goop' | 'volt', target: THREE.Vector3): THREE.Vector3 {
    if (this.controller.checkpoint === 'rescued') {
      target.set(slimeId === 'bob' ? 5 : slimeId === 'goop' ? 8 : 1, .66, 65);
    } else if (this.controller.checkpoint === 'controls') {
      target.copy(slimeId === 'bob' ? ROOM_FIVE_BOB_START : ROOM_FIVE_GOOP_CONTROLS);
    } else target.set(slimeId === 'bob' ? -1 : 1, .86, 9.1);
    return this.root.localToWorld(target);
  }
  restoreCheckpoint(checkpoint: RoomFiveCheckpoint): void {
    this.controller.reset(checkpoint);
    if (checkpoint !== 'split') {
      const core = this.targets.find(target => target.mesh === this.brokenCore);
      if (core && !core.completed) core.advance(core.dissolveDurationSeconds);
    }
    this.syncPresentation();
  }
  reset(): void {
    this.resetControls.length = 0; this.controller.reset();
    this.contactOrder.clear(); this.nextContactOrder = 0; this.appliedContactOrder = 0;
    for (const target of this.targets) target.reset();
    this.syncPresentation();
  }
  dispose(): void { for (const unsubscribe of this.subscriptions) unsubscribe(); this.builder.dispose(); }
}
