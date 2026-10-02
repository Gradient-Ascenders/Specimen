import * as THREE from 'three';

/** Assign roles to the retained visible geometry, including existing spatial batches. */
export function applyCultivationShadowRoles(root: THREE.Object3D, excludedMaterials: ReadonlySet<THREE.Material> = new Set()): void {
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const solid = materials.some(material => material instanceof THREE.MeshStandardMaterial &&
      material.visible && !material.transparent && !excludedMaterials.has(material));
    const excluded = object.name === 'room-5-captive-volt' || object.userData.textureRole === 'acid-floor' ||
      object.userData.hazardRole === 'radioactive';
    // Detailed ceramic decks receive; their existing low-poly hulls alone cast.
    const hull = object.name === 'room-5-platform-shadow-hulls';
    object.castShadow = hull || (solid && !excluded && !object.userData.shadowProxyReceiver);
    object.receiveShadow = solid && !excluded;
  });
}

/** Two fixed fixture keys per ordinary room, plus the existing lift pool. */
export function configureCultivationTraversalLight(light: THREE.SpotLight): void {
  light.userData.cultivationTraversalShadowLight = true;
  light.castShadow = true;
  light.shadow.mapSize.set(512, 512);
  light.shadow.camera.near = .2;
  light.shadow.bias = -.0001;
  light.shadow.normalBias = .015;
  light.shadow.radius = 1.5;
}
