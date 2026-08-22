import * as THREE from 'three';

import type { SurfaceTag } from '../physics/SurfaceRegistry.ts';

export const ROOM_ONE_DEVELOPMENT_SOLUBLE_BARRIER_NAME =
  'room-1-goop-soluble-test-barrier';

export interface ContainmentColliderFingerprint {
  readonly name: string;
  readonly worldPosition: readonly [number, number, number];
  readonly worldQuaternion: readonly [number, number, number, number];
  readonly worldScale: readonly [number, number, number];
  readonly localDimensions: readonly [number, number, number];
  readonly surfaceTag: SurfaceTag;
  readonly movementFaceMode: 'all' | 'vertical-sides';
  readonly interactionRole: 'goop-dissolvable' | null;
  readonly textureRole:
    | 'sticky-wall-tile'
    | 'sticky-vent-tile'
    | 'acid-floor'
    | 'wooden-door'
    | null;
  readonly soluble: boolean;
  readonly parentPath: string;
  readonly developmentOnly: boolean;
}

const ROUNDING_PLACES = 6;
const worldPosition = new THREE.Vector3();
const worldQuaternion = new THREE.Quaternion();
const worldScale = new THREE.Vector3();
const localDimensions = new THREE.Vector3();

/**
 * Capture the gameplay-owned Containment collision contract independently of
 * all render materials and visual-only dressing.
 */
export function captureContainmentCollisionFingerprint(
  collisionMeshes: readonly THREE.Mesh[],
): readonly ContainmentColliderFingerprint[] {
  return collisionMeshes.map((mesh) => {
    mesh.updateWorldMatrix(true, false);
    mesh.getWorldPosition(worldPosition);
    mesh.getWorldQuaternion(worldQuaternion);
    mesh.getWorldScale(worldScale);
    mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox;
    if (!bounds) {
      throw new Error(`Collider ${mesh.name} has no local geometry bounds.`);
    }
    bounds.getSize(localDimensions);

    return {
      name: mesh.name,
      worldPosition: vector3Tuple(worldPosition),
      worldQuaternion: quaternionTuple(worldQuaternion),
      worldScale: vector3Tuple(worldScale),
      localDimensions: vector3Tuple(localDimensions),
      surfaceTag: (mesh.userData.surfaceTag ?? 'default') as SurfaceTag,
      movementFaceMode: mesh.userData.movementFaceMode ?? 'all',
      interactionRole: mesh.userData.interactionRole ?? null,
      textureRole: mesh.userData.textureRole ?? null,
      soluble: mesh.userData.soluble === true,
      parentPath: getParentPath(mesh),
      developmentOnly:
        mesh.name === ROOM_ONE_DEVELOPMENT_SOLUBLE_BARRIER_NAME,
    };
  });
}

function vector3Tuple(vector: THREE.Vector3): [number, number, number] {
  return [round(vector.x), round(vector.y), round(vector.z)];
}

function quaternionTuple(
  quaternion: THREE.Quaternion,
): [number, number, number, number] {
  return [
    round(quaternion.x),
    round(quaternion.y),
    round(quaternion.z),
    round(quaternion.w),
  ];
}

function round(value: number): number {
  const rounded = Number(value.toFixed(ROUNDING_PLACES));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function getParentPath(object: THREE.Object3D): string {
  const names: string[] = [];
  let parent = object.parent;
  while (parent) {
    names.push(parent.name || parent.type);
    parent = parent.parent;
  }
  return names.reverse().join('/');
}
