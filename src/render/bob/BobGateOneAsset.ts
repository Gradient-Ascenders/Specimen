import * as THREE from 'three';

export const BOB_GATE_ONE_ROOT_NAME = 'Bob-Gate-One';
export const BOB_GATE_ONE_BODY_NAME = 'Bob-Body';
export const BOB_GATE_ONE_EYE_NAMES = [
  'Bob-Eye-Left',
  'Bob-Eye-Right',
] as const;
const BOB_GATE_ONE_BODY_MATERIAL_NAME = 'Bob-Neutral-Body';
const BOB_GATE_ONE_EYE_MATERIAL_NAME = 'Bob-Neutral-Eyes';

const EXPECTED_BODY_SIZE = new THREE.Vector3(1, 0.8, 0.9);
const EXPECTED_BODY_MINIMUM = new THREE.Vector3(-0.5, -0.45, -0.45);
const EXPECTED_BODY_MAXIMUM = new THREE.Vector3(0.5, 0.35, 0.45);
const DIMENSION_TOLERANCE_METRES = 1e-5;
const IDENTITY_SCALE = new THREE.Vector3(1, 1, 1);
const IDENTITY_QUATERNION = new THREE.Quaternion();

export interface BobGateOneAsset {
  readonly root: THREE.Group;
  readonly body: THREE.Mesh;
  readonly eyes: readonly [THREE.Mesh, THREE.Mesh];
  readonly bounds: THREE.Box3;
}

function requireMesh(root: THREE.Group, name: string): THREE.Mesh {
  const object = root.getObjectByName(name);
  if (!(object instanceof THREE.Mesh) || object instanceof THREE.SkinnedMesh) {
    throw new Error(`Bob Gate 1 asset contract: missing static mesh "${name}".`);
  }
  return object;
}

function assertIdentityTransform(object: THREE.Object3D): void {
  if (
    object.position.lengthSq() > Number.EPSILON ||
    object.quaternion.angleTo(IDENTITY_QUATERNION) > Number.EPSILON ||
    object.scale.distanceToSquared(IDENTITY_SCALE) > Number.EPSILON
  ) {
    throw new Error(
      `Bob Gate 1 asset contract: "${object.name}" must have an identity transform.`,
    );
  }
}

function assertVector(
  actual: THREE.Vector3,
  expected: THREE.Vector3,
  label: string,
): void {
  if (actual.distanceTo(expected) > DIMENSION_TOLERANCE_METRES) {
    throw new Error(
      `Bob Gate 1 asset contract: ${label} was ${actual.toArray().join(', ')}, ` +
        `expected ${expected.toArray().join(', ')}.`,
    );
  }
}

function triangleCount(mesh: THREE.Mesh): number {
  const index = mesh.geometry.index;
  return index
    ? index.count / 3
    : mesh.geometry.getAttribute('position').count / 3;
}

function assertMaterialName(mesh: THREE.Mesh, expectedName: string): void {
  const materials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  if (materials.length !== 1 || materials[0]?.name !== expectedName) {
    const actual = materials.map(({ name }) => name).join(', ');
    throw new Error(
      `Bob Gate 1 asset contract: "${mesh.name}" uses material "${actual}", ` +
        `expected "${expectedName}".`,
    );
  }
}

function assertWatertightBody(body: THREE.Mesh): void {
  const index = body.geometry.index;
  const positions = body.geometry.getAttribute('position');
  if (!index || index.count % 3 !== 0) {
    throw new Error(
      'Bob Gate 1 asset contract: body topology is not one watertight component.',
    );
  }

  const edgeUse = new Map<string, number>();
  const adjacency = Array.from(
    { length: positions.count },
    () => new Set<number>(),
  );
  const addEdge = (first: number, second: number): void => {
    const minimum = Math.min(first, second);
    const maximum = Math.max(first, second);
    const key = `${minimum}:${maximum}`;
    edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
    adjacency[first]?.add(second);
    adjacency[second]?.add(first);
  };

  for (let offset = 0; offset < index.count; offset += 3) {
    const a = index.getX(offset);
    const b = index.getX(offset + 1);
    const c = index.getX(offset + 2);
    if (a === b || b === c || c === a) {
      throw new Error(
        'Bob Gate 1 asset contract: body topology is not one watertight component.',
      );
    }
    addEdge(a, b);
    addEdge(b, c);
    addEdge(c, a);
  }

  if ([...edgeUse.values()].some((useCount) => useCount !== 2)) {
    throw new Error(
      'Bob Gate 1 asset contract: body topology is not one watertight component.',
    );
  }

  const visited = new Set<number>();
  const pending = [index.getX(0)];
  while (pending.length > 0) {
    const vertex = pending.pop();
    if (vertex === undefined || visited.has(vertex)) continue;
    visited.add(vertex);
    for (const neighbour of adjacency[vertex] ?? []) {
      if (!visited.has(neighbour)) pending.push(neighbour);
    }
  }
  if (visited.size !== positions.count) {
    throw new Error(
      'Bob Gate 1 asset contract: body topology is not one watertight component.',
    );
  }
}

