import * as THREE from 'three';
import type { CameraOccluder } from '../render/CameraOcclusion.ts';
import type { ExterminationLairAsset } from './ExterminationLairAsset.ts';

/** Insets of the v1 lair's solid backing, plinths and entrance. Dimensions
 * follow assets/environments/extermination-lair/generate-lair.py. Each plane
 * lies inside real opaque geometry; the portal and gaps remain open. */
export function exterminationOccluders(asset: ExterminationLairAsset): CameraOccluder[] {
  const result: CameraOccluder[] = [];
  const add = (owner: THREE.Object3D, name: string, position: THREE.Vector3,
    yaw: number, halfWidth: number, halfHeight: number, depthMargin: number, clippingBounds?: THREE.Box3) => {
    const mesh = owner.getObjectByName(name);
    if (!(mesh instanceof THREE.Mesh)) return; // Optional art variants fail open.
    owner.updateWorldMatrix(true, true);
    const frame = new THREE.Matrix4().makeRotationY(yaw).setPosition(position);
    frame.premultiply(new THREE.Matrix4().copy(mesh.matrixWorld).invert().multiply(owner.matrixWorld));
    result.push({ mesh, frame, halfWidth, halfHeight, depthMargin, clippingBounds });
  };
  for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI / 6, portal = i === 3 || i === 9;
    const radius = 112 * Math.cos(Math.PI / 12), bottom = portal ? 18 : .4;
    add(asset.staticRoot, 'Lair_Static_Lair_Graphite',
      new THREE.Vector3(Math.cos(angle) * radius, (96 + bottom) / 2, Math.sin(angle) * radius),
      -Math.PI / 2 - angle, 112 * Math.sin(Math.PI / 12) - .15, (96 - bottom) / 2 - .15, .2);
    if (!portal) add(asset.staticRoot, 'Lair_Static_Lair_Gunmetal',
      new THREE.Vector3(Math.cos(angle) * 101.3, 3.7, Math.sin(angle) * 101.3),
      -Math.PI / 2 - angle, 22, 3.05, 5.5,
      new THREE.Box3(new THREE.Vector3(-26, -3.4, -3.5), new THREE.Vector3(26, 3.4, 5.5)));
  }
  for (const side of [-1, 1]) add(asset.staticRoot, 'Lair_Static_Lair_Armour',
    new THREE.Vector3(side * 15, 18.2, -91), 0, 8.2, 17.5, .3);
  for (const [bottom, front] of [[8.4, -99.5], [15, -97], [22, -94.5], [28, -91]]) {
    add(asset.staticRoot, 'Lair_Static_Lair_Armour',
      new THREE.Vector3(0, (36 + bottom!) / 2, front!), 0, 6.3, (36 - bottom!) / 2 - .2, .3);
  }
  add(asset.entryDoor, 'Lair_EntryDoor_Lair_Gunmetal', new THREE.Vector3(0, 0, .25), 0, 6.2, 3.7, .2);
  return result;
}
