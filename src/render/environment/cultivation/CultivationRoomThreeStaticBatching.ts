import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface CultivationRoomThreeStaticBatchDiagnostics {
  readonly batchCount: number;
  readonly sourceMeshCount: number;
  readonly drawCallsRemoved: number;
  readonly mergedGeometryCount: number;
}

/**
 * Replace only the render submission for compatible static Room 3 colliders.
 *
 * The authored meshes stay parented, visible, and identity-stable for collision,
 * surface queries, debug overlays, and route metadata. An invisible material
 * suppresses their individual renderer submissions while room-local merged
 * meshes reproduce the same opaque visuals.
 */
export function consolidateCultivationRoomThreeStaticColliders(
  roomRoot: THREE.Group,
  collisionMeshes: readonly THREE.Mesh[],
): CultivationRoomThreeStaticBatchDiagnostics {
  roomRoot.updateWorldMatrix(true, true);
  const groups = new Map<THREE.Material, THREE.Mesh[]>();
  for (const mesh of collisionMeshes) {
    if (!isBatchCandidate(mesh)) continue;
    const material = mesh.material;
    if (Array.isArray(material)) continue;
    const group = groups.get(material) ?? [];
    group.push(mesh);
    groups.set(material, group);
  }

  const invisibleColliderMaterial = new THREE.MeshBasicMaterial({
    visible: false,
  });
  invisibleColliderMaterial.name =
    'cultivation-room-3-batched-collider-material';
  const inverseRoomMatrix = new THREE.Matrix4()
    .copy(roomRoot.matrixWorld)
    .invert();
  const roomLocalMatrix = new THREE.Matrix4();
  let batchCount = 0;
  let sourceMeshCount = 0;

  for (const [material, sources] of groups) {
    if (sources.length < 2) continue;
    const transformed = sources.map((source) => {
      roomLocalMatrix.multiplyMatrices(inverseRoomMatrix, source.matrixWorld);
      return source.geometry.clone().applyMatrix4(roomLocalMatrix);
    });
    const geometry = mergeGeometries(transformed, false);
    for (const temporary of transformed) temporary.dispose();
    if (!geometry) {
      invisibleColliderMaterial.dispose();
      throw new Error(
        `Unable to batch Room 3 colliders: ${sources
          .map((source) => source.name)
          .join(', ')}.`,
      );
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const batch = new THREE.Mesh(geometry, material);
    batchCount += 1;
    batch.name = `cultivation-room-3-static-visual-batch-${batchCount}`;
    batch.userData.presentationOnly = true;
    batch.userData.resourceOwnership =
      'owned-cultivation-room-three-static-batch';
    batch.userData.staticBatchSourceNames = sources.map(
      (source) => source.name,
    );
    roomRoot.add(batch);

    for (const source of sources) {
      source.material = invisibleColliderMaterial;
    }
    sourceMeshCount += sources.length;
  }

  if (batchCount === 0) invisibleColliderMaterial.dispose();
  const diagnostics = {
    batchCount,
    sourceMeshCount,
    drawCallsRemoved: sourceMeshCount - batchCount,
    mergedGeometryCount: batchCount,
  } as const;
  roomRoot.userData.staticBatchDiagnostics = diagnostics;
  return diagnostics;
}

function isBatchCandidate(mesh: THREE.Mesh): boolean {
  if (!mesh.visible || mesh.userData.soluble === true) return false;
  if (mesh.userData.hazardRole === 'radioactive') return false;
  if (mesh.userData.interactionRole || mesh.userData.textureRole === 'acid-floor') {
    return false;
  }
  if (Array.isArray(mesh.material)) return false;
  return mesh.material.visible && !mesh.material.transparent;
}
