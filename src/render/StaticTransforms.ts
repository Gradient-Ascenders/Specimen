import * as THREE from 'three';

/** Freeze local transforms only. World matrices still follow moving ancestors and physics queries. */
export function freezeStaticTransforms(root: THREE.Object3D, dynamicRoots: ReadonlySet<THREE.Object3D>): number {
  let frozen = 0;
  const visit = (object: THREE.Object3D) => {
    if (dynamicRoots.has(object)) return;
    if (object.userData.dynamicAssembly || object.userData.dynamicTransform ||
        object.userData.presentationOwnedBy || object.userData.cutsceneOwnedBy) return;
    object.updateMatrix();
    object.matrixAutoUpdate = false;
    frozen++;
    for (const child of object.children) visit(child);
  };
  // Keep the room root editable for authored placement and camera handoffs.
  for (const child of root.children) visit(child);
  return frozen;
}
