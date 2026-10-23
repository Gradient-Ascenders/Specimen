// Compare the delivered variant with the retained parts of the original GLB.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseSpecimenAsset } from '../../../../../src/render/specimen/SpecimenAsset.ts';

const directory = new URL('./', import.meta.url);
const removed = new Set(['Specimen-Acid-Core', 'Specimen-Aqua-Currents']);
const retained = ['Specimen-Body', 'Specimen-Electric-Veins', 'Specimen-Eye-Left', 'Specimen-Eye-Right'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function load(relative) {
  const bytes = await readFile(new URL(relative, directory));
  const document = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const binary = bytes.subarray(28 + bytes.readUInt32LE(12));
  const root = await parseSpecimenAsset(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  root.updateMatrixWorld(true);
  const meshes = new Map();
  root.traverse(object => { if (object.isMesh) meshes.set(object.name, object); });
  return { bytes, document, binary, root, meshes };
}

const source = await load('../../specimen.glb');
const variant = await load('specimen-lightning-only.glb');
assert.deepEqual(variant.document.meshes.map(mesh => mesh.name).sort(), retained.toSorted());
assert.equal(variant.meshes.size, 6);
assert.equal(variant.root.getObjectByName('The_Specimen').userData.asset, 'specimen-lightning-only-v1');
assert.ok(!variant.document.cameras && !variant.document.skins && !variant.document.images);
assert.ok(variant.document.nodes.every(node => !node.extensions?.KHR_lights_punctual));
assert.equal(variant.document.nodes.length, 5);

let triangles = 0;
for (const [name, mesh] of variant.meshes) {
  const original = source.meshes.get(name);
  assert.ok(original, name);
  assert.deepEqual(mesh.matrixWorld.elements, original.matrixWorld.elements, `${name} transform`);
  assert.equal(mesh.material.name, original.material.name);
  assert.deepEqual(mesh.morphTargetDictionary, original.morphTargetDictionary, `${name} morph names`);
  assert.deepEqual(mesh.morphTargetInfluences, original.morphTargetInfluences, `${name} resting weights`);
  assert.deepEqual(mesh.geometry.index.array, original.geometry.index.array, `${name} indices`);
  for (const property of ['attributes', 'morphAttributes']) {
    assert.deepEqual(Object.keys(mesh.geometry[property]), Object.keys(original.geometry[property]));
    for (const key of Object.keys(mesh.geometry[property])) {
      const actual = [mesh.geometry[property][key]].flat();
      const expected = [original.geometry[property][key]].flat();
      assert.equal(actual.length, expected.length);
      actual.forEach((attribute, index) => {
        assert.equal(attribute.itemSize, expected[index].itemSize);
        assert.equal(attribute.normalized, expected[index].normalized);
        assert.deepEqual(attribute.array, expected[index].array, `${name} ${property} ${key} ${index}`);
        assert.ok(attribute.array.every(Number.isFinite));
      });
    }
  }
  triangles += mesh.geometry.index.count / 3;
}
assert.equal(triangles, 81040);
assert.equal(variant.document.materials.length, 5);
for (const material of variant.document.materials) {
  assert.deepEqual(material, source.document.materials.find(item => item.name === material.name));
}

// Canonicalize accessor payloads and material-pointer indices so the removed
// meshes cannot hide a change to retained morph or lightning pulse tracks.
function accessor(asset, index) {
  const value = asset.document.accessors[index];
  assert.ok(!value.sparse);
  const view = asset.document.bufferViews[value.bufferView];
  const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[value.type];
  const bytes = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[value.componentType] * width;
  assert.ok(bytes > 0);
  const offset = (view.byteOffset ?? 0) + (value.byteOffset ?? 0);
  const payload = createHash('sha256');
  for (let i = 0; i < value.count; i++) {
    const start = offset + i * (view.byteStride ?? bytes);
    payload.update(asset.binary.subarray(start, start + bytes));
  }
  return [value.type, value.componentType, value.count, value.normalized ?? false, payload.digest('hex')];
}

function channels(asset, animation) {
  return animation.channels.flatMap(channel => {
    const target = channel.target;
    const name = asset.document.nodes[target.node]?.name;
    if (removed.has(name)) return [];
    let binding = `${name}:${target.path}`;
    if (target.path === 'pointer') {
      const pointer = target.extensions.KHR_animation_pointer.pointer;
      binding = pointer.replace(/^\/materials\/(\d+)\//, (_, index) => `/materials/${asset.document.materials[index].name}/`);
    }
    const sampler = animation.samplers[channel.sampler];
    return [{ binding, interpolation: sampler.interpolation ?? 'LINEAR',
      input: accessor(asset, sampler.input), output: accessor(asset, sampler.output) }];
  }).sort((a, b) => a.binding.localeCompare(b.binding));
}

const animations = {};
assert.deepEqual(variant.root.animations.map(clip => clip.name), ['Idle', 'Settle', 'Charge']);
for (const clip of variant.root.animations) {
  assert.equal(clip.duration, { Idle: 5, Settle: 2, Charge: 3 }[clip.name]);
  const actual = variant.document.animations.find(animation => animation.name === clip.name);
  const expected = source.document.animations.find(animation => animation.name === clip.name);
  assert.deepEqual(channels(variant, actual), channels(source, expected), `${clip.name} channels`);
  assert.equal(actual.channels.filter(channel => channel.target.path === 'pointer').length, 2);
  animations[clip.name] = { seconds: clip.duration, morph_regions: clip.tracks.length, lightning_pulse_channels: 2 };
}

const report = { source_glb_sha256: hash(source.bytes), variant_glb_sha256: hash(variant.bytes),
  loader: 'parseSpecimenAsset / Three.js', mesh_regions: variant.meshes.size, materials: 5, triangles,
  retained_geometry_morphs_transforms_and_materials_exact: true,
  retained_animation_and_lightning_pulse_samples_exact: true, studio_excluded: true, animations };
await writeFile(new URL('specimen-lightning-only.roundtrip.json', directory), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
