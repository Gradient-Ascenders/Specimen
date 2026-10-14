import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ContainmentLevelScene } from '../src/levels/ContainmentLevelScene.ts';
import { ContainmentLightLayout } from '../src/render/ContainmentLightLayout.ts';

test('all authored rooms and doorway overlaps share two bounded light signatures without changing authored sources', async () => {
  const level = new ContainmentLevelScene(), scene = new THREE.Scene();
  scene.add(level.root);
  const authored: THREE.Light[] = [];
  level.root.traverse(object => { if (object instanceof THREE.Light) authored.push(object); });
  const before = authored.map(light => ({light, castShadow:light.castShadow, position:light.position.toArray(), color:light.color.toArray()}));
  const layout = new ContainmentLightLayout(scene);
  let configurations = 0;
  const signatures = new Set<string>();
  try {
    await level.lighting.prewarmShaderConfigurations(async () => {
      layout.sync();
      let points = 0, spots = 0, shadows = 0;
      scene.traverseVisible(object => {
        if (object instanceof THREE.PointLight) { points++; assert.equal(object.castShadow, false); }
        if (object instanceof THREE.SpotLight) { spots++; if (object.castShadow) shadows++; }
      });
      assert.equal(points, 3);
      assert.equal(spots, shadows);
      assert.ok(spots === 3 || spots === 10);
      signatures.add([points, spots, shadows].join(':') );
      configurations++;
    });
    assert.equal(configurations, 9);
    assert.deepEqual(signatures, new Set(['3:3:3', '3:10:10']));
    for (const {light, castShadow, position, color} of before) {
      assert.equal(light.castShadow, castShadow);
      assert.deepEqual(light.position.toArray(), position);
      assert.deepEqual(light.color.toArray(), color);
    }
    layout.root.traverse(object => {
      if (!(object instanceof THREE.Light)) return;
      assert.equal(object.intensity, 0);
      if (object instanceof THREE.SpotLight) {
        assert.deepEqual(object.shadow.mapSize.toArray(), [1, 1]);
        assert.equal(object.shadow.autoUpdate, false);
        assert.ok(object.position.length() > 10000);
      }
    });
  } finally { layout.dispose(); level.dispose(); }
});

test('padding releases every initialized shadow map once and leaves authored maps owned by the level', () => {
  const scene = new THREE.Scene(), authored = new THREE.SpotLight();
  authored.castShadow = true; authored.shadow.map = new THREE.WebGLRenderTarget(1, 1); scene.add(authored);
  let authoredDisposals = 0, paddingDisposals = 0;
  authored.shadow.map.addEventListener('dispose', () => authoredDisposals++);
  const layout = new ContainmentLightLayout(scene);
  layout.root.traverse(object => {
    if (!(object instanceof THREE.SpotLight)) return;
    object.shadow.map = new THREE.WebGLRenderTarget(1, 1);
    object.shadow.map.addEventListener('dispose', () => paddingDisposals++);
  });
  layout.dispose(); layout.dispose();
  assert.equal(paddingDisposals, 10);
  assert.equal(authoredDisposals, 0);
  assert.equal(scene.children.includes(layout.root), false);
  authored.dispose();
});
