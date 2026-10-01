import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { ContainmentLevelScene } from '../src/levels/ContainmentLevelScene.ts';
import { CollisionWorld } from '../src/physics/CollisionWorld.ts';
import { KinematicBody } from '../src/physics/KinematicBody.ts';
import { DissolveMaterialBundle } from '../src/render/dissolve/DissolveMaterial.ts';
import {
  CONTAINMENT_SHADOW_HANDOFFS,
  CONTAINMENT_SHADOW_SOURCES,
} from '../src/render/environment/containment/ContainmentShadowCoverage.ts';

const createScene = () => new ContainmentLevelScene(() => undefined);
const lights = (scene: ContainmentLevelScene) => Object.keys(CONTAINMENT_SHADOW_SOURCES)
  .map(name => {
    const light = scene.root.getObjectByName(name);
    assert.ok(light instanceof THREE.PointLight || light instanceof THREE.SpotLight, name);
    return light;
  });

function covers(light: THREE.PointLight | THREE.SpotLight, position: THREE.Vector3): boolean {
  if (light instanceof THREE.PointLight) {
    const distance = light.getWorldPosition(new THREE.Vector3()).distanceTo(position);
    return distance >= light.shadow.camera.near && distance < light.distance;
  }
  light.shadow.updateMatrices(light);
  const origin = light.getWorldPosition(new THREE.Vector3());
  const direction = light.target.getWorldPosition(new THREE.Vector3()).sub(origin);
  const offset = position.clone().sub(origin);
  return offset.length() < light.distance && direction.angleTo(offset) < light.angle &&
    light.shadow.getFrustum().containsPoint(position);
}

test('bounded fixed sources cover representative floors, adhesion, ducts and the entire lift', () => {
  const scene = createScene();
  scene.root.updateMatrixWorld(true);
  const sources = lights(scene);
  const route: [number, number, number][] = [
    [-0.2, 0.53, -2.6], [-4.8, 5.8, 5.5],
    [-4.8, 5.8, 9], [-4.8, 6.5, 14], [-4.8, 8.7, 19],
    [-4.8, 10.95, 23.6], [-8.4, 10.95, 26], [-8.4, 10.95, 28.5],
    [-9, 0.46, 31], [4.2, 4.56, 31.1], [14.2, 10.5, 43], [0, 11.5, 47],
    [0, 10.9, 51.5], [11, 12.2, 59], [16.2, 20, 63],
    [10, 22.85, 60.5], [9, 30, 76.2], [9, 31.7, 78.9],
    [9, 75.3, 93], [6.1, 83, 110.3], [19.2, 97.5, 115.6], [-10, 99, 131.25],
    [0, 76.4, 110], [0, 75.4, 122], [0, 75.4, 125],
  ];
  for (let y = 29; y <= 75; y += 0.25) route.push([9, y, 85.5]);
  for (const coordinates of route) {
    const position = new THREE.Vector3(...coordinates);
    scene.lighting.setTraversalPosition(position);
    const visible = new Set(scene.lightingDiagnostics.visibleShadowSourceNames);
    assert.ok(sources.some(light => visible.has(light.name) && covers(light, position)),
      `Missing source coverage at ${coordinates}`);
  }
  for (const light of sources) {
    const authoredPosition = light.position.clone();
    scene.roomFour.elevator.begin();
    scene.roomFour.elevator.update(0.5, []);
    scene.lighting.update(0.5);
    assert.deepEqual(light.position, authoredPosition, 'lights never follow the lift/character');
    assert.equal(light.shadow.camera.far, light.distance);
    assert.ok(light.shadow.camera.far <= 32);
    assert.ok(light.shadow.mapSize.x <= 1024);
  }
  scene.dispose();
});

test('doorway handoffs are continuous, reversible and independent of checkpoint lag', () => {
  const scene = createScene();
  for (const handoff of CONTAINMENT_SHADOW_HANDOFFS) {
    const position = new THREE.Vector3(9, (handoff.minY + handoff.maxY) / 2, handoff.z);
    const left = scene.root.getObjectByName(`containment-room-${handoff.rooms[0]}-lighting-rig`)!;
    const right = scene.root.getObjectByName(`containment-room-${handoff.rooms[1]}-lighting-rig`)!;
    const source = lights(scene).find(light => light.parent === right)!;
    scene.lighting.setActiveRoom(handoff.rooms[0]);
    scene.lighting.setTraversalPosition(position);
    assert.equal(left.visible, true);
    assert.equal(right.visible, true);
    const halfIntensity = source.intensity;
    position.z += 0.001;
    scene.lighting.setTraversalPosition(position);
    assert.ok(Math.abs(source.intensity - halfIntensity) < 0.5);
    scene.lighting.setActiveRoom(handoff.rooms[1]);
    assert.ok(Math.abs(source.intensity - halfIntensity) < 0.5, 'checkpoint activation does not pop the blend');
    position.z = handoff.z + handoff.halfWidth + 0.001;
    scene.lighting.setActiveRoom(handoff.rooms[0]);
    scene.lighting.setTraversalPosition(position);
    assert.deepEqual(scene.lightingDiagnostics.visibleRoomIds, [handoff.rooms[1]]);
    position.z = handoff.z - handoff.halfWidth - 0.001;
    scene.lighting.setTraversalPosition(position);
    assert.deepEqual(scene.lightingDiagnostics.visibleRoomIds, [handoff.rooms[0]]);
  }
  scene.dispose();
});

