import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ContainmentLevelScene } from '../src/levels/ContainmentLevelScene.ts';
import { ContainmentLightLayout } from '../src/render/ContainmentLightLayout.ts';

test('all authored rooms and doorway overlaps prewarm bounded light signatures without changing authored sources', async () => {
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
      // Share Room 3's seventh point slot in the smaller layouts. The duct
      // keeps its existing six-point, ten-spot family.
      assert.equal(points, spots === 10 ? 6 : 7);
      assert.equal(spots, shadows);
      assert.ok(spots === 3 || spots === 6 || spots === 10);
      signatures.add([points, spots, shadows].join(':') );
      configurations++;
    });
    assert.equal(configurations, 9);
    assert.deepEqual(signatures, new Set(['6:10:10', '7:3:3', '7:6:6']));
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

test('camera culling retains offscreen sources that can light the view and restores a failed draw', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, .1, 100);
  const front = new THREE.SpotLight(0xffffff, 1, 5); front.position.z = -10;
  const behind = new THREE.SpotLight(0xffffff, 1, 5); behind.position.z = 10;
  const overlapping = new THREE.SpotLight(0xffffff, 1, 15); overlapping.position.z = 10;
  const unlimited = new THREE.SpotLight(0xffffff, 1, 0); unlimited.position.z = 10;
  const hidden = new THREE.SpotLight(0xffffff, 1, 5); hidden.visible = false;
  const lights = [front, behind, overlapping, unlimited, hidden];
  lights.forEach(light => light.castShadow = true);
  scene.add(...lights);
  const layout = new ContainmentLightLayout(scene);
  const objects: THREE.Object3D[] = [];
  scene.traverse(object => objects.push(object));
  const before = objects.map(object => object.visible);
  try {
    const inspect = () => {
      assert.equal(behind.visible, false);
      assert.equal(front.visible, true);
      assert.equal(overlapping.visible, true, 'a lamp behind the camera can still light visible receivers');
      assert.equal(unlimited.visible, true, 'unbounded sources cannot be rejected with a finite sphere');
      assert.equal(hidden.visible, false);
      let spots = 0;
      scene.traverseVisible(object => { if (object instanceof THREE.SpotLight) spots++; });
      assert.equal(spots, 3, 'use the already prepared small layout');
      assert.notEqual(layout.cameraCullKey, '');
    };
    assert.equal(layout.withCameraCulling(camera, () => { inspect(); return 42; }), 42);
    assert.deepEqual(objects.map(object => object.visible), before);
    assert.equal(layout.cameraCullKey, '');
    assert.throws(() => layout.withCameraCulling(camera, () => {
      inspect(); throw new Error('failed draw');
    }), /failed draw/);
    assert.deepEqual(objects.map(object => object.visible), before);
    assert.equal(layout.cameraCullKey, '');
    camera.rotation.y = Math.PI;
    layout.withCameraCulling(camera, () => assert.equal(behind.visible, true, 'turning back restores the source'));
    assert.deepEqual(objects.map(object => object.visible), before);
  } finally { layout.dispose(); }
});

test('the enclosed chamber uses three spots and restores source/padding visibility even when drawing fails', () => {
  const level = new ContainmentLevelScene(), scene = new THREE.Scene(); scene.add(level.root);
  const layout = new ContainmentLightLayout(scene), camera = new THREE.PerspectiveCamera(48, 16 / 9, .05, 300);
  camera.position.set(0, 1.7, -5.5); camera.lookAt(0, .8, -2.6);
  const objects: THREE.Object3D[] = []; scene.traverse(object => objects.push(object));
  const visibility = objects.map(object => object.visible);
  const sources: THREE.SpotLight[] = [];
  level.root.traverse(object => { if (object instanceof THREE.SpotLight) sources.push(object); });
  const authored = sources.map(light => [light.intensity, light.castShadow, light.shadow.map, light.shadow.autoUpdate, light.shadow.needsUpdate]);
  const inspect = () => {
    let points = 0, spots = 0;
    scene.traverseVisible(object => {
      if (object instanceof THREE.PointLight) points++;
      if (object instanceof THREE.SpotLight) spots++;
    });
    assert.equal(points, 7); assert.equal(spots, 3);
    assert.equal(layout.cameraCullKey, 'room-1-chamber');
    assert.ok(sources.filter(light => light.name.startsWith('room-1-to-2-duct-')).every(light => !light.visible));
  };
  try {
    assert.equal(layout.withRoomOneView({x:0,y:.46,z:-2.6}, camera, () => { inspect(); return 42; }), 42);
    assert.deepEqual(objects.map(object => object.visible), visibility);
    assert.throws(() => layout.withRoomOneView({x:0,y:.46,z:-2.6}, camera, () => { inspect(); throw new Error('failed draw'); }), /failed draw/);
    assert.deepEqual(objects.map(object => object.visible), visibility);
    assert.equal(layout.cameraCullKey, '');
    assert.deepEqual(sources.map(light => [light.intensity, light.castShadow, light.shadow.map, light.shadow.autoUpdate, light.shadow.needsUpdate]), authored);
  } finally { layout.dispose(); level.dispose(); }
});

test('upward vent views, climbing and either side of a trailing-camera transition retain the duct rig', () => {
  const level = new ContainmentLevelScene(), scene = new THREE.Scene(); scene.add(level.root);
  const layout = new ContainmentLightLayout(scene), camera = new THREE.PerspectiveCamera(48, 16 / 9, .05, 300);
  const cases = [
    ['look into vent', [0,.46,-2.6], [0,1.7,-4], [-4.8,5.9,5.9]],
    ['climbing before entry', [-4.8,4.6,5], [0,2,-4], [0,1,0]],
    ['actor in vent', [-4.8,5.7,6.3], [0,2,-4], [0,1,0]],
    ['camera in vent', [0,.46,0], [-4.8,6,6.5], [0,1,0]],
    ['camera outside chamber', [0,.46,0], [-7,2,0], [0,1,0]],
  ] as const;
  try {
    for (const [name,actor,eye,target] of cases) {
      camera.position.set(...eye); camera.lookAt(...target);
      layout.withRoomOneView({x:actor[0],y:actor[1],z:actor[2]},camera,()=>{
        assert.equal(layout.cameraCullKey, '', name);
        let spots = 0; scene.traverseVisible(object => { if (object instanceof THREE.SpotLight) spots++; });
        assert.equal(spots, 10, name);
      });
    }
    // Turning away and back must restore both layouts without persistent state.
    camera.position.set(0,1.7,-4); camera.lookAt(0,.8,-2);
    layout.withRoomOneView({x:0,y:.46,z:0},camera,()=>assert.equal(layout.cameraCullKey,'room-1-chamber'));
    camera.lookAt(-4.8,5.9,5.9);
    layout.withRoomOneView({x:0,y:.46,z:0},camera,()=>assert.equal(layout.cameraCullKey,''));
  } finally { layout.dispose(); level.dispose(); }
});
