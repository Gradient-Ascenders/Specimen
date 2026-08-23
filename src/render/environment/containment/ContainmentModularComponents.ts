import * as THREE from 'three';

import type { ContainmentArtResources } from './ContainmentArtResources.ts';
import type { ContainmentSignLabel } from './ContainmentProceduralTextures.ts';

export interface BoxModuleOptions {
  readonly name: string;
  readonly size: readonly [number, number, number];
  readonly position?: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
  readonly material: THREE.Material;
}

export interface BoxInstanceTransform {
  readonly position: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
}

export interface ChamferedInstanceTransform {
  readonly position: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
  readonly scale?: readonly [number, number, number];
}

export function createBorrowedBox(
  resources: ContainmentArtResources,
  options: BoxModuleOptions,
): THREE.Mesh {
  const mesh = new THREE.Mesh(resources.geometries.unitBox, options.material);
  mesh.name = options.name;
  mesh.scale.set(...options.size);
  if (options.position) mesh.position.set(...options.position);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  markVisualOnly(mesh);
  return mesh;
}

export function createChamferedBox(
  resources: ContainmentArtResources,
  options: BoxModuleOptions & { readonly radius?: number },
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    resources.borrowChamferedBoxGeometry(options.size, options.radius),
    options.material,
  );
  mesh.name = options.name;
  if (options.position) mesh.position.set(...options.position);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  markVisualOnly(mesh);
  return mesh;
}

export function createInstancedChamferedBoxes(
  resources: ContainmentArtResources,
  options: {
    readonly name: string;
    readonly size: readonly [number, number, number];
    readonly radius?: number;
    readonly material: THREE.Material;
    readonly transforms: readonly ChamferedInstanceTransform[];
  },
): THREE.InstancedMesh {
  const instances = new THREE.InstancedMesh(
    resources.borrowChamferedBoxGeometry(options.size, options.radius),
    options.material,
    options.transforms.length,
  );
  instances.name = options.name;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  options.transforms.forEach((transform, index) => {
    position.set(...transform.position);
    scale.set(...(transform.scale ?? [1, 1, 1]));
    if (transform.rotation) {
      euler.set(...transform.rotation);
      quaternion.setFromEuler(euler);
    } else {
      quaternion.identity();
    }
    matrix.compose(position, quaternion, scale);
    instances.setMatrixAt(index, matrix);
  });
  instances.instanceMatrix.needsUpdate = true;
  instances.computeBoundingBox();
  instances.computeBoundingSphere();
  markVisualOnly(instances);
  return instances;
}

export function createBorrowedCylinder(
  resources: ContainmentArtResources,
  options: BoxModuleOptions,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    resources.geometries.unitCylinder,
    options.material,
  );
  mesh.name = options.name;
  mesh.scale.set(...options.size);
  if (options.position) mesh.position.set(...options.position);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  markVisualOnly(mesh);
  return mesh;
}

export function createInstancedBoxes(
  resources: ContainmentArtResources,
  name: string,
  material: THREE.Material,
  transforms: readonly BoxInstanceTransform[],
): THREE.InstancedMesh {
  const instances = new THREE.InstancedMesh(
    resources.geometries.unitBox,
    material,
    transforms.length,
  );
  instances.name = name;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  transforms.forEach((transform, index) => {
    position.set(...transform.position);
    scale.set(...transform.size);
    if (transform.rotation) {
      euler.set(...transform.rotation);
      quaternion.setFromEuler(euler);
    } else {
      quaternion.identity();
    }
    matrix.compose(position, quaternion, scale);
    instances.setMatrixAt(index, matrix);
  });
  instances.instanceMatrix.needsUpdate = true;
  instances.computeBoundingBox();
  instances.computeBoundingSphere();
  markVisualOnly(instances);
  return instances;
}

/** A shallow XY frame suitable for a wall opening, door or status recess. */
export function createRectangularFrame(
  resources: ContainmentArtResources,
  options: {
    readonly name: string;
    readonly width: number;
    readonly height: number;
    readonly barWidth: number;
    readonly depth: number;
    readonly material: THREE.Material;
    readonly position: readonly [number, number, number];
  },
): THREE.Group {
  const root = new THREE.Group();
  root.name = options.name;
  root.position.set(...options.position);
  const halfWidth = options.width * 0.5;
  const halfHeight = options.height * 0.5;
  root.add(
    createBorrowedBox(resources, {
      name: `${options.name}-top`,
      size: [options.width, options.barWidth, options.depth],
      position: [0, halfHeight, 0],
      material: options.material,
    }),
    createBorrowedBox(resources, {
      name: `${options.name}-bottom`,
      size: [options.width, options.barWidth, options.depth],
      position: [0, -halfHeight, 0],
      material: options.material,
    }),
    createBorrowedBox(resources, {
      name: `${options.name}-left`,
      size: [options.barWidth, options.height, options.depth],
      position: [-halfWidth, 0, 0],
      material: options.material,
    }),
    createBorrowedBox(resources, {
      name: `${options.name}-right`,
      size: [options.barWidth, options.height, options.depth],
      position: [halfWidth, 0, 0],
      material: options.material,
    }),
  );
  markVisualOnly(root);
  return root;
}

export function createSignagePanel(
  resources: ContainmentArtResources,
  options: {
    readonly name: string;
    readonly label: ContainmentSignLabel;
    readonly size: readonly [number, number];
    readonly position: readonly [number, number, number];
    readonly rotation?: readonly [number, number, number];
  },
): { readonly mesh: THREE.Mesh; readonly geometry: THREE.PlaneGeometry } {
  const geometry = new THREE.PlaneGeometry(...options.size);
  geometry.name = `${options.name}-geometry`;
  const region = resources.textures.signRegions[options.label];
  const uv = geometry.getAttribute('uv');
  for (let index = 0; index < uv.count; index += 1) {
    uv.setXY(
      index,
      THREE.MathUtils.lerp(region.uMin, region.uMax, uv.getX(index)),
      // The deterministic atlas is authored top-to-bottom in its typed pixel
      // buffer. DataTexture addresses that first row at the bottom, so reverse
      // V within the selected row to keep the project-authored lettering
      // upright without changing which atlas label the plane selects.
      THREE.MathUtils.lerp(region.vMax, region.vMin, uv.getY(index)),
    );
  }
  uv.needsUpdate = true;
  const mesh = new THREE.Mesh(geometry, resources.materials.signage);
  mesh.name = options.name;
  mesh.position.set(...options.position);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  markVisualOnly(mesh);
  return { mesh, geometry };
}

export function markVisualOnly(object: THREE.Object3D): void {
  object.userData.visualOnly = true;
  object.userData.resourceOwnership = 'borrowed-containment-art';
}
