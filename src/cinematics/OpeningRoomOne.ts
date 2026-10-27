import * as THREE from 'three';

import type { ContainmentArtResources } from '../render/environment/containment/ContainmentArtResources.ts';
import { createBorrowedBox } from '../render/environment/containment/ContainmentModularComponents.ts';
import { RoomOneArt } from '../render/environment/containment/RoomOneArt.ts';
import { consolidateContainmentRoomStaticVisuals } from '../render/environment/containment/ContainmentStaticBatching.ts';

export const OPENING_ROOM_ONE_LAYOUT = Object.freeze({ halfWidth: 7, backZ: -6, frontZ: 6,
  ceilingY: 7.85, doorwayX: 4.3, doorwayZ: 6.3, doorwayHalfWidth: 1.55 });

/** Room 1's real production dressing, without a second hero, physics or runtime. */
export class OpeningRoomOne {
  readonly root = new THREE.Group();
  private readonly sourceArt: RoomOneArt;
  private readonly shellProxy = new THREE.Group();
  private readonly batching: ReturnType<typeof consolidateContainmentRoomStaticVisuals>;
  private readonly sourceInstances = new Set<THREE.InstancedMesh>();
  private disposed = false;

  constructor(resources: ContainmentArtResources) {
    this.root.name = 'opening-authored-room-one';
    this.shellProxy.userData.staticBatchExcluded = true;
    this.root.userData.presentationOnly = true;
    this.sourceArt = new RoomOneArt(resources);
    // Retain ownership of every source resource, including excluded specimen
    // states. They never enter the renderer or get their own character/model load.
    this.sourceArt.root.traverse(object => { if (object instanceof THREE.InstancedMesh) this.sourceInstances.add(object); });
    for (const child of [...this.sourceArt.root.children]) {
      if (child === this.sourceArt.specimenAssembly || child.name === 'room-1-locked-laboratory-door-assembly') continue;
      this.root.add(child);
    }
    const m = resources.materials;
    let shellParent: THREE.Group = this.shellProxy;
    const add = (name: string, size: readonly [number, number, number], position: readonly [number, number, number], material: THREE.Material) => {
      shellParent.add(createBorrowedBox(resources, { name: `opening-room-one-${name}`, size, position, material }));
    };
    this.root.add(this.shellProxy);
    // Match ContainmentTeachingScene's 14 x 12 x 8 metre shell. Its north wall
    // has the real sticky/vent recess plus a physical portal at the authored door.
    add('floor', [14, 0.4, 12], [0, -0.2, 0], m.clinicalFloor);
    add('rear-wall', [14, 8, 0.4], [0, 4, -6], m.mechanicalBacking);
    add('west-wall', [0.4, 8, 12], [-7, 4, 0], m.mechanicalBacking);
    add('east-wall', [0.4, 8, 12], [7, 4, 0], m.mechanicalBacking);
    add('ceiling', [14, 0.3, 12], [0, 8, 0], m.mainCeramic);
    for (const x of [-3.8, 3.8]) add(`ceiling-fixture-mount-${x}`, [0.18, 0.08, 0.72], [x, 7.83, -1.5], m.graphite);
    add('north-west', [1.2, 8, 0.4], [-6.4, 4, 6], m.mechanicalBacking);
    add('north-centre', [6.55, 8, 0.4], [-0.525, 4, 6], m.mechanicalBacking);
    add('north-east', [1.15, 8, 0.4], [6.425, 4, 6], m.mechanicalBacking);
    add('north-over-door', [3.1, 4.1, 0.4], [4.3, 5.95, 6], m.mechanicalBacking);
    add('north-above-vent', [2, 1.2, 0.4], [-4.8, 7.4, 6], m.mechanicalBacking);
    shellParent = this.root;
    // A short enclosed continuation gives the visible vent depth, not a view
    // through the back of the presentation scene. No gameplay section is loaded.
    add('vent-end', [2.2, 1.7, 0.15], [-4.8, 6.03, 6.8], m.mechanicalBacking);
    add('vent-floor', [2.2, 0.16, 1.4], [-4.8, 5.15, 6.2], m.serviceMetal);
    add('vent-ceiling', [2.2, 0.16, 1.4], [-4.8, 6.88, 6.2], m.mechanicalBacking);
    for (const x of [-5.89, -3.71]) add(`vent-side-${x}`, [0.16, 1.7, 1.4], [x, 6.03, 6.2], m.mechanicalBacking);
    this.root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.receiveShadow = true;
      object.castShadow = object.material !== m.neutralFixture && object.material !== m.signage;
    });
    // Preserve exact authored geometry, positions and materials while merging
    // static dressing by material. One room-sized cell, not dozens of draws.
    // The batch result owns its generated instance buffers; retain only the
    // original source instances here, including those removed by batching.
    this.batching = consolidateContainmentRoomStaticVisuals(this.root, { cellSize: 32 });
  }

  async prepare(): Promise<void> {
    await this.sourceArt.prepare();
    if (!this.disposed) this.shellProxy.visible = false;
  }

  borrowShellFinish(name: string): THREE.Material {
    return this.sourceArt.shell.borrowFinish(name);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    for (const instance of this.sourceInstances) instance.dispose();
    this.sourceInstances.clear();
    this.batching.dispose();
    this.sourceArt.dispose();
    this.root.clear();
  }
}
