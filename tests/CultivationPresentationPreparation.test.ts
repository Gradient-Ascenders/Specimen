import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { LevelTwoPreviewScene } from '../src/levels/LevelTwoPreviewScene.ts';
import { CultivationPreparationQueue } from '../src/render/CultivationPreparationQueue.ts';
import { CultivationLightLayout } from '../src/render/CultivationLightLayout.ts';
import { RenderShadowPolicy, type RenderLayer } from '../src/render/RenderLayer.ts';

for (const mode of ['jump', 'lift', 'failure', 'startup']) test(`loading preparation preserves scene and renderer ownership (${mode})`, async context => {
  const fail = mode === 'failure';
  const preview = new LevelTwoPreviewScene(() => {}), scene = new THREE.Scene(); scene.add(preview.root);
  const shared = new THREE.MeshStandardMaterial(), shape = new THREE.BoxGeometry();
  const ordinary = new THREE.Mesh(shape, shared), instanced = new THREE.InstancedMesh(shape, shared, 1);
  ordinary.name = instanced.name = 'variant-regression'; scene.add(ordinary, instanced);
  const foundation = new THREE.Group(); foundation.name = 'cultivation-level-2-foundation';
  const foundationMaterial = new THREE.MeshBasicMaterial({transparent:true, opacity:.32});
  const foundationMesh = new THREE.Mesh(shape, foundationMaterial); foundationMesh.name = 'visible-foundation-regression';
  foundation.add(foundationMesh); scene.add(foundation);
  const gel = new THREE.MeshPhysicalMaterial({transmission: .28, transparent:true});
  const body = new THREE.Mesh(shape, gel); body.name = 'Bob-Body'; body.castShadow = true; scene.add(body);
  const renderTarget = new THREE.WebGLRenderTarget(4, 4);
  const reflectiveMaterial = new THREE.MeshStandardMaterial({
    envMap: renderTarget.texture,
  });
  const reflective = new THREE.Mesh(shape, reflectiveMaterial);
  reflective.name = 'render-target-texture-regression';
  scene.add(reflective);
  const hidden = new THREE.Mesh(shape, new THREE.MeshBasicMaterial({visible:false}));
  hidden.name = 'hidden-collider-regression'; scene.add(hidden);
  const projectile = new THREE.InstancedMesh(shape, new THREE.MeshBasicMaterial(), 1);
  projectile.name = 'room-four-projectile-regression'; projectile.userData.presentationRoom = 4; scene.add(projectile);
  const preparedOwners = new Set<string>();
  const mapsInShadow = new Set<boolean>();
  const mappedMaterial = new THREE.MeshStandardMaterial({map:new THREE.Texture()});
  const mappedCaster = new THREE.InstancedMesh(shape, mappedMaterial, 1);
  const plainCaster = new THREE.InstancedMesh(shape, shared, 1);
  mappedCaster.name = plainCaster.name = 'shadow-map-regression';
  mappedCaster.castShadow = plainCaster.castShadow = true; preview.roomFive.root.add(mappedCaster, plainCaster);
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
  const initializedTextures = new Set<THREE.Texture>();
  const initializedShadowTargets = new Set<THREE.WebGLRenderTarget>();
  const disposedShadowTargets = new Set<THREE.WebGLRenderTarget>();
  const disposedShadowTextures = new Set<THREE.Texture>();
  const shadowLayouts = new Set<string>();
  let holdNextCompile = false;
  let releaseCompile: (() => void) | undefined;
  const priorRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = callback => { setTimeout(() => callback(performance.now()), 0); return 0; };
  const renderer = {
    extensions: {has: () => mode !== 'lift'},
    shadowMap: { enabled: false, autoUpdate: true, needsUpdate: false, type: THREE.BasicShadowMap as THREE.ShadowMapType },
    getRenderTarget: () => null, setRenderTarget() {}, properties: {get: () => ({})},
    getViewport: (out: THREE.Vector4) => out.copy(viewport), getScissor: (out: THREE.Vector4) => out.copy(scissor), getScissorTest: () => scissorTest,
    setViewport: (x: THREE.Vector4 | number, y?: number, w?: number, h?: number) => { viewport = x instanceof THREE.Vector4 ? x.clone() : new THREE.Vector4(x, y!, w!, h!); },
    setScissor: (x: THREE.Vector4 | number, y?: number, w?: number, h?: number) => { scissor = x instanceof THREE.Vector4 ? x.clone() : new THREE.Vector4(x, y!, w!, h!); },
    setScissorTest: (value: boolean) => { scissorTest = value; },
    initTexture(texture: THREE.Texture) { initializedTextures.add(texture); },
    initRenderTarget(target: THREE.WebGLRenderTarget) {
      initializedShadowTargets.add(target);
      target.addEventListener('dispose', () => disposedShadowTargets.add(target));
      const texture = target.depthTexture!;
      texture.addEventListener('dispose', () => disposedShadowTextures.add(texture));
    },
    getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
    info: {render: {calls: 0, triangles: 0, points: 0, lines: 0, frame: 0}},
    compile() {},
    render(preparedScene: THREE.Scene) {
      preparedScene.traverseVisible(object => {
        if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshPhysicalMaterial) {
          assert.equal(object.material.transmission, 0, 'temporary scenes must not allocate Bob transmission targets');
        }
      });
      if (!renderer.shadowMap.enabled) return;
      preparedScene.traverseVisible(object => {
        if (!(object instanceof THREE.SpotLight || object instanceof THREE.PointLight) || !object.castShadow) return;
        const texture = object.shadow.map?.depthTexture;
        assert.ok(texture, 'shadow-enabled preparation must provide depth textures for its samplers');
        assert.ok(initializedShadowTargets.has(object.shadow.map!), 'depth attachments must be initialized before drawing receivers');
        assert.equal(texture.compareFunction, THREE.LessEqualCompare, 'PCF samplers need comparison-enabled depth textures');
        assert.equal(!!texture.isCubeTexture, object instanceof THREE.PointLight, 'point-light shadows need cube depth textures');
      });
    },
    async compileAsync(group: THREE.Group, _camera: THREE.Camera, targetScene: THREE.Scene) {
      group.traverse(o => {
        preparedOwners.add(o.name);
        if (o instanceof THREE.Mesh && o.name === 'shadow-map-regression' &&
          (o.material instanceof THREE.MeshDepthMaterial || o.material instanceof THREE.MeshDistanceMaterial)) mapsInShadow.add(!!o.material.map);
      });
      if (group.children.some(o => o instanceof THREE.Mesh &&
        (o.material instanceof THREE.MeshDepthMaterial || o.material instanceof THREE.MeshDistanceMaterial))) {
        assert.equal(targetScene.fog, null, 'real shadow draws use the empty scene, without visible-pass fog');
        assert.equal(targetScene.environment, null, 'custom depth/distance programs do not borrow visible-pass environment');
        const lights: THREE.Light[] = [];
        targetScene.traverseVisible(o => { if (o instanceof THREE.Light) lights.push(o); });
        assert.ok(lights.some(light => light.castShadow), 'retain the live shadow-light layout');
        assert.equal(lights.some(light => light.type === 'Light'), false, 'do not warm an unused empty-light shadow layout');
        shadowLayouts.add('live-layout');
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
  const policy = new RenderShadowPolicy(renderer.shadowMap);
  const layer = { scene, renderer, withShadowPreparation: policy.withPreparation.bind(policy), cameraRig: { camera: new THREE.PerspectiveCamera() } } as unknown as RenderLayer;
  const queue = new CultivationPreparationQueue(layer, preview);
  try {
    const work = mode === 'startup' ? queue.prepareStartup() : queue.prepareInitial();
    if (fail) await assert.rejects(work, /driver rejected/); else await work;
    assert.ok(compiles > 0);
    if (!fail) assert.ok(preparedOwners.has('Bob-Body'), 'transmissive body still enters shader preparation');
    if (!fail) assert.ok(preparedOwners.has(foundationMesh.name), 'visible foundation meshes need every authored room signature');
    assert.equal(
      initializedTextures.has(renderTarget.texture),
      false,
      'render-target textures stay owned by their render target',
    );
    assert.equal(preparedOwners.has(hidden.name), false, 'hidden collider materials never enter the compiler');
    if (!fail) assert.equal(preparedOwners.has(projectile.name), mode === 'startup', 'projectile preparation follows its owning room');
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
          for (let i = 0; i < 1000 && queue.diagnostics.completed < 3; i++) {
            now += 51; queue.anticipateLiftExit(); queue.tick(40);
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
      assert.equal(queue.diagnostics.completed, mode === 'lift' ? 3 : 2, 'earlier background work remains suspended until the lift and Room 5 are ready');
      assert.equal(queue.diagnostics.configurations[mode === 'lift' ? 2 : 1].z, 230);
      if (mode === 'lift') {
        assert.equal(queue.diagnostics.configurations[1].dark, false, 'prepare the ordinary lift layout before its exit');
        assert.equal(queue.diagnostics.configurations[2].dark, true, 'then prepare the maintenance room');
        preview.roomFour.controller.update(1.5, true, true);
        preview.updatePresentationVisibility({z:237}, {z:237}); lighting.sync(scene);
        assert.equal(queue.requireCurrent(false), true, 'the camera can return to the lift without loading at braking');
        preview.updatePresentationVisibility({z:251}, {z:251}); lighting.sync(scene);
      }
      preview.updatePresentationVisibility({z:270}, {z:270});
      lighting.sync(scene);
      // An explicitly different, unprepared light layout must not reuse arrival.
      preview.roomFour.root.visible = false;
      const extraLight = new THREE.SpotLight(); scene.add(extraLight);
      assert.equal(queue.requireCurrent(true), false, 'different lighting still requires preparation');
      extraLight.removeFromParent();
      preview.updatePresentationVisibility({z:270}, {z:270}); lighting.sync(scene);
      const beforeReuse = compiles;
      assert.equal(queue.requireCurrent(true), true, 'culling the lift geometry preserves the prepared light layout');
      assert.equal(compiles, beforeReuse, 'Room 5 reuses the arrival shaders');
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
      assert.deepEqual(mapsInShadow, new Set([true, false]), 'mapped and unmapped shadows are both prepared');
    }
    if (mode === 'startup') {
      assert.deepEqual(shadowLayouts, new Set(['live-layout']));
      assert.deepEqual(mapsInShadow, new Set([true, false]));
      assert.equal(queue.diagnostics.completed, 2, 'startup prepares initial and the shared lift/encounter layout');
      // Startup already prepared Room 5. Prioritize the smaller, bright lift
      // layout during approach/ride instead of waiting for unrelated rooms.
      let now = performance.now();
      const clock = context.mock.method(performance, 'now', () => now += .001);
      try {
        for (let i = 0; i < 1000 && queue.diagnostics.completed < 3; i++) {
          now += 51; queue.anticipateLiftExit(); queue.tick(40);
          assert.equal(queue.diagnostics.pending, false, 'anticipated work stays in background');
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      } finally { clock.mock.restore(); }
      assert.equal(queue.diagnostics.completed, 3, 'the lift is ready before braking');
      assert.equal(queue.diagnostics.configurations[2].dark, false);
      const preparedCompiles = compiles;
      // The orbiting lift camera can expose Room 5 before its dark-room
      // lighting starts. Exercise the real arrival states, not only a debug
      // restore directly into the completed (dark) elevator.
      preview.roomFour.controller.update(1.5, true, true);
      for (const dt of [59, 1, 1.5]) {
        preview.roomFour.controller.update(dt, true, true);
        for (const cameraZ of [237, 251]) {
          preview.updatePresentationVisibility({z:cameraZ}, {z:237}); lighting.sync(scene);
          const dark = preview.roomFour.controller.readModel.state === 'complete';
          assert.equal(queue.requireCurrent(dark), true, `lift exit is ready during ${preview.roomFour.controller.readModel.state} with camera at ${cameraZ}`);
          assert.equal(queue.diagnostics.pending, false, 'brightness changes do not repeat GPU preparation');
        }
      }
      for (let z = 241; z <= 249; z += .1) {
        preview.updatePresentationVisibility({z: z - 5.2}, {z}); lighting.sync(scene);
        assert.equal(queue.requireCurrent(true), true, `vent entrance is ready with the camera trailing at ${z}`);
      }
      for (const z of [251, 270, 251, 270]) {
        preview.updatePresentationVisibility({z}, {z}); lighting.sync(scene);
        assert.equal(queue.requireCurrent(true), true, 'Room 5 jump and lift exit are ready before gameplay');
        assert.equal(queue.diagnostics.pending, false);
      }
      assert.equal(compiles, preparedCompiles, 'jumps do not launch another compiler pass');
      for (const old of snapshots) old.object.visible = old.visible;
    }
    assert.deepEqual(viewport.toArray(), [0, 0, 1280, 720]); assert.deepEqual(scissor.toArray(), viewport.toArray());
    assert.equal(scissorTest, false); assert.equal(renderer.shadowMap.enabled, false); assert.equal(renderer.shadowMap.type, THREE.PCFShadowMap);
    const after: THREE.Object3D[] = []; scene.traverse(o => after.push(o)); assert.deepEqual(after, objects);
    for (const old of snapshots) { assert.equal(old.object.parent, old.parent); assert.equal(old.object.visible, old.visible); assert.deepEqual(old.object.position.toArray(), old.position); assert.deepEqual(old.object.quaternion.toArray(), old.quaternion); }
    assert.equal(destroyed, 0, 'loading must not dispose borrowed geometry');
  } finally {
    queue.dispose(); lighting.dispose(); preview.dispose(); shape.dispose(); shared.dispose(); depth.dispose(); distance.dispose();
    reflectiveMaterial.dispose(); renderTarget.dispose();
    gel.dispose();
    foundationMaterial.dispose();
    hidden.material.dispose(); projectile.material.dispose(); mappedMaterial.map!.dispose(); mappedMaterial.dispose();
    mappedCaster.dispose(); plainCaster.dispose(); projectile.dispose();
    globalThis.requestAnimationFrame = priorRaf;
  }
  assert.deepEqual(disposedShadowTargets, initializedShadowTargets, 'temporary shadow maps are released after completion or cancellation');
  assert.equal(disposedShadowTextures.size, initializedShadowTargets.size, 'temporary depth attachments are released too');
});
