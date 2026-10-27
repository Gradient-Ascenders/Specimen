import * as THREE from 'three';
import report from '../../../assets/characters/volt/volt.validation.json' with { type: 'json' };

export const VOLT_MORPHS = ['Squash', 'Stretch', 'Blink', 'CrestFlexLeft', 'CrestFlexRight'] as const;
export type VoltMorph = typeof VOLT_MORPHS[number];
export type VoltWeights = Record<VoltMorph, number>;
export const VOLT_EYE_BOUNDS = [report.meshes['Volt-Eye-Left'], report.meshes['Volt-Eye-Right']].map(eye =>
  new THREE.Box3(new THREE.Vector3(...eye.runtime_bounds_metres.minimum), new THREE.Vector3(...eye.runtime_bounds_metres.maximum)));
export interface VoltAsset {
  readonly root: THREE.Group;
  readonly body: THREE.Mesh;
  readonly eyes: readonly [THREE.Mesh, THREE.Mesh];
  readonly maps: readonly [THREE.Texture, THREE.Texture, THREE.Texture];
}
function fail(detail: string): never { throw new Error(`Volt asset contract: ${detail}`); }

/** Inspect imported data, including sparse/implicit-zero morphs expanded by GLTFLoader. */
export function validateVoltAsset(root: THREE.Group): VoltAsset {
  const character = root.getObjectByName('Volt');
  if (!character || character.parent !== root || root.children.length !== 1 || character.children.length !== 3) fail('invalid hierarchy');
  const metadata = character.userData;
  if (metadata.asset !== 'volt-lightning-gel-v3' || metadata.local_up !== '+Z Blender / +Y glTF' ||
      metadata.local_forward !== '+Y Blender / -Z glTF' || metadata.resting_contact_y_metres !== -0.45) fail('axis/contact metadata');
  root.traverse(object => {
    if (object.animations.length || object instanceof THREE.Bone || object instanceof THREE.SkinnedMesh ||
        object instanceof THREE.Light || object instanceof THREE.Camera) fail('unexpected animation, skin or studio object');
    if (![...object.position.toArray(), ...object.quaternion.toArray(), ...object.scale.toArray()].every(Number.isFinite) ||
        object.position.lengthSq() > 1e-12 || object.quaternion.angleTo(new THREE.Quaternion()) > 1e-6 ||
        object.scale.distanceTo(new THREE.Vector3(1, 1, 1)) > 1e-6) fail('non-identity transform');
  });
  const meshes = (Object.keys(report.meshes) as (keyof typeof report.meshes)[]).map((name, meshIndex) => {
    const mesh = character.getObjectByName(name);
    if (!(mesh instanceof THREE.Mesh) || mesh.parent !== character || mesh.children.length) fail(`hierarchy on ${name}`);
    const geometry = mesh.geometry, expected = report.meshes[name];
    const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
    if (!position || !normal || position.itemSize !== 3 || normal.itemSize !== 3 || position.count !== expected.vertices ||
        normal.count !== position.count || !geometry.index || geometry.index.count !== expected.triangles * 3 ||
        geometry.groups.length > 1 || geometry.drawRange.start !== 0 ||
        (geometry.drawRange.count !== Infinity && geometry.drawRange.count !== geometry.index.count) ||
        geometry.hasAttribute('skinIndex') || geometry.hasAttribute('skinWeight')) fail(`topology counts on ${name}`);
    for (const attribute of [position, normal]) for (let vertex = 0; vertex < attribute.count; vertex++) {
      if (![attribute.getX(vertex), attribute.getY(vertex), attribute.getZ(vertex)].every(Number.isFinite)) fail(`non-finite geometry on ${name}`);
      if (attribute === normal && Math.abs(Math.hypot(normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex)) - 1) > 0.02) fail(`normal on ${name}`);
    }
    if ((meshIndex === 0 && !uv) || (uv && (uv.itemSize !== 2 || uv.count !== position.count))) fail(`UVs on ${name}`);
    for (let vertex = 0; vertex < (uv?.count ?? 0); vertex++) if (![uv!.getX(vertex), uv!.getY(vertex)].every(v => Number.isFinite(v) && v >= -1e-6 && v <= 1 + 1e-6)) fail(`UV range on ${name}`);
    const bounds = new THREE.Box3().setFromBufferAttribute(position as THREE.BufferAttribute);
    const { minimum, maximum } = expected.runtime_bounds_metres;
    if (bounds.min.distanceTo(new THREE.Vector3(...minimum)) > 2e-5 || bounds.max.distanceTo(new THREE.Vector3(...maximum)) > 2e-5) fail(`approved bounds/contact on ${name}`);
    const dictionary = mesh.morphTargetDictionary, influences = mesh.morphTargetInfluences;
    if (!dictionary || !influences || influences.length !== 5 || Object.keys(dictionary).length !== 5 ||
        new Set(VOLT_MORPHS.map(key => dictionary[key])).size !== 5 || !geometry.morphTargetsRelative ||
        Object.keys(geometry.morphAttributes).some(key => key !== 'position' && key !== 'normal')) fail(`morph dictionary on ${name}`);
    for (const key of VOLT_MORPHS) {
      const index = dictionary[key];
      if (!Number.isInteger(index) || index < 0 || index >= 5 || influences[index] !== 0) fail(`neutral morph ${key} on ${name}`);
      for (const channel of ['position', 'normal'] as const) {
        const attribute = geometry.morphAttributes[channel]?.[index];
        if (!attribute || attribute.itemSize !== 3 || attribute.count !== position.count) fail(`relative morph ${channel} on ${name}`);
        for (let vertex = 0; vertex < attribute.count; vertex++) if (![attribute.getX(vertex), attribute.getY(vertex), attribute.getZ(vertex)].every(Number.isFinite)) fail(`non-finite morph on ${name}`);
      }
    }
    if (Array.isArray(mesh.material) || !(mesh.material instanceof THREE.MeshPhysicalMaterial) ||
        mesh.material.name !== (meshIndex === 0 ? 'Volt-Golden-Gel' : 'Volt-Obsidian-Eyes')) fail(`material on ${name}`);
    assertClosedConnected(mesh);
    return mesh;
  });
  const material = meshes[0]!.material as THREE.MeshPhysicalMaterial;
  const close = (value: number, expected: number) => Number.isFinite(value) && Math.abs(value - expected) < 1e-5;
  if (!close(material.color.r, 1) || !close(material.color.g, 1) || !close(material.color.b, 1) ||
      !close(material.ior, 1.38) || !close(material.transmission, 0.55) || !close(material.clearcoat, 0.26) ||
      !close(material.clearcoatRoughness, 0.20) || !close(material.emissive.r, 0.95) ||
      !close(material.emissive.g, 0.95) || !close(material.emissive.b, 0.95)) fail('golden gel material values');
  for (const eye of meshes.slice(1)) {
    const eyes = eye.material as THREE.MeshPhysicalMaterial;
    if (!close(eyes.color.r, 0.004) || !close(eyes.color.g, 0.0025) || !close(eyes.color.b, 0.001) ||
        !close(eyes.roughness, 0.23) || !close(eyes.clearcoat, 0.22) || !close(eyes.clearcoatRoughness, 0.18) || eyes.transmission || eyes.metalness) fail('obsidian eye material values');
  }
  const emission = material.emissiveMap, roughness = material.roughnessMap, colour=material.map;
  if (!emission || !roughness || !colour || new Set([emission,roughness,colour]).size!==3 || material.metalnessMap !== roughness ||
      emission.colorSpace !== THREE.SRGBColorSpace || colour.colorSpace!==THREE.SRGBColorSpace || roughness.colorSpace !== THREE.NoColorSpace ||
      Math.abs(material.roughness - 1) > 1e-6 || material.metalness !== 0) fail('continuous material ramps');
  const textures = new Set<THREE.Texture>();
  for (const mesh of meshes) for (const value of Object.values(mesh.material)) if (value instanceof THREE.Texture) textures.add(value);
  if (textures.size !== 3 || !textures.has(emission) || !textures.has(roughness) || !textures.has(colour)) fail('unexpected texture maps');
  for (const map of [emission, roughness, colour]) {
    const image = map.image as { width?: number; height?: number } | undefined;
    if (image?.width !== (map===roughness?64:2) || image?.height !== 512 || map.wrapS !== THREE.ClampToEdgeWrapping ||
        map.wrapT !== THREE.ClampToEdgeWrapping || map.channel !== 0 || map.flipY ||
        map.magFilter !== THREE.LinearFilter || map.minFilter !== THREE.LinearMipmapLinearFilter ||
        map.offset.lengthSq() || map.repeat.distanceTo(new THREE.Vector2(1, 1)) > 1e-6 || map.rotation) fail('texture dimensions/sampling');
  }
  return { root, body: meshes[0]!, eyes: [meshes[1]!, meshes[2]!], maps: [emission, roughness, colour] };
}

