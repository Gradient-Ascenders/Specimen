import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CultivationLightLayout, cultivationAuthoredLightMask } from '../src/render/CultivationLightLayout.ts';

const counts = (scene: THREE.Scene, camera: THREE.Camera) => {
  const result = { points: 0, spots: 0, pointShadows: 0, spotShadows: 0 };
  scene.traverseVisible(light => {
    if (!light.layers.test(camera.layers)) return;
    if (light instanceof THREE.PointLight) { result.points++; if (light.castShadow) result.pointShadows++; }
    if (light instanceof THREE.SpotLight) { result.spots++; if (light.castShadow) result.spotShadows++; }
  });
  return result;
};

function fixture() {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(60, 1, .1, 200);
  const focus = new THREE.Vector3(0, 1, -6);
  camera.position.set(0, 2, 4); camera.lookAt(focus); camera.updateMatrixWorld(true);
  const points = Array.from({length:17}, (_, i) => {
    const light = new THREE.PointLight(0x74abcd, 10 + i, 35);
    light.name = `point-${i}`; light.position.set((i - 8) * .5, 2, -7); scene.add(light); return light;
  });
  const spots = Array.from({length:9}, (_, i) => {
    const light = new THREE.SpotLight(0xff7733, 50, 30, .5);
    light.name = `guard-${i}`; light.castShadow = true;
    light.position.set((i - 4) * 1.5, 6, -8); light.target.position.copy(focus);
    scene.add(light, light.target); return light;
  });
  const volt = new THREE.PointLight(0xffdf22, 50, 12); volt.name = 'volt'; volt.castShadow = true;
  volt.position.copy(focus); scene.add(volt);
  const layout = new CultivationLightLayout(scene); layout.restore();
  return { scene, camera, focus, points, spots, volt, layout };
}

test('maintenance preserves its source caps with shared shader slots', () => {
  const f = fixture();
  const authored = [...f.points, ...f.spots, f.volt];
  const before = authored.map(l => [l.parent, l.visible, l.layers.mask, l.intensity, l.color.getHex(), l.distance, l.castShadow]);
  try {
    f.layout.withLayout(f.scene, f.camera, f.focus, () => {
      assert.deepEqual(counts(f.scene, f.camera), {points:5, spots:3, pointShadows:1, spotShadows:3});
      assert.equal(f.layout.diagnostics.profile, 'maintenance');
      assert.ok(f.layout.diagnostics.selectedPoints > 0 && f.layout.diagnostics.selectedSpots > 0);
      assert.ok(f.layout.diagnostics.scheduledShadowPasses <= 9, 'three spot maps plus at most six point faces');
    });
    assert.deepEqual(authored.map(l => [l.parent,l.visible,l.layers.mask,l.intensity,l.color.getHex(),l.distance,l.castShadow]), before);
  } finally { f.layout.dispose(); }
});

test('source changes and repeated power toggles keep one maintenance signature and exclude powered-down radiance', () => {
  const f = fixture();
  try {
    for (let i = 0; i < 30; i++) {
      f.spots.forEach((light, index) => light.intensity = index % 3 === i % 3 ? 0 : 45);
      f.points.forEach((light, index) => light.intensity = i % 2 && index % 2 ? 0 : 20);
      f.volt.intensity = i % 2 ? 0 : 50;
      f.layout.withLayout(f.scene, f.camera, f.focus, () => {
        assert.deepEqual(counts(f.scene, f.camera), {points:5, spots:3, pointShadows:1, spotShadows:3});
        assert.equal(f.layout.signature, '5:1:3:3');
        for (const light of [...f.points, ...f.spots, f.volt]) {
          if (!light.intensity) assert.equal(light.layers.test(f.camera.layers), false);
        }
      });
    }
  } finally { f.layout.dispose(); }
});

test('ordinary rooms and lift share shaders without expanding selected light caps', () => {
  const f = fixture();
  try {
    f.spots.forEach(light => light.userData.cultivationTraversalShadowLight = true);
    f.volt.visible = false;
    for (const [points, spots] of [[2,1], [8,2], [17,4], [2,1]] as const) {
      f.points.forEach((light, i) => light.visible = i < points);
      f.spots.forEach((light, i) => light.visible = i < spots);
      f.layout.withLayout(f.scene, f.camera, f.focus, () => {
        assert.equal(f.layout.signature, '5:1:3:3');
        assert.deepEqual(counts(f.scene, f.camera), {points:5, spots:3, pointShadows:1, spotShadows:3});
        assert.ok(f.layout.diagnostics.selectedPoints <= (points === 2 ? 2 : 4));
        assert.ok(f.layout.diagnostics.selectedSpots <= (spots === 1 ? 1 : 2));
        assert.equal(f.layout.diagnostics.selectedNames.includes('volt'), false);
      });
    }
  } finally { f.layout.dispose(); }
});

