import { maintenanceMaps } from './helpers/BlackoutMaintenanceMapData.ts';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { BlackoutMaintenanceMaterials, type BlackoutMaterialFamily } from '../src/render/environment/blackout/BlackoutMaintenanceMaterials.ts';
import { mapBlackoutBoxUVs } from '../src/render/environment/blackout/BlackoutMaintenanceUVs.ts';
import { consolidateStaticRoomVisuals } from '../src/render/StaticRoomVisuals.ts';
import { BlackoutMaintenanceBay } from '../src/levels/BlackoutMaintenanceBay.ts';
import { BlackoutLevelScene } from '../src/levels/BlackoutLevelScene.ts';

const families: BlackoutMaterialFamily[] = ['wallPanel', 'ceilingPanel', 'floorDeck', 'acidPlatform', 'basinMetal', 'warningPaint', 'ductSteel', 'machineryMetal', 'dronePaint'];
const maps = (m: THREE.MeshStandardMaterial) => [m.map!, m.roughnessMap!, m.normalMap!] as THREE.DataTexture[];
const hash = (array: ArrayBufferView) => createHash('sha256').update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex');

test('shared deterministic maps use sRGB albedo, linear data and a bounded complete mip chain', () => {
  const a = new BlackoutMaintenanceMaterials(maintenanceMaps), b = new BlackoutMaintenanceMaterials(maintenanceMaps);
  try {
    assert.equal(a.diagnostics.textureCount, 0, 'families allocate only when requested');
    for (const family of families) {
      const material = a.get(family);
      assert.equal(material, a.get(family));
      const first = maps(material), second = maps(b.get(family));
      assert.equal(first[0].colorSpace, THREE.SRGBColorSpace);
      for (const [index, texture] of first.entries()) {
        assert.equal(hash(texture.image.data), hash(second[index].image.data));
        if (index > 0) assert.equal(texture.colorSpace, THREE.NoColorSpace);
        assert.equal(texture.wrapS, THREE.RepeatWrapping); assert.equal(texture.wrapT, THREE.RepeatWrapping);
        assert.equal(texture.generateMipmaps, true); assert.equal(texture.minFilter, THREE.LinearMipmapLinearFilter);
      }
      // Actual tangent-space vectors, not greyscale masquerading as normals.
      const data = first[2].image.data;
      for (let i = 0; i < data.length; i += 4) {
        const length = Math.hypot(data[i] / 127.5 - 1, data[i + 1] / 127.5 - 1, data[i + 2] / 127.5 - 1);
        assert.ok(Math.abs(length - 1) < .015); assert.ok(data[i + 2] > 127);
      }
    }
    assert.equal(a.diagnostics.materialCount, 9); assert.equal(a.diagnostics.textureCount, 27);
    assert.ok(a.diagnostics.estimatedTextureBytes < 8 * 1024 * 1024);
  } finally { a.dispose(); b.dispose(); }
});

test('platform palette remains dark olive-grey with no source of self illumination', () => {
  const kit = new BlackoutMaintenanceMaterials(maintenanceMaps);
  try {
    const m = kit.get('acidPlatform'), data = (m.map as THREE.DataTexture).image.data;
    assert.equal(m.emissive.getHex(), 0); assert.equal(m.emissiveIntensity, 0); assert.equal(m.emissiveMap, null);
    const sums = [0, 0, 0];
    for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) {
      sums[c] += data[i + c]; assert.ok(data[i + c] < 65, 'no bright navigation markings');
    }
    assert.ok(sums[1] > sums[2]); assert.ok(sums[0] > sums[2]);
  } finally { kit.dispose(); }
});

