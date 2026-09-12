import * as THREE from 'three';
import type { GreyboxRoomBuilder } from './GreyboxRoomBuilder.ts';
import type { SecurityNetworkController, SecurityNetwork } from '../puzzle/SecurityNetworkController.ts';

import { addSewerDrainageEnd } from './SewerDrainageEnd.ts';
import { createRustedSewerDrone } from './RustedSewerDrone.ts';

export const SEWER_FLOOR_Y = -12;
export const SEWER_DRONE_POSITION = new THREE.Vector3(40, -11.7, 70);
export const SEWER_CONTROL_SPAWN = new THREE.Vector3(44, -10.54, 122);

/** Large vaulted sewer with a central liquid channel and two dry maintenance banks. */
export class RoomFiveSewer {
  readonly drone: THREE.Mesh;
  readonly eye: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  readonly door: THREE.Mesh;
  readonly controls = new Map<SecurityNetwork, THREE.Mesh>();
  readonly targets: THREE.Mesh[] = [];
  readonly reunionBridge: THREE.Mesh;
  private readonly controlRamp: THREE.Mesh;
  private readonly handles: { network: SecurityNetwork; pivot: THREE.Group; online: THREE.MeshStandardMaterial; offline: THREE.MeshStandardMaterial }[] = [];
  constructor(b: GreyboxRoomBuilder) {
    const m = b.materials;
    const box = (name: string, size: readonly [number, number, number], position: readonly [number, number, number], material: THREE.Material = m.duct) =>
      b.addCollider({ name: `room-5-${name}`, size, position, material });
    const bank = new THREE.MeshStandardMaterial({ color: 0x242a28, roughness: .95 });
    for (const x of [33.5, 46.5]) {
      const mesh = box(`sewer-bank-${x}`, [7, 1.3, 124], [x, -11.85, 78], bank);
      if (x === 46.5) mesh.userData.preciseMovementCorners = true;
    }
    // Short service ramps allow Goop to leave the lowered channel without an awkward jump.
    const slope = Math.atan2(.8, 3);
    this.controlRamp = box('sewer-bank-access-42-124', [Math.hypot(3, .8), .04, 4],
      [41.5 + Math.sin(slope) * .02, -11.6 - Math.cos(slope) * .02, 124], bank);
    this.controlRamp.rotation.z = slope;
    this.controlRamp.userData.preciseMovementCorners = true;
    this.reunionBridge = box('sewer-reunion-bridge', [6, .2, 4], [40, -11.3, 124], bank);
    this.reunionBridge.visible = false;
    box('sewer-acid-channel', [6, .5, 124], [40, -12.25, 78], m.acid).userData.textureRole = 'acid-floor';
    // Tangent panels approximate a half-cylinder and also provide solid camera/player collision.
    // A short crown opening receives the vertical duct; the left exit opens to maintenance.
    const bands = [[16, 18.5], [18.5, 21.5], [21.5, 122], [122, 126], [126, 140]];
    for (let band = 0; band < bands.length; band++) {
      const [start, end] = bands[band];
      for (let i = 0; i < 20; i++) {
        if (band === 1 && (i === 9 || i === 10)) continue;
        if (band === 3 && i >= 17) continue;
        const angle = (i + .5) * Math.PI / 20;
        const panel = box(`sewer-vault-${band}-${i}`, [2 * 10 * Math.tan(Math.PI / 40), .35, end - start],
          [40 + 10 * Math.cos(angle), -12 + 10 * Math.sin(angle), (start + end) / 2], m.duct);
        panel.rotation.z = angle + Math.PI / 2;
      }
    }
    // Reinforcing ribs emphasize the cylindrical silhouette without coplanar overlays.
    for (const z of [16, 32, 48, 64, 80, 96, 112, 128, 140]) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(9.7, .14, 6, 40, Math.PI), m.support);
      rib.name = `room-5-sewer-rib-${z}`; rib.position.set(40, -12, z); b.root.add(rib);
    }
    addSewerDrainageEnd(b, 16, -1); addSewerDrainageEnd(b, 140, 1);
    for (const x of [32, 48]) b.addVisualBox({ name: `room-5-sewer-pipe-${x}`, size: [.6, .6, 122], position: [x, -8.7, 78], material: m.cable });
    // No overhead wash: the distant drone and controls are the landmarks.

    const rusted = createRustedSewerDrone();
    this.drone = rusted.body; this.eye = rusted.eye;
    this.drone.name = 'room-5-broken-drone-exposed-core';
    this.drone.position.copy(SEWER_DRONE_POSITION); this.drone.rotation.set(.2, 0, 1.1);
    this.drone.userData.surfaceTag = 'default'; b.root.add(this.drone); b.collisionMeshes.push(this.drone);
    this.markTarget(this.drone, .15);
    // Separate maintenance route: back to the reunion area, not back through the sewer.
    box('maintenance-cross-floor', [5, .4, 4], [27.5, -11.4, 124], m.floor);
    box('maintenance-cross-roof', [5, .4, 4], [27.5, -6.4, 124]);
    box('maintenance-cross-back', [5.4, 5, .3], [27.5, -8.7, 126]);
    box('maintenance-cross-front', [3, 5, .3], [28.5, -8.7, 122]);
    this.door = box('maintenance-reunion-door', [.3, 5, 4], [30.1, -8.7, 124], m.containment);
    // Hide the rectangular door behind a continuation of the curved sewer skin.
    // The skin rises with the existing exit only after Volt is released.
    this.door.material = new THREE.MeshBasicMaterial({ visible: false });
    for (let i = 17; i < 20; i++) {
      const angle = (i + .5) * Math.PI / 20;
      const panel = b.addVisualBox({ name: `room-5-sewer-hidden-exit-skin-${i}`,
        size: [2 * 10 * Math.tan(Math.PI / 40), .35, 3.96],
        position: [40 + 10 * Math.cos(angle), -12 + 10 * Math.sin(angle), 124], material: m.duct });
      panel.rotation.z = angle + Math.PI / 2;
      panel.position.sub(this.door.position); this.door.add(panel);
    }
    box('maintenance-turn-floor', [4, .4, 4], [25, -11.4, 124], bank);
    const angle = Math.atan2(11.2, 58);
    const ramp = box('reunion-ramp', [4, .4, Math.hypot(59, 11.3931)], [25, -5.72, 93], m.support); ramp.rotation.x = angle;
    const roof = box('reunion-ramp-roof', [4.4, .3, Math.hypot(59, 11.3931)], [25, -2.1, 93]); roof.rotation.x = angle;
    box('reunion-ramp-side-left', [.3, 18, 62], [22.85, -5, 94]);
    box('reunion-ramp-side-right', [.3, 18, 59], [27.15, -5, 92.5]);
    box('maintenance-west-end', [.3, 5, 4], [22.85, -8.7, 124]);

    const coloursByNetwork = { red: 0xff475c, blue: 0x245bff, green: 0x61db65 };
    for (const [i, network] of (['red', 'blue', 'green'] as const).entries()) {
      const z = 118 + i * 4;
      b.addLight(`room-5-control-${network}-glow`, [46, -8.6, z], coloursByNetwork[network], 12, 7);
      box(`control-${network}-cabinet`, [.7, 3.15, 2.6], [47.55, -9.625, z], m.support);
      const panel = box(`control-${network}-face`, [.4, 2.7, 2.3], [47, -9.5, z], m.containment);
      panel.material = new THREE.MeshStandardMaterial({ color: 0x695244, roughness: .9, metalness: .4 });
      for (const y of [-10.65, -8.35]) for (const side of [-1, 1]) {
        const screw = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .05, 8), m.cable);
        screw.rotation.z = Math.PI / 2; screw.position.set(46.77, y, z + side * .95); b.root.add(screw);
      }
      const online = new THREE.MeshStandardMaterial({ color: coloursByNetwork[network], emissive: coloursByNetwork[network], emissiveIntensity: 1 });
      const offline = new THREE.MeshStandardMaterial({ color: 0xb4dcdf, emissive: 0xb4dcdf, emissiveIntensity: 0 });
      b.addVisualBox({ name: `room-5-${network}-online-I`, size: [.12, .35, .12], position: [46.72, -8.55, z], material: online });
      const off = new THREE.Mesh(new THREE.TorusGeometry(.17, .045, 6, 16), offline);
      off.rotation.y = Math.PI / 2; off.position.set(46.7, -10.45, z); off.name = `room-5-${network}-offline-O`; b.root.add(off);
      const pivot = new THREE.Group(); pivot.position.set(46.65, -9.5, z); pivot.name = `room-5-${network}-toggle`; b.root.add(pivot);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(.95, .28, .65), new THREE.MeshStandardMaterial({ color: 0x8b613b, roughness: .86, metalness: .5 }));
      handle.name = `room-5-control-${network}-acid-contact`; handle.position.x = -.55; pivot.add(handle);
      b.collisionMeshes.push(handle); this.markTarget(handle, .15); this.controls.set(network, handle);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(.25, .36, .7), m.support); grip.position.x = -.4; handle.add(grip);
      const badge = new THREE.Mesh(network === 'red' ? new THREE.CircleGeometry(.3, 3) : network === 'blue' ? new THREE.RingGeometry(.2, .3, 20) : new THREE.PlaneGeometry(.5, .5), online);
      badge.rotation.y = -Math.PI / 2; badge.position.set(46.76, -9.5, z - .8); b.root.add(badge);
      this.handles.push({ network, pivot, online, offline });
    }
  }
  private markTarget(mesh: THREE.Mesh, duration: number): void {
    Object.assign(mesh.userData, { roomId: 5, soluble: true, dissolveDynamicCollider: true, solubleId: mesh.name, dissolveDurationSeconds: duration, dissolveCollisionDisableProgress: .99 });
    this.targets.push(mesh);
  }
  sync(security: SecurityNetworkController, dt: number): void {
    this.reunionBridge.visible = security.shutdown;
    this.controlRamp.visible = !security.shutdown;
    for (const handle of this.handles) {
      const enabled = security.isEnabled(handle.network);
      handle.pivot.rotation.z = THREE.MathUtils.damp(handle.pivot.rotation.z, enabled ? -.65 : .65, 12, dt);
      handle.online.emissiveIntensity = enabled ? 1 : .02;
      handle.offline.emissiveIntensity = enabled ? 0 : .8;
    }
  }
}
