import * as THREE from 'three';

/** Opaque shells cast; glass, emitters, projectiles and collider-only materials
 * stay out of the depth pass. Existing custom character depth materials survive. */
export function applyExterminationShadowRoles(root: THREE.Object3D, cast: boolean): void {
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const solid = materials.every(material => material instanceof THREE.MeshStandardMaterial &&
      material.visible && !material.transparent && material.opacity >= 1 &&
      !(material.emissiveIntensity > .5 && material.emissive.r + material.emissive.g + material.emissive.b > 0));
    object.receiveShadow = solid;
    object.castShadow = cast && solid;
  });
}
