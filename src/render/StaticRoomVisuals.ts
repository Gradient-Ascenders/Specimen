import * as THREE from 'three';

import {
  consolidateContainmentRoomStaticVisuals,
  type ContainmentStaticBatchResult,
} from './environment/containment/ContainmentStaticBatching.ts';

/** Batch immutable visuals without replacing the meshes registered with physics. */
export function consolidateStaticRoomVisuals(
  room: THREE.Group,
  sources: readonly THREE.Mesh[],
  cellSize = 16,
): ContainmentStaticBatchResult {
  room.updateWorldMatrix(true, true);
  const inverse = room.matrixWorld.clone().invert();
  const root = new THREE.Group();
  root.name = `${room.name}-batched-static-visuals`;
  room.add(root);
  const proxies = sources.filter(source => {
    if (source.children.length > 0) return false;
    // Mesh.clone does not retain custom depth/distance material ownership.
    if (source.customDepthMaterial || source.customDistanceMaterial || source instanceof THREE.SkinnedMesh) return false;
    // A flattened proxy must not escape a hidden parent or a different room.
    for (let parent: THREE.Object3D | null = source; parent; parent = parent.parent) {
      if (parent === room) return true;
      if (!parent.visible) return false;
    }
    return false;
  }).map(source => {
    const proxy = source.clone(false);
    proxy.userData = { ...source.userData, visualOnly: true };
    proxy.matrix.multiplyMatrices(inverse, source.matrixWorld);
    proxy.matrixAutoUpdate = false;
    root.add(proxy);
    return { source, proxy };
  });
  let result: ContainmentStaticBatchResult;
  try {
    result = consolidateContainmentRoomStaticVisuals(root, { cellSize });
  } catch (error) {
    root.removeFromParent(); root.clear();
    throw error;
  }

  const hidden = new Map<THREE.Material, THREE.Material>();
  const originals: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }[] = [];
  for (const { source, proxy } of proxies) {
    // Unbatched proxies remain attached. Their original already renders it.
    if (proxy.parent) { proxy.removeFromParent(); continue; }
    originals.push({ mesh: source, material: source.material });
    const hide = (material: THREE.Material): THREE.Material => {
      let copy = hidden.get(material);
      if (!copy) { copy = material.clone(); copy.visible = false; hidden.set(material, copy); }
      return copy;
    };
    // Three also checks material.visible in its shadow pass. Keep the collider's
    // role flags intact without submitting a second copy of the visual/caster.
    source.material = Array.isArray(source.material) ? source.material.map(hide) : hide(source.material);
  }

  let disposed = false;
  return {
    diagnostics: result.diagnostics,
    dispose() {
      if (disposed) return;
      disposed = true;
      // Instance buffers belong to the new batch; its source geometry does not.
      for (const object of root.children) if (object instanceof THREE.InstancedMesh) object.dispose();
      result.dispose();
      root.removeFromParent(); root.clear();
      for (const { mesh, material } of originals) mesh.material = material;
      for (const material of hidden.values()) material.dispose();
      hidden.clear(); originals.length = 0;
    },
  };
}