function assertClosedConnected(mesh: THREE.Mesh): void {
  const position = mesh.geometry.getAttribute('position'), index = mesh.geometry.index!;
  const edges = new Map<string, { count: number; winding: number }>();
  const adjacency = Array.from({ length: position.count }, () => new Set<number>());
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), cross = new THREE.Vector3(), edge = new THREE.Vector3();
  let volume = 0;
  for (let i = 0; i < index.count; i += 3) {
    const vertices = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    if (vertices.some(v => !Number.isInteger(v) || v < 0 || v >= position.count) || new Set(vertices).size !== 3) fail(`indices on ${mesh.name}`);
    a.fromBufferAttribute(position, vertices[0]!); b.fromBufferAttribute(position, vertices[1]!); c.fromBufferAttribute(position, vertices[2]!);
    volume += a.dot(cross.crossVectors(b, c)) / 6;
    if (cross.subVectors(b, a).cross(edge.subVectors(c, a)).lengthSq() < 1e-20) fail(`collapsed face on ${mesh.name}`);
    for (let j = 0; j < 3; j++) {
      const first = vertices[j]!, second = vertices[(j + 1) % 3]!;
      const key = `${Math.min(first, second)}:${Math.max(first, second)}`;
      const edge = edges.get(key) ?? { count: 0, winding: 0 };
      edge.count++; edge.winding += first < second ? 1 : -1; edges.set(key, edge);
      adjacency[first]!.add(second); adjacency[second]!.add(first);
    }
  }
  if (!(volume > 0) || [...edges.values()].some(edge => edge.count !== 2 || edge.winding !== 0)) fail(`closed manifold/winding on ${mesh.name}`);
  const visited = new Set<number>([0]), pending = [0];
  while (pending.length) for (const neighbour of adjacency[pending.pop()!]!) if (!visited.has(neighbour)) { visited.add(neighbour); pending.push(neighbour); }
  if (visited.size !== position.count) fail(`connectedness on ${mesh.name}`);
}

/** All resources are per-load owned. Reflection environments are borrowed. */
export function disposeVoltMaterials(materials: Iterable<THREE.Material>, retained: ReadonlySet<THREE.Texture> = new Set()): void {
  const textures = new Set<THREE.Texture>();
  for (const material of new Set(materials)) {
    for (const value of Object.values(material)) if (value instanceof THREE.Texture && !retained.has(value)) textures.add(value);
    material.dispose();
  }
  for (const texture of textures) texture.dispose();
}
export function disposeVoltAsset(root: THREE.Object3D, borrowed?: THREE.Texture | null): void {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of [object.material].flat()) materials.add(material);
    if (object.customDepthMaterial) materials.add(object.customDepthMaterial);
    if (object.customDistanceMaterial) materials.add(object.customDistanceMaterial);
  });
  for (const geometry of geometries) geometry.dispose();
  disposeVoltMaterials(materials, new Set(borrowed ? [borrowed] : []));
  root.removeFromParent(); root.clear();
}
