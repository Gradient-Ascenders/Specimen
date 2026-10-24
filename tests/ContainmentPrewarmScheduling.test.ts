import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import * as THREE from 'three';

import type { Input } from '../src/core/Input.ts';
import { ContainmentLevelScene } from '../src/levels/ContainmentLevelScene.ts';
import { GreyboxLevelRuntime } from '../src/levels/GreyboxLevelRuntime.ts';
import { RenderShadowPolicy, type RenderLayer } from '../src/render/RenderLayer.ts';
import type { createDepthPrewarmGroup } from '../src/render/ShadowPrewarmMaterial.ts';

function fixture(parallel: boolean, cancelAt = Infinity) {
  const scene = new THREE.Scene(), level = new ContainmentLevelScene(() => {});
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 300);
  camera.position.set(3, 2, 5); camera.lookAt(0, 1, 0);
  scene.add(level.root);
  const resources = {
    testScene: level, spawnPosition: new THREE.Vector3(0, 0.45, 0), goopSpawnPosition: new THREE.Vector3(2, 0.45, 0),
    slimePairPresentation: { root: new THREE.Group() }, goopAcidPresentation: { root: new THREE.Group() },
  };
  let viewport = new THREE.Vector4(0, 0, 640, 360), scissor = viewport.clone(), scissorTest = false;
  let target: THREE.WebGLRenderTarget | null = null;
  let jobs = 0, jobsThisTurn = 0, maxJobsPerTurn = 0, yields = 0;
  const compiledConfigurations = new Set<string>();
  let configurationsAtFirstDraw = 0;
  const record = () => { jobs++; jobsThisTurn++; maxJobsPerTurn = Math.max(maxJobsPerTurn, jobsThisTurn); };
  const compile = (root: THREE.Object3D) => {
    if (root.name.startsWith('containment-lighting-compile-')) compiledConfigurations.add(root.name);
    record();
  };
  // A submission/scheduling spy, not a WebGL renderer or a GPU benchmark.
  const renderer = {
    transmissionResolutionScale: 0.5, extensions: { has: () => parallel },
    info: { programs: [], memory: { geometries: 0 }, render: { calls: 0, triangles: 0, points: 0, lines: 0 } },
    shadowMap: { enabled: false, autoUpdate: true, needsUpdate: true, type: THREE.PCFShadowMap },
    getPixelRatio: () => 1,
    getViewport: (out: THREE.Vector4) => out.copy(viewport),
    setViewport: (value: THREE.Vector4 | number, y?: number, w?: number, h?: number) => {
      viewport = value instanceof THREE.Vector4 ? value.clone() : new THREE.Vector4(value, y, w, h);
    },
    getScissor: (out: THREE.Vector4) => out.copy(scissor),
    setScissor: (value: THREE.Vector4 | number, y?: number, w?: number, h?: number) => {
      scissor = value instanceof THREE.Vector4 ? value.clone() : new THREE.Vector4(value, y, w, h);
    },
    getScissorTest: () => scissorTest, setScissorTest: (value: boolean) => { scissorTest = value; },
    getRenderTarget: () => target, setRenderTarget: (value: THREE.WebGLRenderTarget | null) => { target = value; },
    getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
    compile, compileAsync: async (root: THREE.Object3D) => compile(root), render: () => {
      if (configurationsAtFirstDraw === 0) configurationsAtFirstDraw = compiledConfigurations.size;
      assert.ok(target instanceof THREE.WebGLRenderTarget, 'background warm-up must never render into the visible canvas');
      record();
    },
  };
  const policy = new RenderShadowPolicy(renderer.shadowMap);
  const layer = { scene, cameraRig: { camera }, renderer, withShadowPreparation: policy.withPreparation.bind(policy),
    getGameplayPrewarmViewport: (out: THREE.Vector4) => out.set(0, 0, 640, 360) };
  const snapshot = () => ({ viewport: viewport.toArray(), scissor: scissor.toArray(), scissorTest, target,
    transmission: renderer.transmissionResolutionScale, shadow: { ...renderer.shadowMap } });
  const before = snapshot(), cameraPosition = camera.position.clone(), cameraRotation = camera.quaternion.clone();
  const runtime = new GreyboxLevelRuntime({
    host: { dataset: {} } as HTMLElement, input: {} as Input, renderLayer: layer as unknown as RenderLayer,
    window: { performance } as unknown as Window, debugAvailable: false,
    yieldPreparation: async () => {
      assert.deepEqual(snapshot(), before, 'Restore renderer state before letting the opening paint.');
      assert.ok(camera.position.equals(cameraPosition) && camera.quaternion.equals(cameraRotation));
      jobsThisTurn = 0; yields++;
      if (yields === cancelAt) probe.lightingPrewarmGeneration++;
    },
  });
  const probe = runtime as unknown as {
    resources: typeof resources;
    lightingPrewarmGeneration: number;
    depthPrewarmGroups: ReturnType<typeof createDepthPrewarmGroup>[];
    runLightingPrewarm(resources: typeof resources, generation: number): Promise<void>;
  };
  probe.resources = resources; probe.lightingPrewarmGeneration = 1;
  return { runtime, probe, resources, snapshot, before, level,
    counts: () => ({ jobs, yields, maxJobsPerTurn, configurationsAtFirstDraw }),
    dispose: () => { for (const batch of probe.depthPrewarmGroups) batch.dispose(); level.dispose(); policy.dispose(); },
  };
}

for (const parallel of [false, true]) test(`Level 1 prewarm yields between GPU jobs without dropping measured coverage (parallel ${parallel})`, async () => {
  const f = fixture(parallel);
  try {
    await f.probe.runLightingPrewarm(f.resources, 1);
    assert.deepEqual(f.snapshot(), f.before);
    assert.ok(f.counts().jobs > 80, 'Exercise the complete room, overlap, fade, alternate-view and final priming sequence.');
    assert.equal(f.counts().maxJobsPerTurn, 1, 'An entire room must not monopolize one cinematic frame.');
    assert.ok(f.counts().yields >= f.counts().jobs);
    assert.equal(f.counts().configurationsAtFirstDraw, 9,
      'Submit all room and doorway variants before a first-use draw can force shader synchronization.');
    assert.equal(f.level.measuredFirstUseGeometryPrimeDiagnostics.resourceCount, 23);
    assert.equal(f.level.measuredFirstUseGeometryPrimeDiagnostics.resourcesPrimed, true);
    assert.equal(f.runtime.levelOnePrewarmVerification?.measuredProgramDelta, 0);
    assert.ok(f.runtime.levelOnePrewarmVerification!.roomStepsCompleted >= 5);
  } finally { f.dispose(); }
});

test('invalidating the level at a yield cancels later GPU jobs and leaves the cinematic renderer restored', async () => {
  const f = fixture(false, 3);
  try {
    await f.probe.runLightingPrewarm(f.resources, 1);
    assert.equal(f.counts().jobs, 2);
    assert.deepEqual(f.snapshot(), f.before);
    assert.equal(f.level.measuredFirstUseGeometryPrimeDiagnostics.resourcesPrimed, false);
    assert.equal(f.runtime.levelOnePrewarmVerification, undefined);
  } finally { f.dispose(); }
});
