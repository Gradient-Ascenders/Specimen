import * as THREE from 'three';

/** Include dormant/captive forms: visibility today is not a lifetime guarantee.
 * Shadow-target depth/distance programs remain required without transmission. */
export function requiresTransmissionPreparation(root: THREE.Object3D): boolean {
  let required = false;
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material.visible && material instanceof THREE.MeshPhysicalMaterial && material.transmission > 0) required = true;
    }
  });
  return required;
}