test('major moving solids remain under their moving owners and exclude effects/colliders', () => {
  const scene = createScene();
  for (const name of [
    'room-4-cargo-elevator-industrial-roof',
    'room-4-cargo-elevator-room5-closed-shutter',
    'room-5-moving-platform-1-production-dressing-durable-clean-tread',
    'room-5-moving-platform-2-production-dressing-durable-clean-tread',
    'room-5-east-ascent-extension-adhesion-membrane',
    'room-3-main-adhesion-replaceable-membrane',
    'room-1-door-bevelled-sliding-slab',
    'room-1-egg-half-broken-lower-shell',
    'room-5-goop-wooden-door',
  ]) {
    const mesh = scene.root.getObjectByName(name);
    assert.ok(mesh instanceof THREE.Mesh, name);
    assert.equal(mesh.castShadow, true, name);
    assert.equal(mesh.receiveShadow, true, name);
    assert.equal(mesh.userData.staticBatchSourceNames, undefined, 'moving/preserved identity is retained');
  }
  const roof = scene.root.getObjectByName('room-4-cargo-elevator-industrial-roof')!;
  const parent = roof.parent;
  const before = roof.getWorldPosition(new THREE.Vector3());
  scene.roomFour.elevator.begin();
  const body = new KinematicBody({ world: new CollisionWorld(), initialPosition: new THREE.Vector3(9, 29, 85.5) });
  scene.roomFour.updateActive(scene.roomFour.elevator.startDelaySeconds + 1,
    body, []);
  assert.equal(roof.parent, parent);
  assert.ok(roof.getWorldPosition(new THREE.Vector3()).y > before.y);
  scene.root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = [object.material].flat();
    if (materials.some(material => material.transparent || !material.visible || /collision-only|signage|gasket|warning-status|specimen-crack/.test(material.name))) {
      assert.equal(object.castShadow, false, object.name);
      assert.equal(object.receiveShadow, false, object.name);
    }
  });
  scene.dispose();
});

test('all source maps are reused on reset and disposed exactly once', () => {
  const scene = createScene();
  const sources = lights(scene);
  let disposals = 0;
  for (const light of sources) {
    const target = light instanceof THREE.PointLight ? new THREE.WebGLCubeRenderTarget(4)
      : new THREE.WebGLRenderTarget(4, 4);
    target.addEventListener('dispose', () => disposals++);
    light.shadow.map = target;
  }
  scene.resetPresentation();
  assert.ok(sources.every(light => light.shadow.map));
  scene.dispose();
  scene.dispose();
  assert.equal(disposals, sources.length);
  assert.ok(sources.every(light => light.shadow.map === null && light.shadow.mapPass === null));
});

test('failed overlap preparation restores spatial weights, state and reflection targets', async () => {
  const scene = createScene();
  scene.lighting.setActiveRoom(4);
  scene.lighting.setTraversalPosition(new THREE.Vector3(9, 75, 91.5));
  scene.cutsceneLighting.setGoopReleaseLightingState('warning');
  const before = scene.lightingDiagnostics;
  const sourceIntensities = lights(scene).map(light => light.intensity);
  await assert.rejects(scene.lighting.prewarmShaderConfigurations(async (_room, rooms) => {
    if (rooms.length === 2) throw new Error('overlap compilation rejected');
  }), /overlap compilation rejected/);
  assert.deepEqual(scene.lightingDiagnostics, before);
  assert.deepEqual(lights(scene).map(light => light.intensity), sourceIntensities);
  scene.dispose();
});

