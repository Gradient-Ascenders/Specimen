import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import type { ContainmentArtResources } from './ContainmentArtResources.ts';
import { createContainmentMonitorTexture, paintContainmentMonitorTexture } from './ContainmentProceduralTextures.ts';
import { markVisualOnly } from './ContainmentModularComponents.ts';
import { RoomOneMonitorDialogue } from './RoomOneMonitorDialogue.ts';

// Facing the north (+Z) exit, right is -X. Centre it on the 12m x 8m side wall.
export const ROOM_ONE_MONITOR_POSITION = Object.freeze({ x: -6.62, y: 4, z: 0 });

/** Wall-mounted, three-draw observation terminal. Shared finishes remain borrowed. */
export class RoomOneMonitor {
  readonly root = new THREE.Group();
  readonly dialogue = new RoomOneMonitorDialogue();
  readonly texture = createContainmentMonitorTexture();
  readonly screen: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private disposed = false;

  constructor(resources: ContainmentArtResources) {
    this.root.name = 'room-1-observation-monitor';
    this.root.position.copy(ROOM_ONE_MONITOR_POSITION);
    this.root.rotation.y = Math.PI / 2;
    this.root.userData.presentationOwnedBy = 'room-1-observation-monitor';
    const hardware = (name: string, material: THREE.Material,
      parts: readonly { size: [number, number, number]; at: [number, number, number] }[]) => {
      const pieces = parts.map(part => new THREE.BoxGeometry(...part.size).translate(...part.at));
      const geometry = mergeGeometries(pieces)!;
      for (const piece of pieces) piece.dispose();
      this.geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, material); mesh.name = name;
      mesh.receiveShadow = true; this.root.add(mesh);
    };
    hardware('room-1-monitor-graphite-housing', resources.materials.graphite, [
      { size: [4.18, 2.68, .23], at: [0, 0, .08] },
      { size: [.18, 2.2, .14], at: [-1.65, 0, -.09] },
      { size: [.18, 2.2, .14], at: [1.65, 0, -.09] },
    ]);
    hardware('room-1-monitor-retaining-trim', resources.materials.serviceMetal, [
      { size: [4.05, .045, .05], at: [0, 1.22, .2] },
      { size: [4.05, .045, .05], at: [0, -1.22, .2] },
      { size: [.045, 2.44, .05], at: [-2.005, 0, .2] },
      { size: [.045, 2.44, .05], at: [2.005, 0, .2] },
      ...[-1, 1].flatMap(x => [-1, 1].map(y => ({
        size: [.075, .075, .035] as [number, number, number],
        at: [x * 1.96, y * 1.18, .235] as [number, number, number],
      }))),
    ]);
    const screenGeometry = new THREE.PlaneGeometry(3.8, 2.2);
    // Data-texture rows are top-down; keep the terminal upright, not mirrored.
    const uv = screenGeometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    const material = new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false });
    material.name = 'room-1-monitor-display';
    this.screen = new THREE.Mesh(screenGeometry, material);
    this.screen.name = 'room-1-monitor-screen'; this.screen.position.z = .205;
    this.geometries.push(screenGeometry); this.root.add(this.screen);
    this.root.traverse(object => {
      markVisualOnly(object);
      // All hardware is immutable; typing changes only an existing screen texture.
      object.updateMatrix(); object.matrixAutoUpdate = false;
    });
  }

  update(deltaSeconds: number): void {
    if (this.disposed || !this.dialogue.update(deltaSeconds)) return;
    const { text, typing } = this.dialogue.readModel;
    paintContainmentMonitorTexture(this.texture, text, typing);
  }

  reset(): void {
    if (this.disposed) return;
    this.dialogue.reset();
    paintContainmentMonitorTexture(this.texture, '', false);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    this.screen.material.dispose(); this.texture.dispose();
    this.root.clear();
  }
}
