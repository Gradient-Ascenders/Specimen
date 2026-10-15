import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { CharacterDetail, readCharacterDetail } from '../src/render/slime/CharacterDetail.ts';
import { GoopCharacterPresentation } from '../src/render/goop/GoopCharacterPresentation.ts';
import { VoltCharacterPresentation } from '../src/render/volt/VoltCharacterPresentation.ts';
import { GelRendering } from '../src/render/slime/GelRendering.ts';
import { loadGoop } from './fixtures/GoopAssetFixture.ts';
import { loadVolt } from './fixtures/VoltAssetFixture.ts';

async function bank(character: string) {
  const bytes = await readFile(new URL(`../src/assets/characters/${character}-lod.bin`, import.meta.url));
  return readCharacterDetail(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

for (const character of ['goop', 'volt'] as const) test(`${character} distant detail preserves owned streams, materials, morphs and full-detail recovery`, async () => {
  const rendering = new GelRendering({ transmissionResolutionScale: 1 });
  const p = character === 'goop' ? new GoopCharacterPresentation(undefined, rendering) : new VoltCharacterPresentation(undefined, rendering);
  const root = await (character === 'goop' ? loadGoop() : loadVolt());
  const sourceIndices = new Map<string, number[]>();
  root.traverse(o => { if (o instanceof THREE.Mesh) sourceIndices.set(o.name, Array.from(o.geometry.index!.array)); });
  await p.prepare(async () => root, () => bank(character));
  const meshes: THREE.Mesh[] = [];
  root.traverse(o => { if (o instanceof THREE.Mesh) meshes.push(o); });
  const original = meshes.map(mesh => ({ geometry: mesh.geometry, material: mesh.material,
    depth: mesh.customDepthMaterial, distance: mesh.customDistanceMaterial, influences: mesh.morphTargetInfluences }));
  const fullTriangles = p.detailDiagnostics!.triangles;
  for (const mesh of meshes) assert.deepEqual(Array.from(mesh.geometry.index!.array).slice(0, mesh.geometry.drawRange.count), sourceIndices.get(mesh.name), 'the full-detail index range stays byte-for-byte unchanged');
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 200);
  camera.position.z = 5;
  p.updateDetail(camera);
  assert.equal(p.detailDiagnostics!.level, 'full');
  camera.position.z = 50; p.updateDetail(camera);
  assert.equal(p.detailDiagnostics!.level, 'distant');
  assert.ok(p.detailDiagnostics!.triangles < fullTriangles * 0.251);
  assert.equal(rendering.materialCount, 1);
  const body = meshes.find(mesh => mesh.name.endsWith('-Body'))!;
  const material = body.material as THREE.MeshPhysicalMaterial;
  const distantTriangles = p.detailDiagnostics!.triangles;
  for (const mode of ['minimum', 'reduced-transmission', 'physical'] as const) {
    rendering.setMode(mode);
    assert.equal(material.transmission, mode === 'minimum' ? 0 : character === 'goop' ? 0.28 : 0.55);
    assert.equal(p.detailDiagnostics!.triangles, distantTriangles, 'gel quality does not reset the selected LOD');
  }
  for (let i = 0; i < meshes.length; i++) {
    const mesh = meshes[i]!, full = original[i]!;
    assert.equal(mesh.geometry, full.geometry, 'LOD must not allocate duplicate GPU morph textures');
    for (const name of Object.keys(full.geometry.attributes)) assert.equal(mesh.geometry.getAttribute(name), full.geometry.getAttribute(name));
    assert.equal(mesh.geometry.morphAttributes, full.geometry.morphAttributes);
    assert.equal(mesh.geometry.morphTargetsRelative, full.geometry.morphTargetsRelative);
    assert.equal(mesh.morphTargetInfluences, full.influences);
    assert.equal(mesh.material, full.material); assert.equal(mesh.customDepthMaterial, full.depth); assert.equal(mesh.customDistanceMaterial, full.distance);
    assert.deepEqual(mesh.geometry.boundingBox, full.geometry.boundingBox);
    const edges = new Map<string, number>();
    const index = mesh.geometry.index!;
    for (let j = mesh.geometry.drawRange.start; j < mesh.geometry.drawRange.start + mesh.geometry.drawRange.count; j += 3) for (let edge = 0; edge < 3; edge++) {
      const a = index.getX(j + edge), b = index.getX(j + (edge + 1) % 3);
      const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
    assert.ok([...edges.values()].every(count => count === 2), 'LOD must stay closed, without holes');
  }
  if (character === 'volt') {
    const body = meshes.find(mesh => mesh.name === 'Volt-Body')!;
    assert.ok(body.geometry.morphAttributes.position!.some(attribute => attribute.name === 'Headroom'));
    p.onLanding({ x: 0, y: 1, z: 0 }, 9); p.present();
    for (const mesh of meshes) assert.ok(mesh.morphTargetDictionary!.Blink !== undefined);
  }
  camera.position.z = 5; p.updateDetail(camera);
  for (let i = 0; i < meshes.length; i++) assert.equal(meshes[i]!.geometry, original[i]!.geometry);
  assert.equal(p.detailDiagnostics!.triangles, fullTriangles);
  camera.position.z = 50; p.updateDetail(camera);
  let released = 0;
  for (const geometry of original.map(entry => entry.geometry)) geometry.addEventListener('dispose', () => released++);
  p.dispose(); p.dispose();
  assert.equal(rendering.materialCount, 0);
  assert.equal(released, 3, 'each shared geometry and its index bank are disposed exactly once');
});

for (const character of ['goop', 'volt'] as const) test(`${character} releases late detail loads and can retry a failed bank`, async () => {
  const create = () => character === 'goop' ? new GoopCharacterPresentation() : new VoltCharacterPresentation();
  const load = character === 'goop' ? loadGoop : loadVolt;
  const p = create();
  await assert.rejects(p.prepare(load, async () => { throw new Error('detail offline'); }), /detail offline/);
  assert.equal(p.ready, false);
  await p.prepare(load, () => bank(character));
  assert.equal(p.ready, true); p.dispose();
  const late = create(), root = await load();
  const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
  root.traverse(o => { if (o instanceof THREE.Mesh) {
    resources.add(o.geometry);
    for (const material of [o.material].flat()) {
      resources.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) resources.add(value);
    }
  } });
  const releases = new Map<object, number>();
  for (const resource of resources) resource.addEventListener('dispose', () => releases.set(resource, (releases.get(resource) ?? 0) + 1));
  let started!: () => void, finish!: (indices: Awaited<ReturnType<typeof bank>>) => void;
  const loading = new Promise<void>(resolve => { started = resolve; });
  const pending = late.prepare(async () => root, () => { started(); return new Promise(resolve => { finish = resolve; }); });
  await loading; late.dispose(); finish(await bank(character)); await pending;
  assert.equal(late.ready, false); assert.equal(root.children.length, 0);
  for (const resource of resources) assert.equal(releases.get(resource), 1);
});

test('projected-size hysteresis avoids LOD chatter and zoom restores full detail', () => {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1));
  mesh.name = 'fixture'; mesh.geometry.setIndex(Array.from({length: mesh.geometry.getAttribute('position').count}, (_, i) => i));
  mesh.geometry.computeBoundingSphere();
  const detail = new CharacterDetail(mesh, [mesh], [{ name: mesh.name, vertices: mesh.geometry.getAttribute('position').count, indices: new Uint16Array([0, 1, 2]) }]);
  const camera = new THREE.PerspectiveCamera(90);
  camera.position.z = 10; detail.update(camera); assert.equal(detail.diagnostics.level, 'full');
  camera.position.z = 12; detail.update(camera); assert.equal(detail.diagnostics.level, 'distant');
  camera.position.z = 10; detail.update(camera); assert.equal(detail.diagnostics.level, 'distant');
  camera.position.z = 8; detail.update(camera); assert.equal(detail.diagnostics.level, 'full');
  camera.position.z = 15; detail.update(camera); assert.equal(detail.diagnostics.level, 'distant');
  camera.zoom = 2; camera.updateProjectionMatrix(); detail.update(camera); assert.equal(detail.diagnostics.level, 'full');
  detail.dispose(); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose();
});

test('corrupt and mismatched detail banks fail before geometry ownership changes', async () => {
  assert.throws(() => readCharacterDetail(new ArrayBuffer(0)), /header/);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry());
  const geometry = mesh.geometry;
  assert.throws(() => new CharacterDetail(mesh, [mesh], []), /match/);
  assert.equal(mesh.geometry, geometry);
  const bytes = await readFile(new URL('../src/assets/characters/goop-lod.bin', import.meta.url));
  assert.throws(() => readCharacterDetail(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength - 1)), /mesh/);
  geometry.dispose(); (mesh.material as THREE.Material).dispose();
});