/** Validate the exported neutral asset through its runtime-visible hierarchy. */
export function validateBobGateOneAsset(root: THREE.Group): BobGateOneAsset {
  if (root.animations.length !== 0) {
    throw new Error('Bob Gate 1 asset contract: neutral asset has animations.');
  }
  assertIdentityTransform(root);

  const assetRoot = root.getObjectByName(BOB_GATE_ONE_ROOT_NAME);
  if (!(assetRoot instanceof THREE.Object3D)) {
    throw new Error(
      `Bob Gate 1 asset contract: missing root "${BOB_GATE_ONE_ROOT_NAME}".`,
    );
  }
  assertIdentityTransform(assetRoot);
  if (assetRoot.parent !== root) {
    throw new Error(
      `Bob Gate 1 asset contract: "${BOB_GATE_ONE_ROOT_NAME}" must be a ` +
        'direct child of the loaded scene.',
    );
  }

  const body = requireMesh(root, BOB_GATE_ONE_BODY_NAME);
  const eyes = BOB_GATE_ONE_EYE_NAMES.map((name) => requireMesh(root, name)) as [
    THREE.Mesh,
    THREE.Mesh,
  ];
  for (const mesh of [body, ...eyes]) {
    if (mesh.parent !== assetRoot) {
      throw new Error(
        `Bob Gate 1 asset contract: "${mesh.name}" must be a direct child of ` +
          `"${BOB_GATE_ONE_ROOT_NAME}".`,
      );
    }
  }
  if (root.children.length !== 1) {
    throw new Error(
      `Bob Gate 1 asset contract: "${BOB_GATE_ONE_ROOT_NAME}" must be the ` +
        'only direct child of the loaded scene.',
    );
  }
  assertWatertightBody(body);
  assertMaterialName(body, BOB_GATE_ONE_BODY_MATERIAL_NAME);
  for (const eye of eyes) {
    assertMaterialName(eye, BOB_GATE_ONE_EYE_MATERIAL_NAME);
  }
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Bone) {
      throw new Error('Bob Gate 1 asset contract: bones are not permitted.');
    }
    if (object instanceof THREE.SkinnedMesh) {
      throw new Error('Bob Gate 1 asset contract: armatures are not permitted.');
    }
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  if (meshes.length !== 3) {
    throw new Error(
      `Bob Gate 1 asset contract: expected 3 meshes, received ${meshes.length}.`,
    );
  }
  if (
    assetRoot.children.length !== 3 ||
    assetRoot.children.some((child) => !meshes.includes(child as THREE.Mesh))
  ) {
    throw new Error(
      `Bob Gate 1 asset contract: "${BOB_GATE_ONE_ROOT_NAME}" may contain ` +
        'only the body and two eye meshes.',
    );
  }

  for (const mesh of meshes) {
    assertIdentityTransform(mesh);
    if (mesh.morphTargetInfluences !== undefined) {
      throw new Error(
        `Bob Gate 1 asset contract: "${mesh.name}" contains premature morphs.`,
      );
    }
  }

  body.geometry.computeBoundingBox();
  const localBounds = body.geometry.boundingBox;
  if (!localBounds) {
    throw new Error('Bob Gate 1 asset contract: body has no bounds.');
  }
  const bounds = localBounds.clone();
  assertVector(bounds.getSize(new THREE.Vector3()), EXPECTED_BODY_SIZE, 'size');
  assertVector(bounds.min, EXPECTED_BODY_MINIMUM, 'minimum bounds');
  assertVector(bounds.max, EXPECTED_BODY_MAXIMUM, 'maximum bounds');

  const bodyTriangles = triangleCount(body);
  const eyeTriangles = eyes.reduce(
    (sum, eye) => sum + triangleCount(eye),
    0,
  );
  if (bodyTriangles < 2_000 || bodyTriangles > 3_500) {
    throw new Error(
      `Bob Gate 1 asset contract: body has ${bodyTriangles} triangles.`,
    );
  }
  if (eyeTriangles > 600 || bodyTriangles + eyeTriangles > 4_100) {
    throw new Error(
      `Bob Gate 1 asset contract: eye/total triangle budget exceeded ` +
        `(${eyeTriangles}/${bodyTriangles + eyeTriangles}).`,
    );
  }

  return { root, body, eyes, bounds };
}

/** Dispose every unique GPU resource owned by one loaded Bob instance. */
export function disposeBobGateOneAsset(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    const meshMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of meshMaterials) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  root.removeFromParent();
  root.clear();
}
