import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createHash } from 'node:crypto';

const bytes = readFileSync(new URL('../assets/characters/volt/volt.glb',import.meta.url));
const document = JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
const report = JSON.parse(readFileSync(new URL('../assets/characters/volt/volt.validation.json',import.meta.url),'utf8'));
const names = ['Squash','Stretch','Blink','CrestFlexLeft','CrestFlexRight'];

function vectorAccessor(index: number): Float32Array {
  const accessor = document.accessors[index];
  const binaryOffset = 20+bytes.readUInt32LE(12)+8;
  const result = new Float32Array(accessor.count*3);
  if (accessor.bufferView !== undefined) {
    const view = document.bufferViews[accessor.bufferView];
    const offset = binaryOffset+(view.byteOffset ?? 0)+(accessor.byteOffset ?? 0);
    const stride = view.byteStride ?? 12;
    for (let vertex=0;vertex<accessor.count;vertex++) for (let channel=0;channel<3;channel++) {
      result[vertex*3+channel] = bytes.readFloatLE(offset+vertex*stride+channel*4);
    }
  }
  // Empty accessors are implicit zero; sparse morphs replace only moved vertices.
  if (accessor.sparse) {
    const sparse = accessor.sparse;
    const indicesView = document.bufferViews[sparse.indices.bufferView];
    const valuesView = document.bufferViews[sparse.values.bufferView];
    const indicesOffset = binaryOffset+(indicesView.byteOffset ?? 0)+(sparse.indices.byteOffset ?? 0);
    const valuesOffset = binaryOffset+(valuesView.byteOffset ?? 0)+(sparse.values.byteOffset ?? 0);
    const component = sparse.indices.componentType;
    assert.ok([5121,5123,5125].includes(component));
    for (let item=0;item<sparse.count;item++) {
      const vertex = component===5121 ? bytes.readUInt8(indicesOffset+item) : component===5123 ? bytes.readUInt16LE(indicesOffset+item*2) : bytes.readUInt32LE(indicesOffset+item*4);
      assert.ok(vertex<accessor.count);
      for (let channel=0;channel<3;channel++) result[vertex*3+channel] = bytes.readFloatLE(valuesOffset+item*12+channel*4);
    }
  }
  return result;
}

test('Volt exports a compact character hierarchy and continuous embedded material ramps',() => {
  assert.equal(bytes.toString('ascii',0,4),'glTF');
  assert.equal(bytes.readUInt32LE(4),2);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  assert.deepEqual(document.meshes.map((mesh: {name: string}) => mesh.name).sort(),['Volt-Body','Volt-Eye-Left','Volt-Eye-Right']);
  assert.equal(document.nodes.length,4);
  assert.equal(document.materials.length,2);
  assert.equal(document.images.length,3);
  for (const mesh of document.meshes) assert.equal(mesh.primitives.length,1);
  for (const image of document.images) { assert.equal(image.mimeType,'image/png'); assert.equal(typeof image.bufferView,'number'); assert.equal(image.uri,undefined); }
  const body = document.materials.find((material: {name: string}) => material.name==='Volt-Golden-Gel');
  assert.equal(typeof body.emissiveTexture.index,'number');
  assert.equal(typeof body.pbrMetallicRoughness.baseColorTexture.index,'number');
  assert.equal(typeof body.pbrMetallicRoughness.metallicRoughnessTexture.index,'number');
  assert.equal(document.animations,undefined);
  assert.equal(document.skins,undefined);
});

test('Every Volt mesh exposes the same named, neutral morph controls with finite position deltas',() => {
  for (const mesh of document.meshes) {
    assert.deepEqual(mesh.extras.targetNames,names);
    assert.deepEqual(mesh.weights,[0,0,0,0,0]);
    for (const primitive of mesh.primitives) {
      assert.equal(primitive.targets.length,names.length);
      for (const target of primitive.targets) {
        const accessor = document.accessors[target.POSITION];
        assert.equal(accessor.type,'VEC3'); assert.equal(accessor.componentType,5126);
        assert.equal(accessor.count,document.accessors[primitive.attributes.POSITION].count);
        for (const value of vectorAccessor(target.POSITION)) assert.ok(Number.isFinite(value));
      }
    }
  }
});

test('Volt keeps its contact and animation contract with the revised compact crest',() => {
  assert.equal(report.runtime_up,'+Y'); assert.equal(report.runtime_forward,'-Z');
  assert.equal(report.resting_contact_y_metres,-0.45);
  assert.equal(report.total_triangles,38208);
  assert.ok(report.design.crest_height_metres<report.design.body_height_metres);
  assert.equal(report.design.floating_effect_meshes,0);
  const bounds=report.meshes['Volt-Body'].runtime_bounds_metres;
  assert.ok(bounds.maximum[0]-bounds.minimum[0]>1.45);
  assert.ok(bounds.maximum[1]-bounds.minimum[1]<1.5);
  assert.deepEqual(report.morph_names,names);
  for (const mesh of Object.values(report.meshes) as {non_manifold_edges: number; connected_components: number}[]) {
    assert.equal(mesh.non_manifold_edges,0); assert.equal(mesh.connected_components,1);
  }
});

test('approved GLB and generator sources retain their hashes independently of editable Blender bytes', () => {
  const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');
  assert.equal(hash(bytes), '7784bfef3694150064110026f15722c3f40958ac71995fbaa50a9772b16ceb77');
  for (const [name, digest] of Object.entries(report.sources)) {
    assert.equal(hash(readFileSync(new URL(`../assets/characters/volt/${name}`, import.meta.url))), digest);
  }
  const roundtrip = JSON.parse(readFileSync(new URL('../assets/characters/volt/volt.roundtrip.json', import.meta.url), 'utf8'));
  assert.equal(roundtrip.glb_sha256,hash(bytes));
  assert.deepEqual(roundtrip.sculpt_geometry_sha256,Object.fromEntries(
    Object.entries(report.meshes).map(([name,mesh]:[string,any])=>[name,mesh.geometry_sha256])));
  assert.equal(roundtrip.floating_electrical_effects,0);
});
