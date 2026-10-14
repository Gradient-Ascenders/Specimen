import * as THREE from 'three';

export const GOOP_EYE_BOUNDS = [
  new THREE.Box3(new THREE.Vector3(-0.375799, -0.303495, -0.441802), new THREE.Vector3(-0.075, 0.045, -0.147804)),
  new THREE.Box3(new THREE.Vector3(0.075, -0.303495, -0.464465), new THREE.Vector3(0.375799, 0.045, -0.147014)),
] as const;
const BODY_BOUNDS = new THREE.Box3(
  new THREE.Vector3(-0.704583, -0.45, -0.576371),
  new THREE.Vector3(0.75407, 0.849047, 0.700931),
);

export interface GoopAsset {
  readonly root: THREE.Group;
  readonly body: THREE.Mesh;
  readonly eyes: readonly [THREE.Mesh, THREE.Mesh];
  readonly bounds: THREE.Box3;
}

function fail(detail: string): never { throw new Error(`Goop asset contract: ${detail}`); }

/** Validate the actual static export, including its own Blender/glTF metadata. */
export function validateGoopAsset(root: THREE.Group): GoopAsset {
  const character = root.getObjectByName('Goop');
  if (!character || character.parent !== root || root.children.length !== 1 || character.children.length !== 3) fail('invalid hierarchy');
  const metadata = character.userData;
  if (metadata.asset !== 'goop-concept-sculpt-v1' ||
      metadata.local_up !== '+Y (glTF) / +Z (Blender)' ||
      metadata.local_forward !== '-Z (glTF) / +Y (Blender)' ||
      metadata.resting_contact_y_metres !== -0.45) fail('axis/contact metadata drifted');
  root.traverse(object => {
    if (object.animations.length || object instanceof THREE.Bone || object instanceof THREE.SkinnedMesh ||
        object instanceof THREE.Light || object instanceof THREE.Camera) fail('unexpected animation, skinning or studio object');
    if (object.position.lengthSq() > 1e-12 || object.quaternion.angleTo(new THREE.Quaternion()) > 1e-6 ||
        object.scale.distanceTo(new THREE.Vector3(1, 1, 1)) > 1e-6) fail('non-identity transform');
  });
  const names = ['Goop-Body', 'Goop-Eye-Left', 'Goop-Eye-Right'];
  const meshes = names.map((name, i) => {
    const mesh = character.getObjectByName(name);
    if (!(mesh instanceof THREE.Mesh) || mesh.parent !== character || mesh.children.length) fail(`missing or unexpected mesh ${name}`);
    if (Object.keys(mesh.geometry.morphAttributes).length || mesh.morphTargetInfluences ||
        mesh.geometry.hasAttribute('skinIndex') || mesh.geometry.hasAttribute('skinWeight')) fail(`unexpected morphs/skinning on ${name}`);
    const position = mesh.geometry.getAttribute('position');
    const normal = mesh.geometry.getAttribute('normal');
    const index = mesh.geometry.index;
    if (!position || !normal || position.itemSize !== 3 || normal.itemSize !== 3 ||
        position.count !== normal.count || !index || index.count !== [80412, 10368, 10368][i] ||
        position.count !== [13404, 1730, 1730][i]) fail(`topology counts on ${name}`);
    for (const attribute of [position, normal]) {
      for (let j = 0; j < attribute.count; j++) {
        if (![attribute.getX(j), attribute.getY(j), attribute.getZ(j)].every(Number.isFinite)) fail(`non-finite geometry on ${name}`);
        if (attribute === normal && Math.hypot(normal.getX(j), normal.getY(j), normal.getZ(j)) < 0.5) fail(`invalid normal on ${name}`);
      }
    }
    const bounds = new THREE.Box3().setFromBufferAttribute(position as THREE.BufferAttribute);
    const expected = i === 0 ? BODY_BOUNDS : GOOP_EYE_BOUNDS[i - 1]!;
    if (bounds.min.distanceTo(expected.min) > 2e-5 || bounds.max.distanceTo(expected.max) > 2e-5) fail(`approved bounds on ${name}`);
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (materials.length !== 1 || materials[0]!.name !== (i === 0 ? 'Goop-Acid-Gel' : 'Goop-Obsidian-Eyes')) fail(`material on ${name}`);
    assertClosedConnected(mesh);
    return mesh;
  });
  return { root, body: meshes[0]!, eyes: [meshes[1]!, meshes[2]!], bounds: BODY_BOUNDS.clone() };
}

function assertClosedConnected(mesh: THREE.Mesh): void {
  const position = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.index!;
  const edges = new Map<string, number>();
  const adjacency = Array.from({ length: position.count }, () => new Set<number>());
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < index.count; i += 3) {
    const vertices = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    if (vertices.some(v => !Number.isInteger(v) || v < 0 || v >= position.count) || new Set(vertices).size !== 3) fail(`invalid indices on ${mesh.name}`);
    a.fromBufferAttribute(position, vertices[0]!).sub(b.fromBufferAttribute(position, vertices[1]!));
    c.fromBufferAttribute(position, vertices[2]!).sub(b);
    if (a.cross(c).lengthSq() < 1e-20) fail(`degenerate triangle on ${mesh.name}`);
    for (let j = 0; j < 3; j++) {
      const first = vertices[j]!, second = vertices[(j + 1) % 3]!;
      const key = `${Math.min(first, second)}:${Math.max(first, second)}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
      adjacency[first]!.add(second); adjacency[second]!.add(first);
    }
  }
  if ([...edges.values()].some(count => count !== 2)) fail(`non-manifold mesh ${mesh.name}`);
  const visited = new Set<number>([0]), pending = [0];
  while (pending.length) for (const neighbour of adjacency[pending.pop()!]!) {
    if (!visited.has(neighbour)) { visited.add(neighbour); pending.push(neighbour); }
  }
  if (visited.size !== position.count) fail(`disconnected mesh ${mesh.name}`);
}

/** Imported textures are owned; environment textures are explicitly borrowed. */
export function disposeGoopMaterials(materials: Iterable<THREE.Material>, borrowed?: THREE.Texture | null): void {
  const textures = new Set<THREE.Texture>();
  for (const material of new Set(materials)) {
    for (const value of Object.values(material)) if (value instanceof THREE.Texture && value !== borrowed) textures.add(value);
    material.dispose();
  }
  for (const texture of textures) texture.dispose();
}

export function disposeGoopAsset(root: THREE.Object3D, borrowed?: THREE.Texture | null): void {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    if (object.customDepthMaterial) materials.add(object.customDepthMaterial);
    if (object.customDistanceMaterial) materials.add(object.customDistanceMaterial);
  });
  for (const geometry of geometries) geometry.dispose();
  disposeGoopMaterials(materials, borrowed);
  root.removeFromParent(); root.clear();
}
