import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { SpecimenTrail } from '../src/render/specimen/SpecimenTrail.ts';
import { CameraBodyVisibility } from '../src/render/CameraBodyVisibility.ts';
import type { CameraRig } from '../src/render/CameraRig.ts';

test('movement aura leaves a bounded world-space trail and ignores idle carrier motion and teleports', () => {
  const trail = new SpecimenTrail(1.65), position = new THREE.Vector3(0, 2, 0), travel = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const geometry = trail.root.geometry, material = trail.root.material;
  let geometryDisposals = 0, materialDisposals = 0;
  geometry.addEventListener('dispose', () => geometryDisposals++);
  material.addEventListener('dispose', () => materialDisposals++);
  try {
    trail.setVisible(true); trail.update(1 / 60, position, travel, up, 18, 0);
    position.x += 20; trail.update(1 / 60, position, travel, up, 18, 0);
    assert.equal(trail.diagnostics.activeParticles, 0, 'carrier motion cannot emit a trail');
    for (let i = 0; i < 240; i++) {
      position.z -= 0.3; travel.z -= 0.3;
      trail.update(1 / 60, position, travel, up, 18, 0.5);
      assert.ok(trail.diagnostics.activeParticles <= 64);
    }
    assert.ok(trail.diagnostics.activeParticles > 10);
    assert.equal(trail.root.geometry, geometry); assert.equal(trail.root.material, material);
    assert.ok(geometry.getAttribute('position').array.every(Number.isFinite));
    const alpha = geometry.getAttribute('trailAlpha'), points = geometry.getAttribute('position');
    for (let i = 0; i < alpha.count; i++) if (alpha.getX(i) > 0) assert.ok(points.getZ(i) > position.z, 'wisps stay behind forward travel');
    position.z += 100; trail.update(1 / 60, position, travel, up, 18, 0);
    assert.equal(trail.diagnostics.activeParticles, 0, 'teleports clear the old world-space trail');
    for (let i = 0; i < 2; i++) {
      position.z -= 0.3; travel.z -= 0.3; trail.update(1 / 60, position, travel, up, 18, 0);
    }
    assert.ok(trail.diagnostics.activeParticles > 0);
    for (let i = 0; i < 60; i++) trail.update(1 / 60, position, travel, up, 18, 0);
    assert.equal(trail.diagnostics.visible, false, 'idle aura fades away');
    trail.setOpacity(0.3); assert.equal(material.uniforms.uOpacity!.value, 0.3);
    trail.setVisible(false); assert.equal(trail.diagnostics.activeParticles, 0);
  } finally { trail.dispose(); trail.dispose(); }
  assert.equal(geometryDisposals, 1); assert.equal(materialDisposals, 1);
});

test('aura preparation restores visibility, retries failures and primes its resources only once', () => {
  const trail = new SpecimenTrail(1.65), position = new THREE.Vector3(2, 3, 4);
  let draws = 0;
  try {
    assert.throws(() => trail.primeResources(position, () => { throw new Error('render failed'); }), /render failed/);
    assert.deepEqual(trail.diagnostics, { activeParticles: 0, capacity: 64, visible: false });
    const draw = (root: THREE.Object3D) => { draws++; assert.equal(root.visible, true); };
    trail.primeResources(position, draw); trail.primeResources(position, draw);
    assert.equal(draws, 1); assert.equal(trail.root.visible, false);
  } finally { trail.dispose(); }
});

test('first person suppresses aura only for the player camera and restores its material afterwards', () => {
  const trail = new SpecimenTrail(1.65), visibility = new CameraBodyVisibility();
  const camera = new THREE.PerspectiveCamera(), target = { position: new THREE.Vector3(), radiusMetres: 1.65 };
  visibility.configure({ camera, isFirstPersonForTarget: candidate => candidate === target } as CameraRig, target);
  visibility.bind(trail.root);
  const renderer = { getDrawingBufferSize: (size: THREE.Vector2) => size.set(800, 600) } as THREE.WebGLRenderer;
  const scene = new THREE.Scene(), material = trail.root.material;
  try {
    trail.root.onBeforeRender(renderer, scene, camera, trail.root.geometry, material, null);
    assert.equal(material.colorWrite, false);
    trail.root.onAfterRender(renderer, scene, camera, trail.root.geometry, material, null);
    assert.equal(material.colorWrite, true); assert.equal(material.depthWrite, false);
    trail.root.onBeforeRender(renderer, scene, new THREE.PerspectiveCamera(), trail.root.geometry, material, null);
    assert.equal(material.colorWrite, true);
  } finally { visibility.dispose(); trail.dispose(); }
});
