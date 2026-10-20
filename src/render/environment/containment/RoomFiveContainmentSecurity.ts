import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import type { ContainmentArtResources } from './ContainmentArtResources.ts';
import { createInstancedBoxes, markVisualOnly,
  type BoxInstanceTransform } from './ContainmentModularComponents.ts';
import { CONTAINMENT_SECURITY_REGIONS as REGIONS,
  createContainmentSecurityAtlas } from './ContainmentProceduralTextures.ts';

/** Three static draws: armour, fasteners and the front-only safety markings.
 * Keeps the original solid glass collider and its traversable roof unchanged.
 */
export class RoomFiveContainmentSecurity {
  readonly root = new THREE.Group();
  readonly texture = createContainmentSecurityAtlas('Goop');
  readonly signs: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private disposed = false;

  constructor(resources: ContainmentArtResources) {
    this.root.name = 'room-5-critical-containment-security';
    this.root.userData.presentationOwnedBy = this.root.name;
    const armour: BoxInstanceTransform[] = [], fasteners: BoxInstanceTransform[] = [];
    const markings: THREE.BufferGeometry[] = [];
    // The NPC's authored sole is at 76.096, above the old load deck. Give him
    // a supported isolation grate rather than leaving him suspended in the cell.
    armour.push({ position: [0, 75.823, 110], size: [2.45, .526, 2.25] });
    for (let i = 0; i < 12; i++) fasteners.push({
      position: [0, 76.092, 109.01 + i * .18], size: [2.25, .012, .07],
    });
    const addSign = (region: keyof typeof REGIONS, size: readonly [number, number],
      at: readonly [number, number, number], rotation: readonly [number, number, number]) => {
      const geometry = new THREE.PlaneGeometry(...size);
      const [x, y, width, height] = REGIONS[region], uv = geometry.getAttribute('uv');
      // Insets prevent a neighbouring atlas row bleeding through at oblique angles.
      for (let i = 0; i < uv.count; i++) uv.setXY(i,
        (x + .5 + uv.getX(i) * (width - 1)) / 512,
        (y + .5 + (1 - uv.getY(i)) * (height - 1)) / 512);
      geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation)));
      geometry.translate(...at);
      markings.push(geometry);
    };

    // These headers end below y=78.675: nothing newly protrudes above the roof.
    for (const side of [-1, 1]) {
      const front = side === -1, z = front ? 107.47 : 112.53;
      const yaw = front ? Math.PI : 0, faceZ = z + side * .362;
      // Deep enough to seat on the original roof ring and meet both side rails.
      armour.push({ position: [0, 78.10, z], size: [6.02, 1.04, .70] });
      if (front) addSign('identification', [3.8, .76], [0, 78.02, faceZ], [0, yaw, 0]);
      addSign('caution', [5.9, .14], [0, 78.51, faceZ], [0, yaw, 0]);
      for (const x of [-2.55, 2.55]) {
        if (front) addSign('warningIcon', [.48, .48], [x, 78.02, faceZ], [0, yaw, 0]);
        fasteners.push({ position: [x, 78.40, faceZ + side * .012], size: [.075, .075, .025] });
      }
      // Broad bands reinforce the base without covering the transparent panes.
      addSign('caution', [5.2, .22], [0, 75.79, front ? 107.44 : 112.56], [0, yaw, 0]);
      if (front) addSign('release', [2.2, .24], [0, 75.30, 106.916], [0, yaw, 0]);
    }
    for (const side of [-1, 1]) {
      const x = side * 2.78, yaw = side * Math.PI / 2, faceX = x + side * .242;
      armour.push({ position: [x, 78.10, 110], size: [.46, 1.04, 5.76] });
      addSign('caution', [5.64, .14], [faceX, 78.51, 110], [0, yaw, 0]);
      addSign('caution', [4.38, .22], [side * 2.88, 75.79, 110], [0, yaw, 0]);
      for (const z of [108.1, 111.9]) {
        fasteners.push({ position: [faceX + side * .012, 78.40, z], size: [.025, .075, .075] });
      }
    }
    for (const x of [-2.35, 2.35]) for (const z of [107.91, 112.09]) {
      armour.push({ position: [x, 77.1, z], size: [.32, 2.62, .32] });
      const outward = z < 110 ? -1 : 1, faceZ = z + outward * .17;
      for (const y of [76.05, 77.28]) {
        fasteners.push({ position: [x, y, faceZ], size: [.12, .10, .025] });
      }
    }
    // All text/pictograms stay on the entrance-facing side. Only the caution
    // tape wraps around the other sides of the otherwise unlabelled frame.
    addSign('hazard', [1.05, .72], [1.85, 77.0, 107.199], [0, Math.PI, 0]);
    // Flush floor perimeter, well below every route platform; no new collision.
    for (const z of [105.45, 114.55]) addSign('caution', [9.1, .22], [0, 74.809, z], [-Math.PI / 2, 0, 0]);
    for (const x of [-4.56, 4.56]) addSign('caution', [8.9, .22], [x, 74.809, 110], [-Math.PI / 2, 0, Math.PI / 2]);

    const material = new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false });
    material.name = 'room-5-critical-security-markings';
    this.signs = new THREE.Mesh(mergeGeometries(markings)!, material);
    this.signs.name = 'room-5-critical-identification-and-hazard-markings';
    for (const geometry of markings) geometry.dispose();
    this.root.add(
      createInstancedBoxes(resources, 'room-5-critical-armoured-headers-and-corners', resources.materials.graphite, armour),
      createInstancedBoxes(resources, 'room-5-critical-captive-fasteners', resources.materials.serviceMetal, fasteners),
      this.signs,
    );
    this.root.traverse(object => {
      markVisualOnly(object);
      // No animation, new lights, shadow casters or per-frame resource allocation.
      object.updateMatrix(); object.matrixAutoUpdate = false;
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.signs.geometry.dispose(); this.signs.material.dispose(); this.texture.dispose();
    for (const child of this.root.children) if (child instanceof THREE.InstancedMesh) child.dispose();
    this.root.clear();
  }
}
