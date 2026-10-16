import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { TitleAbilityPreview } from '../src/render/TitleAbilityPreview.ts';

function advance(preview: TitleAbilityPreview, seconds: number, reducedMotion = false): void {
  for (let time = 0; time < seconds; time += 0.01) preview.update(Math.min(0.01, seconds - time), reducedMotion);
}

test('hover previews jump, fire acid and request persistent illumination without changing gameplay', () => {
  const preview = new TitleAbilityPreview();
  try {
    preview.select('bob');
    advance(preview, 0.3);
    preview.select('bob'); // Pointer movement inside the same target must not restart the jump.
    advance(preview, 0.2);
    assert.ok(preview.poses.bob.lift > 0.7);
    assert.ok(preview.poses.bob.lift <= 0.85);
    preview.select(null);
    advance(preview, 0.7);
    assert.equal(preview.poses.bob.lift, 0);
    assert.equal(preview.poses.bob.scaleY, 1);
    assert.equal(preview.roots.bob.visible, false);

    preview.select('goop');
    advance(preview, 0.4);
    const projectile = preview.roots.goop.getObjectByName('title-goop-acid-projectile') as THREE.Mesh;
    assert.equal(projectile.visible, true);
    assert.ok(projectile.position.x > 0 && projectile.position.z < -0.42);
    assert.ok((projectile.material as THREE.MeshBasicMaterial).opacity > 0);
    advance(preview, 0.5);
    assert.equal(projectile.visible, false, 'the projectile gives way to the splash');

    preview.select('volt');
    advance(preview, 0.4);
    assert.equal(preview.blackoutRequested, true);
    assert.equal(preview.roots.volt.visible, true);
    assert.equal(preview.roots.volt.children.length, 0, 'Volt no longer creates an electrical beam');
    advance(preview, 6, true);
    assert.equal(preview.blackoutRequested, true, 'illumination lasts for the entire hover, even with reduced motion');
    preview.select(null);
    assert.equal(preview.blackoutRequested, false);
    preview.reset();
    for (const root of Object.values(preview.roots)) assert.equal(root.visible, false);
    assert.equal(preview.poses.volt.scaleY, 1);
  } finally { preview.dispose(); }
});

test('reduced motion keeps previews small and disables automatic repetition', () => {
  const preview = new TitleAbilityPreview();
  try {
    preview.select('bob');
    advance(preview, 0.5, true);
    assert.ok(preview.poses.bob.lift > 0 && preview.poses.bob.lift <= 0.22);
    advance(preview, 3, true);
    assert.equal(preview.roots.bob.visible, false);
    assert.equal(preview.poses.bob.lift, 0);
    preview.select('bob', true);
    advance(preview, 0.5, true);
    assert.ok(preview.poses.bob.lift > 0, 'explicit activation can replay the demonstration');
  } finally { preview.dispose(); }
});

test('hidden boot warms every VFX mesh, and repeated previews reuse and release resources', () => {
  const preview = new TitleAbilityPreview();
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  for (const root of Object.values(preview.roots)) root.traverse(object => {
    if (object instanceof THREE.Mesh) {
      geometries.add(object.geometry);
      materials.add(object.material as THREE.Material);
    }
  });
  let primedMeshes = 0;
  preview.withPrimedEffects(() => {
    for (const root of Object.values(preview.roots)) {
      assert.equal(root.visible, true);
      root.traverse(object => {
        assert.equal(object.visible, true);
        if (object instanceof THREE.Mesh) {
          primedMeshes++;
          assert.equal((object.material as THREE.Material).opacity, 0);
        }
      });
    }
  });
  assert.ok(primedMeshes > 5);
  for (const root of Object.values(preview.roots)) assert.equal(root.visible, false);
  for (let index = 0; index < 20; index++) {
    preview.select(index % 2 ? 'goop' : 'volt', true);
    advance(preview, 0.4);
  }
  let releases = 0;
  for (const resource of [...geometries, ...materials]) resource.addEventListener('dispose', () => { releases++; });
  preview.dispose();
  preview.dispose();
  assert.equal(releases, geometries.size + materials.size);
  for (const root of Object.values(preview.roots)) assert.equal(root.children.length, 0);
});

test('a blackout suppresses an acid effect still playing from the previous hover', () => {
  const preview = new TitleAbilityPreview();
  try {
    preview.select('goop');
    advance(preview, 0.4);
    const projectile = preview.roots.goop.getObjectByName('title-goop-acid-projectile') as THREE.Mesh;
    preview.dimForBlackout(1);
    assert.equal((projectile.material as THREE.Material).opacity, 0);
    preview.update(0, false);
    assert.equal((projectile.material as THREE.Material).opacity, 1);
  } finally { preview.dispose(); }
});
