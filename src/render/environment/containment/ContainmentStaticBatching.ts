import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { markVisualOnly } from './ContainmentModularComponents.ts';

export interface ContainmentStaticBatchDiagnostics {
  readonly batchCount: number;
  readonly sourceMeshCount: number;
  readonly instanceCount: number;
  readonly drawCallsRemoved: number;
  readonly mergedGeometryCount: number;
}

export interface ContainmentStaticBatchResult {
  readonly diagnostics: ContainmentStaticBatchDiagnostics;
  dispose(): void;
}

interface StaticBatchGroup {
  readonly material: THREE.Material;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
  readonly renderOrder: number;
  readonly layersMask: number;
  readonly candidates: THREE.Mesh[];
}

const materialIds = new WeakMap<THREE.Material, number>();
let nextMaterialId = 1;

/**
 * Consolidate compatible opaque visuals inside one room-local static root.
 *
 * Exact geometry matches remain instanced. Heterogeneous geometry is baked
 * into a merged room-cell mesh so uniquely sized static modules can share a
 * submission without sacrificing useful room-scale frustum culling.
 */
export function consolidateContainmentRoomStaticVisuals(
  roomRoot: THREE.Group,
  options: {
    readonly excludedRoots?: readonly THREE.Object3D[];
    readonly preservedNames?: ReadonlySet<string>;
    readonly cellSize?: number;
  } = {},
): ContainmentStaticBatchResult {
  roomRoot.updateWorldMatrix(true, true);
  const excludedRoots = new Set(options.excludedRoots ?? []);
  const preservedNames = options.preservedNames ?? new Set<string>();
  const cellSize = options.cellSize ?? 8;
  const groups = new Map<string, StaticBatchGroup>();
  collectCandidates(
    roomRoot,
    roomRoot,
    excludedRoots,
    preservedNames,
    cellSize,
    groups,
  );

  const inverseRoomMatrix = new THREE.Matrix4()
    .copy(roomRoot.matrixWorld)
    .invert();
  const sourceMatrix = new THREE.Matrix4();
  const instanceMatrix = new THREE.Matrix4();
  const roomLocalMatrix = new THREE.Matrix4();
  const batches: THREE.Mesh[] = [];
  const ownedGeometries: THREE.BufferGeometry[] = [];
  let sourceMeshCount = 0;
  let instanceCount = 0;
  let drawCallsRemoved = 0;

  for (const group of groups.values()) {
    if (group.candidates.length < 2) continue;

    const sourceNames = group.candidates.map((mesh) => mesh.name);
    const combinedInstanceCount = group.candidates.reduce(
      (total, mesh) =>
        total + (mesh instanceof THREE.InstancedMesh ? mesh.count : 1),
      0,
    );
    const sharedGeometry = group.candidates.every(
      (mesh) => mesh.geometry === group.candidates[0].geometry,
    );
    const batch = sharedGeometry
      ? createInstancedBatch(
          group,
          combinedInstanceCount,
          inverseRoomMatrix,
          sourceMatrix,
          instanceMatrix,
          roomLocalMatrix,
        )
      : createMergedBatch(
          group,
          inverseRoomMatrix,
          sourceMatrix,
          instanceMatrix,
          roomLocalMatrix,
          ownedGeometries,
        );

    batch.name = `${roomRoot.name}-static-batch-${batches.length + 1}`;
    batch.castShadow = group.castShadow;
    batch.receiveShadow = group.receiveShadow;
    batch.renderOrder = group.renderOrder;
    batch.layers.mask = group.layersMask;
    batch.userData.staticBatchSourceNames = sourceNames;
    markVisualOnly(batch);
    if (!sharedGeometry) {
      batch.userData.resourceOwnership = 'owned-containment-static-batch';
    }
    roomRoot.add(batch);
    batches.push(batch);

    for (const source of group.candidates) source.removeFromParent();
    sourceMeshCount += group.candidates.length;
    instanceCount += combinedInstanceCount;
    drawCallsRemoved += group.candidates.length - 1;
  }

  const diagnostics = {
    batchCount: batches.length,
    sourceMeshCount,
    instanceCount,
    drawCallsRemoved,
    mergedGeometryCount: ownedGeometries.length,
  } as const;
  roomRoot.userData.staticBatchDiagnostics = diagnostics;
  let disposed = false;
  return {
    diagnostics,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const batch of batches) batch.removeFromParent();
      for (const geometry of ownedGeometries) geometry.dispose();
      batches.length = 0;
      ownedGeometries.length = 0;
    },
  };
}

function createInstancedBatch(
  group: StaticBatchGroup,
  count: number,
  inverseRoomMatrix: THREE.Matrix4,
  sourceMatrix: THREE.Matrix4,
  instanceMatrix: THREE.Matrix4,
  roomLocalMatrix: THREE.Matrix4,
): THREE.InstancedMesh {
  const batch = new THREE.InstancedMesh(
    group.candidates[0].geometry,
    group.material,
    count,
  );
  let writeIndex = 0;
  for (const source of group.candidates) {
    sourceMatrix.multiplyMatrices(inverseRoomMatrix, source.matrixWorld);
    if (source instanceof THREE.InstancedMesh) {
      for (let index = 0; index < source.count; index += 1) {
        source.getMatrixAt(index, instanceMatrix);
        roomLocalMatrix.multiplyMatrices(sourceMatrix, instanceMatrix);
        batch.setMatrixAt(writeIndex, roomLocalMatrix);
        writeIndex += 1;
      }
    } else {
      batch.setMatrixAt(writeIndex, sourceMatrix);
      writeIndex += 1;
    }
  }
  batch.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  batch.instanceMatrix.needsUpdate = true;
  batch.computeBoundingBox();
  batch.computeBoundingSphere();
  return batch;
}

