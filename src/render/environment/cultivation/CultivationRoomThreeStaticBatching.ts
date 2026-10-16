import * as THREE from 'three';
import { LARGE_STATIC_BATCH_CELL_SIZE, staticBatchKey } from '../../StaticBatchPolicy.ts';
import type { CultivationAssetSource } from './CultivationBakedAssets.ts';
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
 * suppresses their individual renderer submissions while room-cell merged
 * meshes reproduce the same opaque visuals.
 */
export function consolidateCultivationRoomThreeStaticColliders(
  roomRoot: THREE.Group,
  collisionMeshes: readonly THREE.Mesh[],
  assets?: CultivationAssetSource,
): CultivationRoomThreeStaticBatchDiagnostics {
  roomRoot.updateWorldMatrix(true, true);
  const groups = new Map<string, THREE.Mesh[]>();
  const inverseRoot = roomRoot.matrixWorld.clone().invert();
  for (const mesh of collisionMeshes) {
    if (!isBatchCandidate(mesh)) continue;
    const material = mesh.material;
    if (Array.isArray(material)) continue;
    const key = staticBatchKey(mesh, material, inverseRoot, LARGE_STATIC_BATCH_CELL_SIZE);
    const group = groups.get(key) ?? [];
    group.push(mesh);
    groups.set(key, group);
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

  for (const sources of groups.values()) {
    const material = sources[0].material;
    if (sources.length < 2) continue;
    const generate = () => {
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
      return geometry;
    };
    const geometry = assets ? assets.geometry(`room-3-colliders-${batchCount + 1}`, generate) : generate();
    const batch = new THREE.Mesh(geometry, material);
    batch.castShadow = sources[0].castShadow;
    batch.receiveShadow = sources[0].receiveShadow;
    batch.renderOrder = sources[0].renderOrder;
    batch.layers.mask = sources[0].layers.mask;
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
  for (let ancestor: THREE.Object3D | null = mesh; ancestor; ancestor = ancestor.parent) {
    if (ancestor.userData.dynamicAssembly === true) return false;
  }
  if (!mesh.visible || mesh.userData.soluble === true) return false;
  if (mesh.userData.hazardRole === 'radioactive') return false;
  if (mesh.userData.interactionRole || mesh.userData.textureRole === 'acid-floor') {
    return false;
  }
  if (Array.isArray(mesh.material)) return false;
  return mesh.material.visible && !mesh.material.transparent;
}
