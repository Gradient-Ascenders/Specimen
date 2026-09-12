import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { LevelTwoPreviewScene } from '../src/levels/LevelTwoPreviewScene.ts';
import { CultivationPreparationQueue } from '../src/render/CultivationPreparationQueue.ts';
import { CultivationLightLayout } from '../src/render/CultivationLightLayout.ts';
import type { RenderLayer } from '../src/render/RenderLayer.ts';

for (const mode of ['jump', 'lift', 'failure', 'startup']) test(`loading preparation preserves scene and renderer ownership (${mode})`, async context => {
  const fail = mode === 'failure';
  const preview = new LevelTwoPreviewScene(() => {}), scene = new THREE.Scene(); scene.add(preview.root);
  const shared = new THREE.MeshStandardMaterial(), shape = new THREE.BoxGeometry();
  const ordinary = new THREE.Mesh(shape, shared), instanced = new THREE.InstancedMesh(shape, shared, 1);
  ordinary.name = instanced.name = 'variant-regression'; scene.add(ordinary, instanced);
  const variants = new Set<THREE.Material>();
  const shadowCaster = new THREE.Mesh(shape, shared); shadowCaster.castShadow = true;
  const depth = new THREE.MeshDepthMaterial(), distance = new THREE.MeshDistanceMaterial();
  depth.customProgramCacheKey = () => 'custom-depth-regression'; distance.customProgramCacheKey = () => 'custom-distance-regression';
  shadowCaster.customDepthMaterial = depth; shadowCaster.customDistanceMaterial = distance; preview.roomFive.root.add(shadowCaster);
  const searchlight = new THREE.SpotLight(); searchlight.castShadow = true; preview.roomFive.root.add(searchlight);
  const lighting = new CultivationLightLayout(scene);
  const shadowVariants = new Set<string>();
  const objects: THREE.Object3D[] = []; scene.traverse(o => objects.push(o));
  const snapshots = objects.map(o => ({ object: o, parent: o.parent, visible: o.visible, position: o.position.toArray(), quaternion: o.quaternion.toArray() }));
  let destroyed = 0;
  const geometries = new Set<THREE.BufferGeometry>();
  scene.traverse(o => { if (o instanceof THREE.Mesh) geometries.add(o.geometry); });
  for (const geometry of geometries) geometry.addEventListener('dispose', () => destroyed++);
  let viewport = new THREE.Vector4(0, 0, 1280, 720), scissor = viewport.clone(), scissorTest = false;
  let compiles = 0;
  const shadowLayouts = new Set<string>();
  let holdNextCompile = false;
  let releaseCompile: (() => void) | undefined;
  const priorRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = callback => { setTimeout(() => callback(performance.now()), 0); return 0; };
  const renderer = {
    extensions: {has: () => mode !== 'lift'},
    shadowMap: { enabled: false, autoUpdate: true, type: THREE.BasicShadowMap as THREE.ShadowMapType },
    getRenderTarget: () => null, setRenderTarget() {}, properties: {get: () => ({})},
    getViewport: (out: THREE.Vector4) => out.copy(viewport), getScissor: (out: THREE.Vector4) => out.copy(scissor), getScissorTest: () => scissorTest,
    setViewport: (x: THREE.Vector4 | number, y?: number, w?: number, h?: number) => { viewport = x instanceof THREE.Vector4 ? x.clone() : new THREE.Vector4(x, y!, w!, h!); },
    setScissor: (x: THREE.Vector4 | number, y?: number, w?: number, h?: number) => { scissor = x instanceof THREE.Vector4 ? x.clone() : new THREE.Vector4(x, y!, w!, h!); },
    setScissorTest: (value: boolean) => { scissorTest = value; }, initTexture() {}, compile() {}, render() {},
    async compileAsync(group: THREE.Group, _camera: THREE.Camera, targetScene: THREE.Scene) {
      if (group.children.some(o => o instanceof THREE.Mesh &&
        (o.material instanceof THREE.MeshDepthMaterial || o.material instanceof THREE.MeshDistanceMaterial))) {
        const lights: THREE.Light[] = [];
        targetScene.traverseVisible(o => { if (o instanceof THREE.Light) lights.push(o); });
        if (lights.length === 1 && lights[0].type === 'Light') {
          shadowLayouts.add('first-frame');
          assert.equal(lights[0].intensity, 0);
          assert.equal(lights[0].castShadow, true, 'retain the shadow-pass shader define');
          assert.equal(targetScene.fog, null); assert.equal(targetScene.environment, null);
        } else shadowLayouts.add('following-frame');
      }
      group.traverse(o => { if (o instanceof THREE.Mesh && !Array.isArray(o.material)) shadowVariants.add(o.material.customProgramCacheKey()); if (o instanceof THREE.Mesh && o.name === 'variant-regression') variants.add(o.material as THREE.Material); });
      compiles++;
      if (fail) throw new Error('driver rejected preparation');
      if (holdNextCompile) {
        holdNextCompile = false;
        await new Promise<void>(resolve => { releaseCompile = resolve; });
      }
    },
  };
  const layer = { scene, renderer, cameraRig: { camera: new THREE.PerspectiveCamera() } } as unknown as RenderLayer;
  const queue = new CultivationPreparationQueue(layer, preview);
  try {
    const work = mode === 'startup' ? queue.prepareStartup() : queue.prepareInitial();
    if (fail) await assert.rejects(work, /driver rejected/); else await work;
    assert.ok(compiles > 0);
    if (!fail && mode !== 'startup') { assert.equal(variants.size, 2, 'ordinary and instanced meshes must each await their shader variant'); assert.equal(queue.diagnostics.completed, 1); assert.ok(queue.diagnostics.total > 1);
      const before = compiles; queue.tick(40); assert.equal(compiles, before, "an expensive gameplay frame defers background work");
      if (mode !== 'lift') {
        await new Promise(resolve => setTimeout(resolve, 260));
        const beforeSlowFrame = queue.diagnostics.workMs;
        queue.tick(40);
        assert.ok(queue.diagnostics.workMs > beforeSlowFrame, 'sustained low frame rates must not starve background preparation');
      }
    }
    if (!fail && mode !== 'startup') {
      // Jump into Room 5 while an earlier room is already compiling. Its
      // in-flight batch must settle, then Room 5 must finish before that room.
      holdNextCompile = true;
      const holdDeadline = performance.now() + 5000;
      while (!releaseCompile && performance.now() < holdDeadline) {
        queue.tick(0, true); await new Promise(resolve => setTimeout(resolve, 0));
      }
      assert.ok(releaseCompile, 'background preparation reaches an asynchronous batch');
      if (mode === 'lift') queue.anticipateLiftExit();
      else {
        preview.updatePresentationVisibility({z:251}, {z:251});
        lighting.sync(scene);
        assert.equal(queue.requireCurrent(true), false);
      }
      const heldCompiles = compiles;
      queue.tick(0, true);
      assert.equal(compiles, heldCompiles, 'do not overlap a pending compiler batch');
      releaseCompile();
      if (mode === 'lift') {
        // Exercise slow-frame background slices without KHR_parallel_shader_compile.
        // Advance a bounded clock so this regression need not wait out a whole ride.
        let now = performance.now();
        const clock = context.mock.method(performance, 'now', () => now += .001);
        try {
          for (let i = 0; i < 1000 && queue.diagnostics.completed < 2; i++) {
            now += 51; queue.tick(40);
            assert.equal(queue.diagnostics.pending, false, 'preparing the destination must not block the lift');
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        } finally { clock.mock.restore(); }
        preview.updatePresentationVisibility({z:251}, {z:251});
        lighting.sync(scene);
      } else {
        const priorityDeadline = performance.now() + 10000;
        while (!queue.requireCurrent(true) && performance.now() < priorityDeadline) {
          queue.tick(0, true); await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      assert.equal(queue.requireCurrent(true), true, 'the requested room finishes');
      assert.equal(queue.diagnostics.completed, 2, 'earlier background work remains suspended until Room 5 is ready');
      assert.equal(queue.diagnostics.configurations[1].z, 230);
      preview.updatePresentationVisibility({z:270}, {z:270});
      lighting.sync(scene);
      const extraLight = new THREE.SpotLight(); scene.add(extraLight);
      assert.equal(queue.requireCurrent(true), false, 'different lighting still requires preparation');
      extraLight.removeFromParent();
      const beforeReuse = compiles;
      assert.equal(queue.requireCurrent(true), true, 'leaving the lift reuses the prepared Room 5 assets and lighting');
      assert.equal(compiles, beforeReuse, 'a covered visibility change needs no compiler work');
      assert.equal(queue.diagnostics.reused, 1);
      assert.equal(queue.diagnostics.pending, false, 'exploration does not show another loading screen');
      for (const old of snapshots) old.object.visible = old.visible;
      const deadline = performance.now() + 30000;
      while (queue.diagnostics.completed < queue.diagnostics.total && performance.now() < deadline) {
        queue.tick(0, true); await new Promise(resolve => setTimeout(resolve, 0));
      }
      assert.equal(queue.diagnostics.completed, queue.diagnostics.total);
      assert.equal(queue.diagnostics.configurations.filter(c => c.z === 26).length, 1,
        'suspended preparation resumes and completes exactly once');
      assert.ok(shadowVariants.has('custom-depth-regression'), 'custom dissolve depth shaders are prepared');
      assert.ok(shadowVariants.has('custom-distance-regression'), 'custom dissolve point-shadow shaders are prepared');
    }
    if (mode === 'startup') {
      assert.deepEqual(shadowLayouts, new Set(['first-frame', 'following-frame']));
      assert.equal(queue.diagnostics.completed, 2, 'startup prepares the initial view and lift/maintenance superset');
      const preparedCompiles = compiles;
      for (const z of [251, 270, 251, 270]) {
        preview.updatePresentationVisibility({z}, {z}); lighting.sync(scene);
        assert.equal(queue.requireCurrent(true), true, 'Room 5 jump and lift exit are ready before gameplay');
        assert.equal(queue.diagnostics.pending, false);
      }
      assert.equal(compiles, preparedCompiles, 'jumps do not launch another compiler pass');
      for (const old of snapshots) old.object.visible = old.visible;
    }
    assert.deepEqual(viewport.toArray(), [0, 0, 1280, 720]); assert.deepEqual(scissor.toArray(), viewport.toArray());
    assert.equal(scissorTest, false); assert.equal(renderer.shadowMap.enabled, false); assert.equal(renderer.shadowMap.type, THREE.BasicShadowMap);
    const after: THREE.Object3D[] = []; scene.traverse(o => after.push(o)); assert.deepEqual(after, objects);
    for (const old of snapshots) { assert.equal(old.object.parent, old.parent); assert.equal(old.object.visible, old.visible); assert.deepEqual(old.object.position.toArray(), old.position); assert.deepEqual(old.object.quaternion.toArray(), old.quaternion); }
    assert.equal(destroyed, 0, 'loading must not dispose borrowed geometry');
  } finally { queue.dispose(); lighting.dispose(); preview.dispose(); shape.dispose(); shared.dispose(); depth.dispose(); distance.dispose(); globalThis.requestAnimationFrame = priorRaf; }
});
