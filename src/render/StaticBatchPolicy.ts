import * as THREE from 'three';

export const STATIC_BATCH_CELL_SIZE = 8;
export const LARGE_STATIC_BATCH_CELL_SIZE = 16;

export function staticBatchCell(centre: THREE.Vector3, cellSize: number): string {
  return [Math.round(centre.x / cellSize), Math.round(centre.y / cellSize), Math.round(centre.z / cellSize)].join(':');
}

/** Shared compatibility and room-local partition policy; material identity preserves shader hooks. */
export function staticBatchKey(mesh: THREE.Mesh, material: THREE.Material, inverseRoot: THREE.Matrix4, cellSize: number): string {
  if (mesh instanceof THREE.InstancedMesh) {
    if (!mesh.boundingBox) mesh.computeBoundingBox();
  } else if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  const bounds = mesh instanceof THREE.InstancedMesh ? mesh.boundingBox! : mesh.geometry.boundingBox!;
  const centre = bounds.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverseRoot);
  return [material.uuid, mesh.castShadow, mesh.receiveShadow, mesh.renderOrder, mesh.layers.mask,
    mesh.userData.staticBatchPartition ?? '',
    Object.entries(mesh.geometry.attributes).sort(([a], [b]) => a.localeCompare(b))
      .map(([name, a]) => `${name},${a.itemSize},${a.normalized},${a.array.constructor.name}`).join('|'),
    mesh.geometry.index === null ? 'non-indexed' : 'indexed',
    staticBatchCell(centre, cellSize)].join(':');
}