test('static maps reuse depth, vacated silhouettes clear once, and moving owners invalidate both zones', () => {
  const scene = createScene();
  const sources = lights(scene);
  for (const light of sources) {
    light.shadow.map = new THREE.WebGLRenderTarget(4, 4);
    light.shadow.needsUpdate = false; // Simulate a completed hidden preparation draw.
  }
  const lowRun = scene.root.getObjectByName('room-1-to-2-duct-low-run-key') as THREE.SpotLight;
  const pedestal = scene.root.getObjectByName('room-1-pedestal-soft-key') as THREE.SpotLight;
  scene.lighting.prepareShadowFrame([new THREE.Vector3(0, .53, -.5)]);
  assert.equal(pedestal.shadow.autoUpdate, true, 'live wobble continues at a stationary position');
  assert.equal(lowRun.shadow.autoUpdate, false);
  assert.equal(lowRun.shadow.needsUpdate, false);
  scene.lighting.prepareShadowFrame([new THREE.Vector3(-9, .46, 31)]);
  assert.equal(pedestal.shadow.autoUpdate, false);
  assert.equal(pedestal.shadow.needsUpdate, true, 'departed character is removed from cached depth');
  for (const light of sources) light.shadow.needsUpdate = false;
  scene.lighting.prepareShadowFrame([new THREE.Vector3(-9, .46, 31)]);
  assert.equal(pedestal.shadow.needsUpdate, false, 'no recurring empty-zone redraw');
  scene.lighting.prepareShadowFrame([]);
  for (const light of sources) light.shadow.needsUpdate = false;
  scene.roomFour.elevator.begin();
  scene.roomFour.elevator.update(scene.roomFour.elevator.startDelaySeconds + 5, []);
  scene.lighting.prepareShadowFrame([]);
  const lower = scene.root.getObjectByName('room-4-lower-amber-received-light') as THREE.SpotLight;
  const middle = scene.root.getObjectByName('room-4-middle-escalation-received-light') as THREE.SpotLight;
  assert.equal(lower.shadow.needsUpdate, true, 'old lift coverage is invalidated');
  assert.equal(middle.shadow.needsUpdate, true, 'new lift coverage is invalidated');
  for (const light of sources) light.shadow.needsUpdate = false;
  scene.teaching.roomOneArt.setEggState('half-broken');
  scene.lighting.prepareShadowFrame([]);
  assert.equal(pedestal.shadow.needsUpdate, true, 'art variant visibility invalidates cached depth');
  scene.resetPresentation();
  assert.ok(sources.every(light => light.shadow.needsUpdate), 'restart invalidates every retained map');
  scene.dispose();
});

test('dissolve activity borrows the existing mask and clears cached depth at completion', () => {
  const scene = createScene();
  const sources = lights(scene);
  for (const light of sources) {
    light.shadow.map = new THREE.WebGLRenderTarget(4, 4);
    light.shadow.needsUpdate = false;
  }
  const door = scene.roomFive.goopWoodenDoor;
  const sourceMaterial = door.material;
  const bundle = new DissolveMaterialBundle([sourceMaterial].flat(), 'cached-door-test');
  door.material = bundle.surfaceMaterials[0];
  door.customDepthMaterial = bundle.depthMaterial;
  const key = scene.root.getObjectByName('room-5-upper-traversal-received-light') as THREE.SpotLight;
  scene.lighting.prepareShadowFrame([]);
  assert.equal(key.shadow.autoUpdate, false, 'an intact masked door is static');
  bundle.setDissolveAmount(.5);
  scene.lighting.prepareShadowFrame([]);
  assert.equal(key.shadow.autoUpdate, true);
  for (const light of sources) light.shadow.needsUpdate = false;
  bundle.setDissolveAmount(1);
  door.visible = false;
  scene.lighting.prepareShadowFrame([]);
  assert.equal(key.shadow.autoUpdate, false);
  assert.equal(key.shadow.needsUpdate, true, 'the completed silhouette is removed once');
  door.material = sourceMaterial;
  door.customDepthMaterial = undefined;
  bundle.dispose();
  scene.dispose();
});

test('fitted box/instance spheres contain every world vertex without altering measured geometry owners', () => {
  const scene = createScene();
  scene.root.updateMatrixWorld(true);
  let checked = 0;
  scene.root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const sphere = (object as THREE.Mesh & { boundingSphere?: THREE.Sphere }).boundingSphere;
    if (!sphere) return;
    const worldSphere = sphere.clone().applyMatrix4(object.matrixWorld);
    const matrix = new THREE.Matrix4();
    const count = object instanceof THREE.InstancedMesh ? object.count : 1;
    const positions = object.geometry.getAttribute('position');
    for (let instance = 0; instance < count; instance++) {
      if (object instanceof THREE.InstancedMesh) object.getMatrixAt(instance, matrix);
      else matrix.identity();
      matrix.premultiply(object.matrixWorld);
      for (let index = 0; index < positions.count; index++) {
        const point = new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(matrix);
        assert.ok(point.distanceTo(worldSphere.center) <= worldSphere.radius + 1e-5, object.name);
      }
    }
    checked++;
  });
  assert.ok(checked > 100);
  const key = scene.root.getObjectByName('room-1-fluorescent-a-received-light') as THREE.SpotLight;
  key.shadow.updateMatrices(key);
  assert.equal(key.shadow.getFrustum().intersectsObject(scene.root.getObjectByName('room-2-floor-recessed-graphite-bed')!), false);
  assert.equal(key.shadow.getFrustum().intersectsObject(scene.root.getObjectByName('room-4-west-wall-mechanical-substrate')!), false,
    'box culling rejects a distant shaft even when its conservative sphere overlaps');
  assert.equal(scene.measuredFirstUseGeometryPrimeDiagnostics.resourceCount, 23);
  assert.equal(scene.measuredFirstUseGeometryPrimeDiagnostics.instancedResourceCount, 2);
  scene.dispose();
});
