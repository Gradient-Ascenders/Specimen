import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { LevelTwoPreviewScene } from '../../src/levels/LevelTwoPreviewScene.ts';
import { cultivationAssets } from '../lib/read-cultivation-assets.ts';
import { visitLevelTwoSurfaceStates } from '../lib/level-two-surface-states.ts';

const root = process.argv[2];
if (!root) throw new Error('Usage: node scripts/diagnostics/compare-cultivation-bake.ts <baseline-checkout>');
const baseline = await import(pathToFileURL(resolve(root, 'src/levels/LevelTwoPreviewScene.ts')).href);
const states = await import(pathToFileURL(resolve(root, 'scripts/lib/level-two-surface-states.ts')).href);
const hash = (array: ArrayBufferView) => createHash('sha256').update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
const pixelHashes = new WeakMap<ArrayBufferView, string>();
const pixelHash = (array: ArrayBufferView) => {
  let value = pixelHashes.get(array);
  if (!value) { value = hash(array); pixelHashes.set(array, value); }
  return value;
};
const geometry = (geometry: THREE.BufferGeometry) => ({
  attributes: Object.fromEntries(Object.entries(geometry.attributes).sort(([a], [b]) => a.localeCompare(b)).map(([name, attr]) => [name, {
    type: attr.array.constructor.name, size: attr.itemSize, normalized: attr.normalized, bytes: hash(attr.array),
  }])),
  index: geometry.index ? hash(geometry.index.array) : null, groups: geometry.groups,
});
const material = (material: THREE.Material) => {
  const values = material as unknown as Record<string, any>;
  const maps: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value instanceof THREE.DataTexture) maps[key] = {
      pixels: pixelHash(value.image.data!), width: value.image.width, height: value.image.height,
      colorSpace: value.colorSpace, repeat: value.repeat.toArray(), offset: value.offset.toArray(),
      wrap: [value.wrapS, value.wrapT], filter: [value.minFilter, value.magFilter], mipmaps: value.generateMipmaps,
    };
  }
  return { name: material.name, type: material.type, visible: material.visible, transparent: material.transparent,
    opacity: material.opacity, side: material.side, depthWrite: material.depthWrite,
    color: values.color?.toArray(), emissive: values.emissive?.toArray(), roughness: values.roughness,
    metalness: values.metalness, emissiveIntensity: values.emissiveIntensity, maps };
};
function snapshot(scene: LevelTwoPreviewScene) {
  const meshes: unknown[] = [];
  const visit = (object: THREE.Object3D, path: string) => {
    if (object instanceof THREE.Mesh) meshes.push({path, name: object.name,
      position: object.position.toArray(), quaternion: object.quaternion.toArray(), scale: object.scale.toArray(),
      visible: object.visible, castShadow: object.castShadow, receiveShadow: object.receiveShadow, layers: object.layers.mask,
      geometry: geometry(object.geometry), material: (Array.isArray(object.material) ? object.material : [object.material]).map(material),
      instances: object instanceof THREE.InstancedMesh ? hash(object.instanceMatrix.array) : null,
    });
    object.children.forEach((child, index) => visit(child, `${path}/${index}`));
  };
  visit(scene.root, 'root');
  const identity = (mesh: THREE.Mesh) => ({name: mesh.name, geometry: geometry(mesh.geometry), metadata: structuredClone(mesh.userData),
    position: mesh.position.toArray(), quaternion: mesh.quaternion.toArray(), scale: mesh.scale.toArray()});
  return { meshes, colliders: scene.collisionMeshes.map(identity), dynamic: scene.dynamicCollisionMeshes.map(mesh => mesh.name), soluble: scene.solubleTargetMeshes.map(mesh => mesh.name) };
}

const source = new baseline.LevelTwoPreviewScene(() => {});
const expected = new Map<string, ReturnType<typeof snapshot>>();
try { states.visitLevelTwoSurfaceStates(source, (state: string) => expected.set(state, snapshot(source))); }
finally { source.dispose(); }
const baked = new LevelTwoPreviewScene(() => {}, cultivationAssets);
try {
  visitLevelTwoSurfaceStates(baked, state => {
    const actual = snapshot(baked), before = expected.get(state)!;
    assert.equal(actual.meshes.length, before.meshes.length, `${state}: mesh count`);
    // Report one mesh at a time so a mismatch never prints the complete scene.
    for (let i = 0; i < actual.meshes.length; i++) assert.deepEqual(actual.meshes[i], before.meshes[i], `${state}: mesh ${i}`);
    assert.equal(actual.colliders.length, before.colliders.length, `${state}: collider count`);
    for (let i = 0; i < actual.colliders.length; i++) assert.deepEqual(actual.colliders[i], before.colliders[i], `${state}: collider ${i}`);
    assert.deepEqual(actual.dynamic, before.dynamic, `${state}: dynamic identities`);
    assert.deepEqual(actual.soluble, before.soluble, `${state}: soluble identities`);
    console.log(`${state}: ${actual.meshes.length} meshes and ${actual.colliders.length} colliders match exactly, including geometry/UV/texture bytes and transforms.`);
  });
} finally { baked.dispose(); }