test('camera selection omits distant sources while leaving emitter children and authored masks intact', () => {
  const f = fixture();
  const emitter = new THREE.Object3D(); f.points[0].add(emitter);
  f.points[0].position.set(0, 2, 100); f.points[0].distance = 2;
  const mask = f.points[0].layers.mask;
  try {
    assert.throws(() => f.layout.withLayout(f.scene, f.camera, f.focus, () => {
      assert.equal(f.points[0].layers.test(f.camera.layers), false);
      assert.equal(cultivationAuthoredLightMask(f.points[0]), mask, 'preparation must clone the authored mask during exclusion');
      assert.equal(f.points[0].visible, true);
      assert.equal(emitter.layers.test(f.camera.layers), true);
      assert.equal(emitter.visible, true);
      assert.ok(f.layout.diagnostics.outsideView > 0);
      throw new Error('draw failed');
    }), /draw failed/);
    assert.equal(f.points[0].layers.mask, mask);
    f.points[0].layers.set(2);
    assert.equal(cultivationAuthoredLightMask(f.points[0]), 4, 'outside a draw the current owner mask is authoritative');
    assert.equal(f.layout.root.visible, false);
  } finally { f.layout.dispose(); }
});

test('source discovery is explicit and refresh does not retain removed owners', () => {
  const f = fixture();
  try {
    const extra = new THREE.PointLight(0xff0000, 500, 20); extra.name = 'new-source'; extra.position.copy(f.focus); f.scene.add(extra);
    f.layout.refreshSources(f.scene);
    f.layout.withLayout(f.scene, f.camera, f.focus, () => assert.ok(f.layout.diagnostics.selectedNames.includes('new-source')));
    extra.removeFromParent(); f.layout.refreshSources(f.scene);
    f.layout.withLayout(f.scene, f.camera, f.focus, () => assert.equal(f.layout.diagnostics.selectedNames.includes('new-source'), false));
  } finally { f.layout.dispose(); }
});

test('hysteresis keeps near-equal sources stable but never retains a powered-down light', () => {
  const f = fixture();
  try {
    f.volt.visible = false;
    f.spots.forEach(light => light.userData.cultivationTraversalShadowLight = true);
    f.points.forEach((light, i) => {light.position.copy(f.focus);light.intensity=i<3?1000:i===3?10:i===4?9.5:0;});
    const selected = () => f.layout.withLayout(f.scene,f.camera,f.focus,()=>[...f.layout.diagnostics.selectedNames]);
    assert.ok(selected().includes('point-3'));
    f.points[4].intensity = 11;
    assert.ok(selected().includes('point-3'));
    f.points[4].intensity = 20;
    assert.ok(selected().includes('point-4'));
    f.points[4].intensity = 0;
    assert.equal(selected().includes('point-4'), false);
  } finally {f.layout.dispose();}
});

test('only filler maps are owned by the layout and teardown releases each exactly once', () => {
  const f = fixture();
  let authoredDisposals = 0, fillerDisposals = 0;
  f.volt.shadow.map = new THREE.WebGLCubeRenderTarget(1);
  f.volt.shadow.map.addEventListener('dispose', () => authoredDisposals++);
  f.layout.root.traverse(light => {
    if (!(light instanceof THREE.SpotLight || light instanceof THREE.PointLight) || !light.castShadow) return;
    light.shadow.map = new THREE.WebGLRenderTarget(1, 1);
    light.shadow.map.addEventListener('dispose', () => fillerDisposals++);
    assert.equal(light.shadow.autoUpdate, false);
    assert.deepEqual(light.shadow.mapSize.toArray(), [1, 1]);
  });
  f.layout.sync(f.scene, f.camera, f.focus);
  f.layout.dispose(); f.layout.dispose();
  assert.equal(fillerDisposals, 4); assert.equal(authoredDisposals, 0);
  assert.equal(f.volt.layers.mask, 1);
  assert.equal(f.layout.root.parent, null);
  f.volt.dispose(); assert.equal(authoredDisposals, 1);
});