test('metric UVs agree across adjacent wall pieces and leave all collision data untouched', () => {
  const left = new THREE.BoxGeometry(3, 6, .4), right = new THREE.BoxGeometry(3, 6, .4);
  const positions = left.getAttribute('position'), normals = left.getAttribute('normal'), index = left.index;
  left.computeBoundingBox(); const bounds = left.boundingBox;
  const original = hash(positions.array);
  mapBlackoutBoxUVs(left, new THREE.Matrix4(), [3, 3]);
  mapBlackoutBoxUVs(right, new THREE.Matrix4().makeTranslation(3, 0, 0), [3, 3]);
  const shared = (g: THREE.BufferGeometry, x: number) => {
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), uv = g.getAttribute('uv');
    const result = [];
    for (let i = 0; i < p.count; i++) if (p.getX(i) === x && n.getZ(i) === 1) result.push([p.getY(i), uv.getX(i), uv.getY(i)]);
    return result.sort((a, b) => a[0] - b[0]);
  };
  assert.deepEqual(shared(left, 1.5), shared(right, -1.5));
  assert.equal(left.getAttribute('position'), positions); assert.equal(hash(positions.array), original);
  assert.equal(left.getAttribute('normal'), normals); assert.equal(left.index, index); assert.equal(left.boundingBox, bounds);
  const top = shared(left, 1.5); assert.equal(top[1][2] - top[0][2], 2, 'six metres repeats twice');
  left.dispose(); right.dispose();
});

test('rotated ramps preserve surface distance and object anchoring survives rigid motion', () => {
  const geometry = new THREE.BoxGeometry(7, .18, Math.hypot(5.5, 1));
  const matrix = new THREE.Matrix4().makeRotationX(-Math.atan2(1, 5.5)).setPosition(12.4, -.59, 45.25);
  mapBlackoutBoxUVs(geometry, matrix, [1.5, 1.5]);
  const uv = geometry.getAttribute('uv'), normal = geometry.getAttribute('normal'), values = [];
  for (let i = 0; i < normal.count; i++) if (normal.getY(i) === 1) values.push(uv.getY(i));
  assert.ok(Math.abs(Math.max(...values) - Math.min(...values) - Math.hypot(5.5, 1) / 1.5) < 1e-5);
  mapBlackoutBoxUVs(geometry, matrix, [2, 2], 'object');
  const before = [...geometry.getAttribute('uv').array];
  mapBlackoutBoxUVs(geometry, new THREE.Matrix4().makeRotationY(.7).setPosition(80, 20, 0), [2, 2], 'object');
  assert.deepEqual([...geometry.getAttribute('uv').array], before);
  geometry.dispose();
});

test('textured batches preserve UVs, shadow roles and collider identities, restoring borrowed materials on disposal', () => {
  const root = new THREE.Group(), kit = new BlackoutMaintenanceMaterials(maintenanceMaps), material = kit.get('wallPanel');
  const sources = [0, 3].map(x => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(3, 6, .4), material);
    m.name = `panel-${x}`; m.position.x = x; m.castShadow = m.receiveShadow = true; m.renderOrder = -1; m.updateMatrix();
    mapBlackoutBoxUVs(m.geometry, m.matrix, [3, 3]); root.add(m); return m;
  });
  const geometries = sources.map(m => m.geometry), positions = sources.map(m => hash(m.geometry.attributes.position.array));
  const uvs = sources.flatMap(m => [...m.geometry.attributes.uv.array]);
  const batch = consolidateStaticRoomVisuals(root, sources);
  assert.equal(batch.diagnostics.drawCallsRemoved, 1);
  const visual = root.getObjectByName(`${root.name}-batched-static-visuals`)!.children[0] as THREE.Mesh;
  assert.equal(visual.material, material); assert.deepEqual([...visual.geometry.attributes.uv.array], uvs);
  assert.equal(visual.castShadow, true); assert.equal(visual.receiveShadow, true);
  assert.equal(visual.renderOrder, -1, 'opaque enclosure ordering survives consolidation');
  for (const [i, source] of sources.entries()) {
    assert.equal(source.parent, root); assert.equal(source.geometry, geometries[i]);
    assert.equal(hash(source.geometry.attributes.position.array), positions[i]); assert.equal((source.material as THREE.Material).visible, false);
  }
  batch.dispose(); batch.dispose();
  for (const source of sources) { assert.equal(source.material, material); source.geometry.dispose(); }
  kit.dispose();
});

