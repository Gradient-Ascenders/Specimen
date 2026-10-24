import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createPrewarmResourceBatches, renderIsolatedPrewarmResources } from '../src/render/IsolatedResourcePrewarm.ts';

test('upload batches cover hidden/overlapping owners once without moving original objects', () => {
  const parent = new THREE.Group(), hidden = new THREE.Group(), geometry = new THREE.BoxGeometry(), material = new THREE.MeshBasicMaterial();
  parent.add(hidden); hidden.visible = false;
  for (let i = 0; i < 21; i++) hidden.add(new THREE.Mesh(geometry, material));
  const before = hidden.children.slice(), batches = createPrewarmResourceBatches([parent, hidden, ...before.slice(0, 5)], 8);
  assert.deepEqual(batches.map(batch => batch.length), [8, 8, 5]);
  assert.deepEqual(batches.flat(), before);
  assert.equal(hidden.visible, false); assert.deepEqual(hidden.children, before);
  for (const object of before) assert.equal(object.parent, hidden);
  for (const limit of [0, -1, .5]) assert.throws(() => createPrewarmResourceBatches([parent], limit));
  geometry.dispose(); material.dispose();
});

test('an isolated leaf batch cannot accidentally upload its unselected mesh descendants', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), parent = new THREE.Group();
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshBasicMaterial();
  const selected = new THREE.Mesh(geometry, material), child = new THREE.Mesh(geometry, material);
  parent.visible = false; selected.visible = false; selected.add(child); parent.add(selected); scene.add(parent);
  const light = new THREE.DirectionalLight(); scene.add(light);
  const masks = [camera.layers.mask, selected.layers.mask, child.layers.mask, light.layers.mask];
  const renderer = { render: () => {
    assert.equal(parent.visible, true); assert.equal(selected.visible, true);
    assert.equal(selected.layers.test(camera.layers), true);
    assert.equal(child.layers.test(camera.layers), false, 'A mesh parent must not pull a whole hierarchy into this batch.');
    assert.equal(light.layers.test(camera.layers), true);
  } } as unknown as THREE.WebGLRenderer;
  renderIsolatedPrewarmResources(renderer, scene, camera, [selected], { includeHidden: true, includeDescendants: false });
  assert.deepEqual([camera.layers.mask, selected.layers.mask, child.layers.mask, light.layers.mask], masks);
  assert.equal(parent.visible, false); assert.equal(selected.visible, false); assert.equal(child.visible, true);
  geometry.dispose(); material.dispose();
});

test('batches omit invisible materials while retaining dormant art, mixed materials and visible children', () => {
  const geometry = new THREE.BoxGeometry(), visible = new THREE.MeshBasicMaterial(), hidden = new THREE.MeshBasicMaterial({visible: false});
  const collider = new THREE.Mesh(geometry, hidden), child = new THREE.Mesh(geometry, visible);
  const dormant = new THREE.Mesh(geometry, visible), mixed = new THREE.Mesh(geometry, [hidden, visible]);
  dormant.visible = false; collider.add(child);
  assert.deepEqual(createPrewarmResourceBatches([collider, dormant, mixed]).flat(), [child, dormant, mixed]);
  geometry.dispose(); visible.dispose(); hidden.dispose();
});

test('a matching layout reuses prepared leaves while new descendants and other layouts remain required', () => {
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshBasicMaterial();
  const parent = new THREE.Mesh(geometry, material), child = new THREE.Mesh(geometry, material);
  parent.add(child); parent.visible = false;
  const prepared = new Set<THREE.Object3D>([parent]);
  assert.deepEqual(createPrewarmResourceBatches([parent, child], 8, prepared).flat(), [child]);
  assert.deepEqual([...prepared], [parent], 'Collection must not mark buffers ready before their draw completes.');
  prepared.add(child);
  assert.deepEqual(createPrewarmResourceBatches([parent], 8, prepared), []);
  assert.deepEqual(createPrewarmResourceBatches([parent], 8, new Set()).flat(), [parent, child],
    'A different lighting/program layout still requires its own real bindings.');
  assert.equal(parent.visible, false); assert.equal(child.parent, parent);
  geometry.dispose(); material.dispose();
});
