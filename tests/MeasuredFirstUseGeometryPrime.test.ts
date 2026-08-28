import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  ContainmentLevelScene,
  MEASURED_FIRST_USE_GEOMETRY_OWNER_NAMES,
} from '../src/levels/ContainmentLevelScene.ts';
import { renderIsolatedPrewarmResources } from '../src/render/IsolatedResourcePrewarm.ts';

const EXPECTED_EVENT_A_OWNERS = [
  'room-2-upper-step-b-durable-composite-tread',
  'room-2-production-art-static-batch-16',
  'duct-segment-c-floor-main',
  'duct-final-run-floor',
  'room-2-upper-longitudinal-service-spine',
  'room-2-production-art-static-batch-17',
  'room-2-upper-step-b-restrained-safety-inlays',
] as const;

const EXPECTED_EVENT_B_OWNERS = [
  'room-3-panel-east-upper-entry',
  'room-1-containment-overhead-service-coupler',
  'room-2-panel-east-upper-south',
  'room-2-production-art-static-batch-14',
  'room-3-production-art-static-batch-18',
  'room-3-production-art-static-batch-20',
  'room-1-production-art-static-batch-1',
  'room-2-production-art-static-batch-15',
  'room-3-production-art-static-batch-19',
  'room-3-production-art-static-batch-21',
  'room-4-north-recessed-ventilation-module',
  'room-1-vent-route-identifier-backing',
  'room-2-ascent-route-identifier-backing',
  'room-1-vent-route-identifier',
  'room-2-ascent-route-identifier',
  'room-3-production-art-static-batch-28',
] as const;

test('measured first-use prime exposes only the 23 physical-Iris resources', () => {
  assert.deepEqual(
    MEASURED_FIRST_USE_GEOMETRY_OWNER_NAMES.eventA,
    EXPECTED_EVENT_A_OWNERS,
  );
  assert.deepEqual(
    MEASURED_FIRST_USE_GEOMETRY_OWNER_NAMES.eventB,
    EXPECTED_EVENT_B_OWNERS,
  );

  const scene = new ContainmentLevelScene(() => undefined);
  const before = scene.measuredFirstUseGeometryPrimeDiagnostics;
  assert.deepEqual(before.ownerNames, [
    ...EXPECTED_EVENT_A_OWNERS,
    ...EXPECTED_EVENT_B_OWNERS,
  ]);
  assert.equal(before.resourceCount, 23);
  assert.equal(before.uniqueGeometryCount, 23);
  assert.equal(before.instancedResourceCount, 2);
  assert.equal(before.resourcesPrimed, false);
  assert.equal(before.resourcePrimeCount, 0);

  assert.throws(
    () =>
      scene.primeMeasuredFirstUseGeometryResources(() => {
        throw new Error('synthetic render failure');
      }),
    /synthetic render failure/,
  );
  assert.equal(
    scene.measuredFirstUseGeometryPrimeDiagnostics.resourcesPrimed,
    false,
  );

  let primeDraws = 0;
  assert.equal(
    scene.primeMeasuredFirstUseGeometryResources((resources) => {
      primeDraws += 1;
      assert.equal(resources.length, 23);
      assert.deepEqual(
        resources.map(({ name }) => name),
        before.ownerNames,
      );
      assert.equal(new Set(resources).size, 23);
      assert.equal(
        new Set(resources.map(({ geometry }) => geometry)).size,
        23,
      );
      assert.ok(resources.every((resource) => resource.parent !== null));
      const instancedResources = resources.filter(
        (resource): resource is THREE.InstancedMesh =>
          resource instanceof THREE.InstancedMesh,
      );
      assert.deepEqual(
        instancedResources.map(({ name }) => name).sort(),
        [
          'room-1-production-art-static-batch-1',
          'room-2-upper-step-b-restrained-safety-inlays',
        ],
      );
      assert.ok(
        instancedResources.every(
          ({ instanceMatrix, count }) =>
            instanceMatrix.count >= count && instanceMatrix.array.byteLength > 0,
        ),
      );
    }),
    true,
  );

  const after = scene.measuredFirstUseGeometryPrimeDiagnostics;
  assert.equal(primeDraws, 1);
  assert.equal(after.resourcesPrimed, true);
  assert.equal(after.resourcePrimeCount, 1);
  assert.equal(
    scene.primeMeasuredFirstUseGeometryResources(() => {
      primeDraws += 1;
    }),
    false,
  );
  assert.equal(primeDraws, 1);
  scene.dispose();
});

test('isolated resource prewarm restores camera, light and renderable state', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  camera.layers.set(3);
  const target = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial(),
  );
  target.name = 'measured-target';
  target.layers.set(5);
  target.frustumCulled = true;
  const unrelated = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial(),
  );
  unrelated.name = 'unrelated';
  unrelated.layers.set(7);
  const light = new THREE.PointLight();
  light.layers.set(3);
  scene.add(target, unrelated, light);

  const initialCameraLayers = camera.layers.mask;
  const initialTargetLayers = target.layers.mask;
  const initialTargetFrustumCulled = target.frustumCulled;
  const initialTargetVisible = target.visible;
  const initialUnrelatedLayers = unrelated.layers.mask;
  const initialLightLayers = light.layers.mask;
  let renderCalls = 0;
  const renderer = {
    render(renderedScene: THREE.Scene, renderedCamera: THREE.Camera): void {
      renderCalls += 1;
      assert.equal(renderedScene, scene);
      assert.equal(renderedCamera, camera);
      assert.equal(camera.layers.mask, 2 ** 31);
      assert.equal(target.layers.mask, 2 ** 31);
      assert.equal(target.frustumCulled, false);
      assert.equal(target.visible, initialTargetVisible);
      assert.equal(unrelated.layers.mask, initialUnrelatedLayers);
      assert.ok(light.layers.isEnabled(31));
    },
  } as unknown as THREE.WebGLRenderer;

  renderIsolatedPrewarmResources(renderer, scene, camera, [target]);

  assert.equal(renderCalls, 1);
  assert.equal(camera.layers.mask, initialCameraLayers);
  assert.equal(target.layers.mask, initialTargetLayers);
  assert.equal(target.frustumCulled, initialTargetFrustumCulled);
  assert.equal(target.visible, initialTargetVisible);
  assert.equal(unrelated.layers.mask, initialUnrelatedLayers);
  assert.equal(light.layers.mask, initialLightLayers);
  target.geometry.dispose();
  unrelated.geometry.dispose();
  (target.material as THREE.Material).dispose();
  (unrelated.material as THREE.Material).dispose();
  light.dispose();
});
