import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { LevelTwoPreviewScene } from '../src/levels/LevelTwoPreviewScene.ts';
import { BlackoutMaintenanceBay } from '../src/levels/BlackoutMaintenanceBay.ts';
import { applyCultivationShadowRoles } from '../src/render/environment/cultivation/CultivationShadowCoverage.ts';
import { disposeShadowLight } from '../src/render/ShadowLightResources.ts';

test('ordinary Cultivation coverage uses seven bounded sources and preserves Room 5 point baseline', () => {
  const scene = new LevelTwoPreviewScene(() => {});
  try {
    for (const [room, expected] of [[scene.roomOne, 2], [scene.roomTwo, 2], [scene.roomThree, 2], [scene.roomFour, 1]] as const) {
      const spots: THREE.SpotLight[] = [];
      room.root.traverse(o => { if (o instanceof THREE.SpotLight && o.castShadow) spots.push(o); });
      assert.equal(spots.length, expected);
      for (const spot of spots) {
        assert.deepEqual(spot.shadow.mapSize.toArray(), [512, 512]);
        assert.equal(spot.userData.cultivationTraversalShadowLight, true);
        assert.ok(spot.distance <= 48);
      }
    }
    const volt = scene.roomFive.root.getObjectByName('room-5-volt-glow') as THREE.PointLight;
    assert.ok(volt instanceof THREE.PointLight);
    assert.deepEqual(volt.shadow.mapSize.toArray(), [512, 512]);
    assert.equal(volt.intensity, 50); assert.equal(volt.distance, 12);
    assert.equal(scene.roomFive.captiveVolt.castShadow, false);
    for (const glass of scene.roomFive.glassPanels) assert.equal(glass.castShadow, false);
    const hulls: THREE.Mesh[] = [], receivers: THREE.Mesh[] = [];
    scene.roomFive.root.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      if (o.name === 'room-5-platform-shadow-hulls') hulls.push(o);
      if (o.userData.shadowProxyReceiver) receivers.push(o);
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      if (materials.every(m => !m.visible || m.transparent)) assert.equal(o.castShadow, false, o.name);
    });
    assert.ok(hulls.length > 0); assert.ok(receivers.length > 0);
    assert.ok(hulls.every(o => o.castShadow && !o.receiveShadow));
    assert.ok(receivers.every(o => !o.castShadow));
    assert.ok(scene.labArt.floor.customProgramCacheKey().includes('finite-light-branch-v1'));
    // Moving decks stay attached to their collider; the normal material receives.
    let decks = 0;
    scene.roomOne.root.traverse(o => { if (o instanceof THREE.Mesh && o.material === scene.labArt.platform) { decks++; assert.equal(o.receiveShadow, true); assert.equal(o.castShadow, true); } });
    assert.ok(decks > 0);
    const keys: THREE.SpotLight[] = [];
    scene.roomThree.root.traverse(o => { if (o instanceof THREE.SpotLight && o.castShadow) keys.push(o); });
    for (const platform of scene.roomThree.collisionMeshes.filter(mesh => mesh.userData.routeOwner === 'bob' && mesh.userData.routeBeat)) {
      const position = platform.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, .71, 0));
      assert.ok(keys.some(key => {
        const origin = key.getWorldPosition(new THREE.Vector3());
        const axis = key.target.getWorldPosition(new THREE.Vector3()).sub(origin).normalize();
        const ray = position.clone().sub(origin);
        return ray.length() < key.distance && ray.normalize().dot(axis) > Math.cos(key.angle);
      }), `${platform.name}: upper Bob route must be inside a fixture cone`);
    }
  } finally { scene.dispose(); }
});

test('role assignment leaves dissolve materials and hidden/transparent/effect exclusions intact', () => {
  const root = new THREE.Group(), geometry = new THREE.BoxGeometry();
  const solid = new THREE.MeshStandardMaterial(), glass = new THREE.MeshStandardMaterial({ transparent: true });
  const hidden = new THREE.MeshStandardMaterial({ visible: false }), effect = new THREE.MeshBasicMaterial();
  const excluded = new THREE.MeshStandardMaterial();
  const meshes = [solid, glass, hidden, effect, excluded].map(m => new THREE.Mesh(geometry, m));
  root.add(...meshes);
  const depth = new THREE.MeshDepthMaterial(), distance = new THREE.MeshDistanceMaterial();
  meshes[0].customDepthMaterial = depth; meshes[0].customDistanceMaterial = distance;
  applyCultivationShadowRoles(root, new Set([excluded]));
  assert.equal(meshes[0].castShadow, true); assert.equal(meshes[0].receiveShadow, true);
  assert.equal(meshes[0].customDepthMaterial, depth); assert.equal(meshes[0].customDistanceMaterial, distance);
  for (const mesh of meshes.slice(1)) assert.deepEqual([mesh.castShadow, mesh.receiveShadow], [false, false]);
  for (const m of [solid, glass, hidden, effect, excluded, depth, distance]) m.dispose();
  geometry.dispose();
});

test('four Blackout hallway maps cover the retained floor and exclude acid/light emitters', () => {
  const bay = new BlackoutMaintenanceBay();
  try {
    const spots: THREE.SpotLight[] = [];
    bay.root.traverse(o => { if (o instanceof THREE.SpotLight) spots.push(o); });
    assert.equal(spots.length, 4);
    assert.ok(spots.every(l => l.castShadow && l.shadow.mapSize.x === 256 && l.distance === 10));
    const floor = bay.root.getObjectByName('hallway-floor') as THREE.Mesh;
    assert.ok(floor.receiveShadow && floor.castShadow);
    const acid = bay.root.getObjectByName('animated-acid-surface') as THREE.Mesh;
    assert.deepEqual([acid.castShadow, acid.receiveShadow], [false, false]);
    for (let z = 54; z <= 74; z += .25) for (const x of [3.2, 6, 8.8]) {
      const position = new THREE.Vector3(x, .5, z);
      assert.ok(spots.some(l => {
        const ray = position.clone().sub(l.position), axis = l.target.position.clone().sub(l.position).normalize();
        return ray.length() < l.distance && ray.normalize().dot(axis) > Math.cos(l.angle);
      }), `hallway coverage at ${x},${z}`);
    }
    for (let i = 1; i <= 4; i++) assert.equal(bay.root.getObjectByName(`hallway-flicker-bulb-${i}`)!.castShadow, false);
  } finally { bay.dispose(); }
});

test('level owners dispose retained spot/point maps once and clear references', () => {
  for (const light of [new THREE.SpotLight(), new THREE.PointLight()]) {
    const map = new THREE.WebGLRenderTarget(1, 1), pass = new THREE.WebGLRenderTarget(1, 1);
    let disposed = 0;
    map.addEventListener('dispose', () => disposed++); pass.addEventListener('dispose', () => disposed++);
    light.shadow.map = map; light.shadow.mapPass = pass;
    disposeShadowLight(light); disposeShadowLight(light);
    assert.equal(disposed, 2); assert.equal(light.shadow.map, null); assert.equal(light.shadow.mapPass, null);
  }
});