function createMergedBatch(
  group: StaticBatchGroup,
  inverseRoomMatrix: THREE.Matrix4,
  sourceMatrix: THREE.Matrix4,
  instanceMatrix: THREE.Matrix4,
  roomLocalMatrix: THREE.Matrix4,
  ownedGeometries: THREE.BufferGeometry[],
): THREE.Mesh {
  const transformedGeometries: THREE.BufferGeometry[] = [];
  for (const source of group.candidates) {
    sourceMatrix.multiplyMatrices(inverseRoomMatrix, source.matrixWorld);
    if (source instanceof THREE.InstancedMesh) {
      for (let index = 0; index < source.count; index += 1) {
        source.getMatrixAt(index, instanceMatrix);
        roomLocalMatrix.multiplyMatrices(sourceMatrix, instanceMatrix);
        transformedGeometries.push(
          source.geometry.clone().applyMatrix4(roomLocalMatrix),
        );
      }
    } else {
      transformedGeometries.push(
        source.geometry.clone().applyMatrix4(sourceMatrix),
      );
    }
  }

  const mergedGeometry = mergeGeometries(transformedGeometries, false);
  for (const geometry of transformedGeometries) geometry.dispose();
  if (!mergedGeometry) {
    throw new Error(
      `Unable to merge compatible static geometry for ${group.candidates
        .map((mesh) => mesh.name)
        .join(', ')}.`,
    );
  }
  mergedGeometry.computeBoundingBox();
  mergedGeometry.computeBoundingSphere();
  ownedGeometries.push(mergedGeometry);
  return new THREE.Mesh(mergedGeometry, group.material);
}

function collectCandidates(
  object: THREE.Object3D,
  roomRoot: THREE.Group,
  excludedRoots: ReadonlySet<THREE.Object3D>,
  preservedNames: ReadonlySet<string>,
  cellSize: number,
  groups: Map<string, StaticBatchGroup>,
): void {
  if (object !== roomRoot && excludedRoots.has(object)) return;
  if (object !== roomRoot && object.userData.staticBatchExcluded) return;
  if (object !== roomRoot && !object.visible) return;

  if (
    object instanceof THREE.Mesh &&
    isStaticBatchCandidate(object, preservedNames)
  ) {
    const material = object.material;
    if (!Array.isArray(material)) {
      const key = batchKey(object, material, cellSize);
      let group = groups.get(key);
      if (!group) {
        group = {
          material,
          castShadow: object.castShadow,
          receiveShadow: object.receiveShadow,
          renderOrder: object.renderOrder,
          layersMask: object.layers.mask,
          candidates: [],
        };
        groups.set(key, group);
      }
      group.candidates.push(object);
    }
  }

  for (const child of [...object.children]) {
    collectCandidates(
      child,
      roomRoot,
      excludedRoots,
      preservedNames,
      cellSize,
      groups,
    );
  }
}

function isStaticBatchCandidate(
  mesh: THREE.Mesh,
  preservedNames: ReadonlySet<string>,
): boolean {
  if (!mesh.visible || preservedNames.has(mesh.name)) return false;
  if (!mesh.userData.visualOnly) return false;
  if (mesh.userData.cutsceneOwnedBy || mesh.userData.presentationOwnedBy) return false;
  if (Array.isArray(mesh.material)) return false;
  if (!mesh.material.visible || mesh.material.transparent) return false;
  if (mesh.customDepthMaterial || mesh.customDistanceMaterial) return false;
  if (mesh instanceof THREE.SkinnedMesh) return false;
  if (Object.keys(mesh.geometry.morphAttributes).length > 0) return false;
  return true;
}

function batchKey(
  mesh: THREE.Mesh,
  material: THREE.Material,
  cellSize: number,
): string {
  const centre = new THREE.Box3()
    .setFromObject(mesh)
    .getCenter(new THREE.Vector3());
  return [
    materialId(material),
    geometryAttributeSignature(mesh.geometry),
    mesh.geometry.index === null ? 'non-indexed' : 'indexed',
    mesh.castShadow ? 1 : 0,
    mesh.receiveShadow ? 1 : 0,
    mesh.renderOrder,
    mesh.layers.mask,
    Math.round(centre.x / cellSize),
    Math.round(centre.y / cellSize),
    Math.round(centre.z / cellSize),
  ].join(':');
}

function materialId(material: THREE.Material): number {
  const existing = materialIds.get(material);
  if (existing !== undefined) return existing;
  const id = nextMaterialId++;
  materialIds.set(material, id);
  return id;
}

function geometryAttributeSignature(geometry: THREE.BufferGeometry): string {
  return Object.entries(geometry.attributes)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, attribute]) =>
      [
        name,
        attribute.itemSize,
        attribute.normalized ? 1 : 0,
        attribute.array.constructor.name,
      ].join(','),
    )
    .join('|');
}