test('all 63 authored mesh fingerprints match the untextured main baseline', () => {
  const baseline = JSON.parse(readFileSync(new URL('./fixtures/blackout-maintenance-authored-surfaces.json', import.meta.url), 'utf8'));
  const bay = new BlackoutMaintenanceBay(maintenanceMaps);
  try {
    assert.equal(bay.collisionMeshes.length, 55);
    for (const saved of baseline.surfaces) {
      const mesh = bay.root.getObjectByName(saved.name) as THREE.Mesh;
      assert.ok(mesh, saved.name); assert.equal(bay.collisionMeshes.includes(mesh), saved.collider);
      assert.deepEqual(mesh.position.toArray(), saved.position); assert.deepEqual(mesh.rotation.toArray(), saved.rotation);
      assert.deepEqual(mesh.scale.toArray(), saved.scale); assert.deepEqual(mesh.userData, saved.userData);
      assert.equal(hash(mesh.geometry.attributes.position.array), saved.positionHash, saved.name);
      assert.equal(hash(mesh.geometry.attributes.normal.array), saved.normalHash, saved.name);
      assert.equal(hash(mesh.geometry.index!.array), saved.indexHash, saved.name);
      assert.equal(mesh.castShadow, saved.castShadow); assert.equal(mesh.receiveShadow, saved.receiveShadow);
    }
  } finally { bay.dispose(); }
});

test('bay acid retains its authored material and pulse; hallway and duct use non-emissive textures', () => {
  const bay = new BlackoutMaintenanceBay(maintenanceMaps);
  try {
    const acid = (bay.root.getObjectByName('animated-acid-surface') as THREE.Mesh).material as THREE.MeshStandardMaterial;
    assert.equal(acid.color.getHex(), 0x30391c); assert.equal(acid.emissive.getHex(), 0x101606);
    assert.equal(acid.emissiveIntensity, .055); assert.equal(acid.map, null);
    for (let i = 1; i <= 30; i++) {
      bay.update(.1, false); const expected = .035 + (.5 + .5 * Math.sin(i * .1 * 3.7)) * .02;
      assert.ok(Math.abs(acid.emissiveIntensity - expected) < 1e-12);
    }
    for (const name of ['hallway-floor', 'hallway-ramp', 'vent-interior-floor', 'volt-rising-duct-floor']) {
      const m = (bay.root.getObjectByName(name) as THREE.Mesh).material as THREE.MeshStandardMaterial;
      // Batched colliders carry hidden copies; the map remains on that copy.
      assert.ok(m.map, `${name} is textured`);
      assert.equal(m.emissiveIntensity, 0);
    }
  } finally { bay.dispose(); }
});

test('scene teardown releases each shared kit map and visible material exactly once', () => {
  const scene = new BlackoutLevelScene(true, maintenanceMaps), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  scene.maintenanceBay!.root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m.visible || !m.name.startsWith('blackout-')) continue;
      materials.add(m); maps(m as THREE.MeshStandardMaterial).forEach(t => textures.add(t));
    }
  });
  assert.equal(materials.size, 8); assert.equal(textures.size, 24);
  const counts = new Map<object, number>();
  for (const item of [...materials, ...textures]) { counts.set(item, 0); item.addEventListener('dispose', () => counts.set(item, counts.get(item)! + 1)); }
  scene.dispose(); scene.dispose();
  for (const count of counts.values()) assert.equal(count, 1);
  assert.equal(scene.root.children.length, 0);
});

test('all three fixed stepping foundations share one material with metre-scale varied wear', () => {
  const bay = new BlackoutMaintenanceBay(maintenanceMaps);
  try {
    const steps = bay.collisionMeshes.filter(mesh => mesh.name.startsWith('bob-route-platform-'));
    assert.deepEqual(steps.map(mesh => mesh.position.z), [17, 28.5, 40]);
    const material = steps[0].material as THREE.MeshStandardMaterial;
    for (const step of steps) {
      assert.equal(step.material, material); assert.equal(material.emissiveIntensity, 0);
      const uv = step.geometry.attributes.uv, normal = step.geometry.attributes.normal;
      const u = [], v = [];
      for (let i = 0; i < normal.count; i++) if (normal.getY(i) === 1) { u.push(uv.getX(i)); v.push(uv.getY(i)); }
      assert.ok(Math.abs(Math.max(...u) - Math.min(...u) - 2) < 1e-5);
      assert.ok(Math.abs(Math.max(...v) - Math.min(...v) - 2) < 1e-5);
    }
    assert.equal(new Set(steps.map(mesh => hash(mesh.geometry.attributes.uv.array))).size, 3);
  } finally { bay.dispose(); }
});
