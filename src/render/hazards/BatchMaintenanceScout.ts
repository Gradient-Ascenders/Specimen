import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { optimizeFiniteLightEvaluation } from '../environment/cultivation/FiniteLightEvaluation.ts';

/** Merge the immutable flying scout detail; keep the animated eye and damaged scout separate. */
export function batchMaintenanceScout(body: THREE.Mesh, eye: THREE.Mesh,
  surfaceMaps?: { bumpMap: THREE.Texture | null; roughnessMap: THREE.Texture | null }): void {
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const child of [...body.children]) {
    if (!(child instanceof THREE.Mesh) || child === eye || Array.isArray(child.material)) continue;
    child.updateMatrix();
    let geometry = child.geometry.clone();
    if (geometry.index) { const indexed = geometry; geometry = indexed.toNonIndexed(); indexed.dispose(); }
    geometry.applyMatrix4(child.matrix);
    const list = parts.get(child.material) ?? []; list.push(geometry); parts.set(child.material, list);
    child.removeFromParent(); child.geometry.dispose();
  }
  for (const [material, geometries] of parts) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries, false)!, material);
    mesh.name = 'room-5-scout-batched-machinery'; body.add(mesh);
    for (const geometry of geometries) geometry.dispose();
  }
  body.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial)) return;
    if (surfaceMaps) {
      object.material.bumpMap = surfaceMaps.bumpMap;
      object.material.roughnessMap = surfaceMaps.roughnessMap;
      object.material.bumpScale = .004;
    }
    optimizeFiniteLightEvaluation(object.material);
  });
}
